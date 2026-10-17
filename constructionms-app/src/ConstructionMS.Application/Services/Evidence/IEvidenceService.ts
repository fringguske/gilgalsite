import type { EvidenceDocumentResponseDto, EvidenceDownload, EvidenceUploadCommand } from '../../DTOs/Evidence/EvidenceDtos'

export interface IEvidenceService {
  uploadAsync(command: EvidenceUploadCommand, actorUserId: number, actorRole: string): Promise<EvidenceDocumentResponseDto>
  getForSourceAsync(sourceType: string, sourceId: number, actorUserId: number, actorRole: string): Promise<EvidenceDocumentResponseDto[]>
  openDownloadAsync(documentId: string, actorUserId: number, actorRole: string): Promise<EvidenceDownload>
}
