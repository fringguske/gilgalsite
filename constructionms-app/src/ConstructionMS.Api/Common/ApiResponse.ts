/** Typed response envelope used by every controller: { success, data, error }. */
export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
}

export const ApiResponse = Object.freeze({
  ok<T>(data: T): ApiResponse<T> {
    return { success: true, data, error: null }
  },

  fail<T = unknown>(error: string): ApiResponse<T> {
    return { success: false, data: null, error }
  },
})
