/**
 * Minimal supplier information used when selecting a vendor for sourcing.
 * Payment, tax and contact details are intentionally omitted.
 */
export interface SupplierSummaryResponseDto {
  id: number
  name: string
  category: string | null
  isBlacklisted: boolean
  createdAt: Date
}
