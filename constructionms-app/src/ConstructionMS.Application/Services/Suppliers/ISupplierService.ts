import type { PaginatedResult } from '../../Common/PaginatedResult'
import type { SupplierResponseDto } from '../../DTOs/Suppliers/SupplierResponseDto'
import type { UpdateSupplierRequestDto } from '../../DTOs/Suppliers/UpdateSupplierRequestDto'

/**
 * Business operations for Suppliers.
 * Hard deletion is deliberately unsupported so supplier history can be retained.
 */
export interface ISupplierService {
  getAllAsync(page: number, pageSize: number): Promise<PaginatedResult<SupplierResponseDto>>
  getByIdAsync(id: number): Promise<SupplierResponseDto | null>
  updateAsync(id: number, dto: UpdateSupplierRequestDto): Promise<SupplierResponseDto | null>

  /** Sets the supplier's blacklist state explicitly. Returns false if not found. */
  setBlacklistStatusAsync(id: number, isBlacklisted: boolean): Promise<boolean>
}
