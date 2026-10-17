export interface EvidenceDocumentResponseDto {
  id: string
  projectId: number
  projectName: string
  sourceType: string
  sourceId: number
  evidenceKind: string
  originalFileName: string
  contentType: string
  sizeBytes: number
  sha256Hash: string
  uploadedByUserId: number
  uploadedByName: string
  uploadedAt: Date
}

export interface EvidenceUploadCommand {
  sourceType: string
  sourceId: number
  evidenceKind: string
  originalFileName: string
  claimedContentType: string | null
  declaredLength: number
  content: Uint8Array
}

export interface StoredEvidenceFile {
  storageKey: string
  originalFileName: string
  contentType: string
  sizeBytes: number
  sha256Hash: string
}

export interface EvidenceDownload {
  content: Uint8Array
  contentType: string
  fileName: string
  sizeBytes: number
}
