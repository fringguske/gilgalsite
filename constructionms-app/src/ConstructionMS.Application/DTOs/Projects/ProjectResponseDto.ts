/** Construction project response. */
export interface ProjectResponseDto {
  id: number
  name: string
  /** Physical address or description of the site. Optional. */
  location: string | null
  /** Null when the authenticated role is not allowed to view project finances. */
  budget: number | null
  /** DateOnly, "YYYY-MM-DD". */
  startDate: string
  /** Null if the project is still active/ongoing. */
  endDate: string | null
  /** One of: "Active", "On Hold", "Completed", "Cancelled". */
  status: string
  createdAt: Date
}
