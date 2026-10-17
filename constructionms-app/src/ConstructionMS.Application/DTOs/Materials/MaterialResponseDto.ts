/** Material catalogue response. */
export interface MaterialResponseDto {
  id: number
  name: string
  /** Grouping category, e.g. "Structural", "Finishing", "Plumbing". Optional. */
  category: string | null
  /** Unit of measurement, e.g. "bags", "kg", "m²", "pieces". */
  unit: string
  /** Reference price per unit used for PO budget estimates and 3-way match. */
  standardPrice: number
  /** Minimum stock quantity used to identify low stock. */
  reorderLevel: number
  /** Whether new PO deliveries require an Engineer's technical decision. */
  requiresTechnicalAcceptance: boolean
  createdAt: Date
}
