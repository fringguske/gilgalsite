/** A page of query results and its navigation metadata. */
export interface PaginatedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  /** Computed exactly like the C# `TotalPages` property, which was serialized. */
  totalPages: number
}

export function createPaginatedResult<T>(init: {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
}): PaginatedResult<T> {
  return {
    items: init.items,
    totalCount: init.totalCount,
    page: init.page,
    pageSize: init.pageSize,
    totalPages: init.pageSize > 0 ? Math.ceil(init.totalCount / init.pageSize) : 0,
  }
}
