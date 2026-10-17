/**
 * Represents a Supplier as returned by the API. Includes all fields except
 * internal/system fields.
 */
export interface SupplierResponseDto {
  id: number
  /** Registered business name of the supplier. */
  name: string
  contactPerson: string | null
  phoneNumber: string | null
  email: string | null
  /** Kenya Revenue Authority PIN, required for formal procurement. */
  kraPin: string | null
  /** M-Pesa business/till number for mobile payment. */
  mpesaNumber: string | null
  /** Grouping category, e.g. "Hardware", "Labour", "Transport". */
  category: string | null
  /** Whether the supplier is currently blacklisted. */
  isBlacklisted: boolean
  createdAt: Date
}
