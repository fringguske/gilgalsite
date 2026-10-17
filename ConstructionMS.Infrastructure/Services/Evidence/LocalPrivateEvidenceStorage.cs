namespace ConstructionMS.Infrastructure.Services.Evidence;

using ConstructionMS.Application.Configuration;
using ConstructionMS.Application.DTOs.Evidence;
using ConstructionMS.Application.Services.Evidence;
using Microsoft.Extensions.Options;
using System.Buffers;
using System.Security.Cryptography;
using System.Text;

public sealed class LocalPrivateEvidenceStorage : IEvidenceStorage
{
    private const int CopyBufferSize = 64 * 1024;
    private const int SignatureLength = 16;
    private readonly string _rootPath;
    private readonly string _quarantinePath;
    private readonly long _maxFileBytes;

    public LocalPrivateEvidenceStorage(IOptions<EvidenceStorageOptions> options)
    {
        var configured = options.Value;
        if (string.IsNullOrWhiteSpace(configured.RootPath))
            throw new InvalidOperationException("EvidenceStorage:RootPath is required.");
        if (configured.MaxFileBytes is <= 0 or > EvidenceStorageOptions.AbsoluteMaximumFileBytes)
            throw new InvalidOperationException(
                $"EvidenceStorage:MaxFileBytes must be between 1 and {EvidenceStorageOptions.AbsoluteMaximumFileBytes}.");

        _rootPath = Path.GetFullPath(configured.RootPath);
        var webRootPath = Path.GetFullPath("wwwroot");
        if (IsSameOrChildPath(_rootPath, webRootPath))
            throw new InvalidOperationException("Evidence storage must be outside the public web root.");

        _quarantinePath = Path.Combine(_rootPath, ".quarantine");
        _maxFileBytes = configured.MaxFileBytes;
        CreatePrivateDirectory(_rootPath);
        CreatePrivateDirectory(_quarantinePath);
    }

