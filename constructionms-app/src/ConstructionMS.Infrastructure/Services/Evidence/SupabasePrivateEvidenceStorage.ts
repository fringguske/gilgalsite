import { createHash, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ArgumentError, InvalidOperationError, KeyNotFoundError } from '@/ConstructionMS.Application/Common/Exceptions'
import { EvidenceStorageOptions } from '@/ConstructionMS.Application/Configuration/EvidenceStorageOptions'
import type { StoredEvidenceFile } from '@/ConstructionMS.Application/DTOs/Evidence/EvidenceDtos'
import type { IEvidenceStorage } from '@/ConstructionMS.Application/Services/Evidence/IEvidenceStorage'

const SignatureLength = 16

/**
 * Private evidence storage in a private Supabase Storage bucket (replaces LocalPrivateEvidenceStorage).
 * The service-role client is created lazily; the bucket is never public.
 */
export class SupabasePrivateEvidenceStorage implements IEvidenceStorage {
  private readonly bucket: string
  private readonly maxFileBytes: number
  private client: SupabaseClient | null = null

  constructor(options: EvidenceStorageOptions) {
    if (!options.bucket || options.bucket.trim() === '') {
      throw new InvalidOperationError('EvidenceStorage:Bucket is required.')
    }
    if (!Number.isInteger(options.maxFileBytes) || options.maxFileBytes <= 0
      || options.maxFileBytes > EvidenceStorageOptions.AbsoluteMaximumFileBytes) {
      throw new InvalidOperationError(
        `EvidenceStorage:MaxFileBytes must be between 1 and ${EvidenceStorageOptions.AbsoluteMaximumFileBytes}.`)
    }

    this.bucket = options.bucket
    this.maxFileBytes = options.maxFileBytes
  }

  async storeAsync(
    content: Uint8Array,
    originalFileName: string,
    claimedContentType: string | null,
    declaredLength: number,
  ): Promise<StoredEvidenceFile> {
    if (content === null || content === undefined) throw new ArgumentError('Value cannot be null.', 'content')
    if (declaredLength <= 0) throw new ArgumentError('The uploaded file is empty.', 'declaredLength')
    if (declaredLength > this.maxFileBytes) {
      throw new ArgumentError(`The uploaded file exceeds the ${this.maxFileBytes} byte limit.`, 'declaredLength')
    }

    const safeFileName = normalizeOriginalFileName(originalFileName)
    const storageKey = randomUUID().replace(/-/g, '')

    const totalBytes = content.byteLength
    if (totalBytes > this.maxFileBytes) {
      throw new ArgumentError(`The uploaded file exceeds the ${this.maxFileBytes} byte limit.`)
    }
    if (totalBytes === 0) throw new ArgumentError('The uploaded file is empty.')
    if (totalBytes !== declaredLength) {
      throw new InvalidOperationError('The uploaded file length changed while it was being stored.')
    }

    const detectedType = EvidenceFileTypeDetector.detect(
      content.subarray(0, Math.min(SignatureLength, totalBytes)),
      safeFileName,
      claimedContentType)
    const sha256 = createHash('sha256').update(content).digest('hex').toLowerCase()

    const { error } = await this.storage().upload(objectPath(storageKey), content, {
      contentType: detectedType,
      upsert: false,
      cacheControl: 'private, no-store',
    })
    if (error) throw new InvalidOperationError(`The evidence file could not be stored: ${error.message}`)

    return {
      storageKey,
      originalFileName: safeFileName,
      contentType: detectedType,
      sizeBytes: totalBytes,
      sha256Hash: sha256,
    }
  }

  async openReadAsync(storageKey: string): Promise<Uint8Array> {
    const path = objectPath(storageKey)
    const { data, error } = await this.storage().download(path)
    if (error || !data) throw new KeyNotFoundError('The evidence file is unavailable.')
    return new Uint8Array(await data.arrayBuffer())
  }

  async deleteIfExistsAsync(storageKey: string): Promise<void> {
    const path = objectPath(storageKey)
    try {
      // remove() succeeds with an empty result when the object does not exist.
      await this.storage().remove([path])
    } catch {
      // Best effort cleanup. The object is in a private bucket and is not
      // addressable without a committed database record.
    }
  }

  private storage() {
    if (this.client === null) {
      const url = process.env.SUPABASE_URL?.trim()
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
      if (!url || !key) {
        throw new InvalidOperationError('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for evidence storage.')
      }
      this.client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    }
    return this.client.storage.from(this.bucket)
  }
}

function objectPath(storageKey: string): string {
  if (!/^[0-9a-fA-F]{32}$/.test(storageKey)) {
    throw new InvalidOperationError('The stored evidence key is invalid.')
  }
  return `${storageKey.slice(0, 2)}/${storageKey}.bin`
}

function isControl(code: number): boolean {
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
}

function normalizeOriginalFileName(originalFileName: string): string {
  if (originalFileName === null || originalFileName === undefined || originalFileName.trim() === '') {
    throw new ArgumentError('A file name is required.', 'originalFileName')
  }

  const normalizedSeparators = originalFileName.replace(/\\/g, '/')
  const fileName = normalizedSeparators.slice(normalizedSeparators.lastIndexOf('/') + 1).trim().normalize('NFC')
  if (fileName.length === 0 || fileName.length > 200 || fileName === '.' || fileName === '..'
    || [...fileName].some(character => isControl(character.charCodeAt(0)))) {
    throw new ArgumentError('The file name is invalid.', 'originalFileName')
  }
  return fileName
}

/** Path.GetExtension: the last '.' segment including the dot; empty when absent or trailing. */
function getExtension(fileName: string): string {
  const index = fileName.lastIndexOf('.')
  return index < 0 || index === fileName.length - 1 ? '' : fileName.slice(index)
}

const PdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2d]
const PngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function startsWith(signature: Uint8Array, prefix: number[], offset = 0): boolean {
  return signature.length >= offset + prefix.length && prefix.every((value, index) => signature[offset + index] === value)
}

const EvidenceFileTypeDetector = {
  detect(signature: Uint8Array, fileName: string, claimedContentType: string | null): string {
    const extension = getExtension(fileName).toLowerCase()
    const detected = EvidenceFileTypeDetector.detectSignature(signature)
    const expectedExtensions: string[] =
      detected === 'application/pdf' ? ['.pdf']
        : detected === 'image/jpeg' ? ['.jpg', '.jpeg']
          : detected === 'image/png' ? ['.png']
            : detected === 'image/webp' ? ['.webp']
              : []
    if (!expectedExtensions.includes(extension)) {
      throw new ArgumentError('The file extension does not match its validated content type.')
    }

    if (claimedContentType !== null && claimedContentType !== undefined && claimedContentType.trim() !== ''
      && claimedContentType.toLowerCase() !== 'application/octet-stream'
      && claimedContentType.toLowerCase() !== detected) {
      throw new ArgumentError('The browser content type does not match the uploaded file.')
    }

    return detected
  },

  detectSignature(signature: Uint8Array): string {
    if (startsWith(signature, PdfSignature)) return 'application/pdf'
    if (startsWith(signature, PngSignature)) return 'image/png'
    if (signature.length >= 3 && signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff) {
      return 'image/jpeg'
    }
    if (signature.length >= 12
      && startsWith(signature, [0x52, 0x49, 0x46, 0x46])
      && startsWith(signature, [0x57, 0x45, 0x42, 0x50], 8)) {
      return 'image/webp'
    }

    throw new ArgumentError('Only validated PDF, JPEG, PNG, and WebP evidence files are accepted.')
  },
}
