export const INT_MAX = 2_147_483_647
export const LONG_MAX = Number.MAX_SAFE_INTEGER

/** Normalizes list pagination before values reach a database query. */
export const Pagination = Object.freeze({
  DefaultPageSize: 25,
  MaxPageSize: 100,

  normalize(page: number, pageSize: number): { page: number; pageSize: number; offset: number } {
    const normalizedPageSize = Math.min(Math.max(Math.trunc(pageSize), 1), Pagination.MaxPageSize)
    let normalizedPage = Math.max(Math.trunc(page), 1)
    const maxSafePage = Math.min(INT_MAX, Math.floor(INT_MAX / normalizedPageSize) + 1)
    normalizedPage = Math.min(normalizedPage, maxSafePage)

    return {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      offset: (normalizedPage - 1) * normalizedPageSize,
    }
  },
})