    public async Task<StoredEvidenceFile> StoreAsync(
        Stream content,
        string originalFileName,
        string? claimedContentType,
        long declaredLength,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (!content.CanRead) throw new ArgumentException("The uploaded file cannot be read.", nameof(content));
        if (declaredLength <= 0) throw new ArgumentException("The uploaded file is empty.", nameof(declaredLength));
        if (declaredLength > _maxFileBytes)
            throw new ArgumentException($"The uploaded file exceeds the {_maxFileBytes} byte limit.", nameof(declaredLength));

        var safeFileName = NormalizeOriginalFileName(originalFileName);
        var storageKey = Guid.NewGuid().ToString("N");
        var temporaryPath = Path.Combine(_quarantinePath, storageKey + ".upload");
        var finalDirectory = Path.Combine(_rootPath, storageKey[..2]);
        var finalPath = Path.Combine(finalDirectory, storageKey + ".bin");
        var signature = new byte[SignatureLength];
        var signatureBytes = 0;
        long totalBytes = 0;
        var buffer = ArrayPool<byte>.Shared.Rent(CopyBufferSize);

        try
        {
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            await using (var output = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                CopyBufferSize,
                FileOptions.Asynchronous | FileOptions.SequentialScan))
            {
                while (true)
                {
                    var bytesRead = await content.ReadAsync(
                        buffer.AsMemory(0, buffer.Length),
                        cancellationToken);
                    if (bytesRead == 0) break;

                    totalBytes = checked(totalBytes + bytesRead);
                    if (totalBytes > _maxFileBytes)
                        throw new ArgumentException($"The uploaded file exceeds the {_maxFileBytes} byte limit.");

                    if (signatureBytes < signature.Length)
                    {
                        var copyLength = Math.Min(signature.Length - signatureBytes, bytesRead);
                        buffer.AsSpan(0, copyLength).CopyTo(signature.AsSpan(signatureBytes));
                        signatureBytes += copyLength;
                    }

                    hash.AppendData(buffer, 0, bytesRead);
                    await output.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
                }

                await output.FlushAsync(cancellationToken);
            }

            if (totalBytes == 0) throw new ArgumentException("The uploaded file is empty.");
            if (totalBytes != declaredLength)
                throw new InvalidOperationException("The uploaded file length changed while it was being stored.");

            var detectedType = EvidenceFileTypeDetector.Detect(
                signature.AsSpan(0, signatureBytes),
                safeFileName,
                claimedContentType);
            var sha256 = Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();

            CreatePrivateDirectory(finalDirectory);
            File.Move(temporaryPath, finalPath);
            SetPrivateFilePermissions(finalPath);

            return new StoredEvidenceFile(
                storageKey,
                safeFileName,
                detectedType,
                totalBytes,
                sha256);
        }
        catch
        {
            DeleteFileIfPresent(temporaryPath);
            DeleteFileIfPresent(finalPath);
            throw;
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer, clearArray: true);
        }
    }

    public Task<Stream> OpenReadAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var path = GetStoragePath(storageKey);
        if (!File.Exists(path)) throw new KeyNotFoundException("The evidence file is unavailable.");

        Stream stream = new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            CopyBufferSize,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        return Task.FromResult(stream);
    }

    public Task DeleteIfExistsAsync(
        string storageKey,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        DeleteFileIfPresent(GetStoragePath(storageKey));
        return Task.CompletedTask;
    }

    private string GetStoragePath(string storageKey)
    {
        if (!Guid.TryParseExact(storageKey, "N", out _)
            || storageKey.Any(character => !Uri.IsHexDigit(character)))
            throw new InvalidOperationException("The stored evidence key is invalid.");

        var path = Path.GetFullPath(
            Path.Combine(_rootPath, storageKey[..2], storageKey + ".bin"));
        if (!IsSameOrChildPath(path, _rootPath))
            throw new InvalidOperationException("The stored evidence path is invalid.");
        return path;
    }

    private static string NormalizeOriginalFileName(string originalFileName)
    {
        if (string.IsNullOrWhiteSpace(originalFileName))
            throw new ArgumentException("A file name is required.", nameof(originalFileName));

        var normalizedSeparators = originalFileName.Replace('\\', '/');
        var fileName = Path.GetFileName(normalizedSeparators).Trim().Normalize(NormalizationForm.FormC);
        if (fileName.Length is 0 or > 200 || fileName is "." or ".." || fileName.Any(char.IsControl))
            throw new ArgumentException("The file name is invalid.", nameof(originalFileName));
        return fileName;
    }

    private static bool IsSameOrChildPath(string candidate, string parent)
    {
        var comparison = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        var normalizedParent = parent.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;
        var normalizedCandidate = candidate.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;
        return normalizedCandidate.StartsWith(normalizedParent, comparison);
    }

    private static void CreatePrivateDirectory(string path)
    {
        Directory.CreateDirectory(path);
        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(
                path,
                UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }
    }

    private static void SetPrivateFilePermissions(string path)
    {
        if (!OperatingSystem.IsWindows())
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
    }

    private static void DeleteFileIfPresent(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch
        {
            // Best effort cleanup. The file remains outside the web root and is not
            // addressable without a committed database record.
        }
    }
}

internal static class EvidenceFileTypeDetector
{
    private static readonly byte[] PdfSignature = "%PDF-"u8.ToArray();
    private static readonly byte[] PngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    public static string Detect(
        ReadOnlySpan<byte> signature,
        string fileName,
        string? claimedContentType)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var detected = DetectSignature(signature);
        var expectedExtensions = detected switch
        {
            "application/pdf" => new[] { ".pdf" },
            "image/jpeg" => new[] { ".jpg", ".jpeg" },
            "image/png" => new[] { ".png" },
            "image/webp" => new[] { ".webp" },
            _ => []
        };
        if (!expectedExtensions.Contains(extension, StringComparer.Ordinal))
            throw new ArgumentException("The file extension does not match its validated content type.");

        if (!string.IsNullOrWhiteSpace(claimedContentType)
            && !string.Equals(claimedContentType, "application/octet-stream", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(claimedContentType, detected, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("The browser content type does not match the uploaded file.");

        return detected;
    }

    private static string DetectSignature(ReadOnlySpan<byte> signature)
    {
        if (signature.StartsWith(PdfSignature)) return "application/pdf";
        if (signature.StartsWith(PngSignature)) return "image/png";
        if (signature.Length >= 3
            && signature[0] == 0xFF
            && signature[1] == 0xD8
            && signature[2] == 0xFF)
            return "image/jpeg";
        if (signature.Length >= 12
            && signature[..4].SequenceEqual("RIFF"u8)
            && signature.Slice(8, 4).SequenceEqual("WEBP"u8))
            return "image/webp";

        throw new ArgumentException("Only validated PDF, JPEG, PNG, and WebP evidence files are accepted.");
    }
}
