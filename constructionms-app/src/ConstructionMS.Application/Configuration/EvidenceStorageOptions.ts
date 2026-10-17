/**
 * Private evidence storage. On Vercel there is no persistent disk, so files live in
 * a private Supabase Storage bucket. Vercel limits serverless request bodies to
 * about 4.5 MB, so the absolute file limit is 4 MB (was 10 MB on the C# host).
 */
export interface EvidenceStorageOptions {
  /** Supabase Storage bucket (private). Env: EVIDENCE_STORAGE_BUCKET */
  bucket: string
  /** Env: EVIDENCE_STORAGE_MAX_FILE_BYTES, capped by AbsoluteMaximumFileBytes. */
  maxFileBytes: number
}

export const EvidenceStorageOptions = Object.freeze({
  SectionName: 'EvidenceStorage',
  AbsoluteMaximumFileBytes: 4 * 1024 * 1024,

  fromEnvironment(env: NodeJS.ProcessEnv = process.env): EvidenceStorageOptions {
    const bucket = env.EVIDENCE_STORAGE_BUCKET?.trim() || 'evidence'
    const maxFileBytes = env.EVIDENCE_STORAGE_MAX_FILE_BYTES
      ? Number(env.EVIDENCE_STORAGE_MAX_FILE_BYTES)
      : EvidenceStorageOptions.AbsoluteMaximumFileBytes
    if (!Number.isInteger(maxFileBytes) || maxFileBytes <= 0 || maxFileBytes > EvidenceStorageOptions.AbsoluteMaximumFileBytes) {
      throw new Error(`EvidenceStorage:MaxFileBytes must be between 1 and ${EvidenceStorageOptions.AbsoluteMaximumFileBytes}.`)
    }
    return { bucket, maxFileBytes }
  },
})
