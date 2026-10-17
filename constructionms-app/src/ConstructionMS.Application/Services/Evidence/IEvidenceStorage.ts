import type { StoredEvidenceFile } from '../../DTOs/Evidence/EvidenceDtos'

export interface IEvidenceStorage {
  storeAsync(
    content: Uint8Array,
    originalFileName: string,
    claimedContentType: string | null,
    declaredLength: number,
  ): Promise<StoredEvidenceFile>

  openReadAsync(storageKey: string): Promise<Uint8Array>

  deleteIfExistsAsync(storageKey: string): Promise<void>
}
