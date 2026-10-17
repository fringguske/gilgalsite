import { apiConfig } from './config'
import type {
  AssignedProject,
  AccessRequest,
  ApproveAccessRequest,
  ApiEnvelope,
  CostCode,
  CorrectPurchaseOrderRequest,
  CreateCostCodeRequest,
  CreateMaterialCatalogRequest,
  CreateMaterialRequest,
  CreateProjectProgressVerificationRequest,
  CreateProjectRequest,
  CreatePurchaseOrderRequest,
  CreateRequisitionRequest,
  CreateSourcingRoundRequest,
  CreateStockReplenishmentRequest,
  CreateSupplierOnboardingRequest,
  CurrentUser,
  DashboardResponse,
  LoginRequest,
  RegisterAccessRequest,
  Material,
  MaterialCatalogRequest,
  MaterialCatalogRequestStatus,
  PageQuery,
  PaginatedResult,
  Project,
  ProjectBudget,
  ProjectProgressVerification,
  ProjectSummary,
  PurchaseOrder,
  PurchaseOrderActionRequest,
  PurchaseOrderListQuery,
  RecordSupplierQuoteRequest,
  ReopenSourcingRoundRequest,
  Requisition,
  RequisitionListQuery,
  RoleRecord,
  SetUserActiveRequest,
  SetProjectBudgetRequest,
  SourcingRound,
  SourcingRoundListQuery,
  Supplier,
  SupplierOnboardingRequest,
  SupplierOnboardingStatus,
  SupplierQuote,
  SupplierSummary,
  SupervisorDecisionRequest,
  SwitchRoleRequest,
  TechnicalCheckRequest,
  TechnicalAcceptanceOutcome,
  TechnicalAcceptanceStatus,
  TechnicalAcceptanceWorkItem,
  UpdateProjectAssignmentsRequest,
  UpdateProjectRequest,
  UpdateRequisitionRequest,
  UpdateMaterialRequest,
  UpdateSupplierRequest,
  ReviewSupplierOnboardingRequest,
  ReviewMaterialCatalogRequest,
  UserAccount,
  WorkflowReasonRequest,
  GoodsReceipt,
  StockBalance,
  StockLedgerEntry,
  MaterialIssue,
  StockTransfer,
  StockCount,
  SupplierInvoice,
  PaymentAuthorization,
  Payment,
  CashBook,
  CashAccount,
  PettyCashRequest,
  ControlEvent,
  ChangePasswordRequest,
  ChangeUsernameRequest,
  AppNotification,
  ControlledCorrection,
  CreateControlledCorrectionRequest,
  CreateMaterialReturnRequest,
  CreateOpeningPositionRequest,
  CreateOperationalPeriodRequest,
  CustodyCloseout,
  EvidenceDocument,
  MaterialReturn,
  MaterialIssueDisputeResolution,
  MyTasksResponse,
  NotificationCount,
  NotificationReadResult,
  OpeningPosition,
  OperationalPeriod,
} from './types'

interface ProblemDetails {
  title?: string
  detail?: string
  errors?: Record<string, string[]>
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

type QueryValue = string | number | boolean | null | undefined

export const authenticationExpiredEvent = 'constructionms:authentication-expired'

function notifyAuthenticationExpired(response: Response) {
  if (response.status === 401) window.dispatchEvent(new Event(authenticationExpiredEvent))
}

function shouldRetryTransaction(response: Response) {
  return response.status === 409 && response.headers.get('Retry-After') === '1'
}

async function waitForTransactionRetry(signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The request was aborted.', 'AbortError'))
      return
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, 1_000)
    const abort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('The request was aborted.', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export class ApiError extends Error {
  readonly status: number
  readonly validationErrors: Record<string, string[]>
  readonly responseBody: unknown

  constructor(
    message: string,
    status: number,
    responseBody?: unknown,
    validationErrors: Record<string, string[]> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.responseBody = responseBody
    this.validationErrors = validationErrors
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  return isObject(value) && typeof value.success === 'boolean'
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return isObject(value)
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return undefined
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function getErrorMessage(response: Response, body: unknown): string {
  if (isApiEnvelope(body) && typeof body.error === 'string' && body.error.trim()) {
    return body.error
  }

  if (isProblemDetails(body)) {
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail
    }

    if (body.errors) {
      const firstValidationMessage = Object.values(body.errors).flat()[0]
      if (firstValidationMessage) {
        return firstValidationMessage
      }
    }

    if (typeof body.title === 'string' && body.title.trim()) {
      return body.title
    }
  }

  if (typeof body === 'string' && body.trim()) {
    return body
  }

  return `Request failed with status ${response.status}.`
}

function getValidationErrors(body: unknown): Record<string, string[]> {
  if (!isProblemDetails(body) || !isObject(body.errors)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(body.errors).filter(
      (entry): entry is [string, string[]] =>
        Array.isArray(entry[1]) && entry[1].every((item) => typeof item === 'string'),
    ),
  )
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = `${apiConfig.baseUrl}${normalizedPath}`

  if (!query) {
    return url
  }

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  }

  const queryString = search.toString()
  return queryString ? `${url}?${queryString}` : url
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
  query?: Record<string, QueryValue>,
): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' })
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  const fetchRequest = () => fetch(buildUrl(path, query), {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })
  let response: Response
  try {
    response = await fetchRequest()
    if (shouldRetryTransaction(response)) {
      await waitForTransactionRetry(options.signal)
      response = await fetchRequest()
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ApiError('The server could not be reached. Check your connection and try again.', 0)
  }

  notifyAuthenticationExpired(response)
  const body = await readResponseBody(response)

  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(response, body),
      response.status,
      body,
      getValidationErrors(body),
    )
  }

  if (!isApiEnvelope(body)) {
    throw new ApiError('The server returned an unexpected response.', response.status, body)
  }

  if (!body.success) {
    throw new ApiError(body.error || 'The request could not be completed.', response.status, body)
  }

  return body.data as T
}

async function requestFormData<T>(
  path: string,
  formData: FormData,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(buildUrl(path), {
      method: 'POST',
      credentials: 'include',
      headers: new Headers({ Accept: 'application/json' }),
      body: formData,
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('The server could not be reached. Check your connection and try again.', 0)
  }

  const body = await readResponseBody(response)
  notifyAuthenticationExpired(response)
  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(response, body),
      response.status,
      body,
      getValidationErrors(body),
    )
  }
  if (!isApiEnvelope(body) || !body.success) {
    throw new ApiError(
      isApiEnvelope(body) ? body.error || 'The upload could not be completed.' : 'The server returned an unexpected response.',
      response.status,
      body,
    )
  }
  return body.data as T
}

async function requestFile(path: string, signal?: AbortSignal): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(buildUrl(path), {
      credentials: 'include',
      headers: new Headers({ Accept: 'application/pdf,image/jpeg,image/png,image/webp' }),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError('The server could not be reached. Check your connection and try again.', 0)
  }
  if (!response.ok) {
    notifyAuthenticationExpired(response)
    const body = await readResponseBody(response)
    throw new ApiError(getErrorMessage(response, body), response.status, body, getValidationErrors(body))
  }
  return response.blob()
}

async function requestWithoutResponse(
  path: string,
  options: RequestOptions,
): Promise<void> {
  let response: Response
  try {
    const headers = new Headers({ Accept: 'application/json' })
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }

    const fetchRequest = () => fetch(buildUrl(path), {
      method: options.method ?? 'POST',
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
    response = await fetchRequest()
    if (shouldRetryTransaction(response)) {
      await waitForTransactionRetry(options.signal)
      response = await fetchRequest()
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error
    }

    throw new ApiError('The server could not be reached. Check your connection and try again.', 0)
  }

  notifyAuthenticationExpired(response)
  const body = await readResponseBody(response)
  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(response, body),
      response.status,
      body,
      getValidationErrors(body),
    )
  }
}

function pageQuery(query: PageQuery = {}): Record<string, QueryValue> {
  return { page: query.page, pageSize: query.pageSize }
}

export const authApi = {
  login: (payload: LoginRequest, signal?: AbortSignal) =>
    request<CurrentUser>('/auth/login', { method: 'POST', body: payload, signal }),

  register: (payload: RegisterAccessRequest, signal?: AbortSignal) =>
    request<AccessRequest>('/auth/register', { method: 'POST', body: payload, signal }),

  me: (signal?: AbortSignal) => request<CurrentUser>('/auth/me', { signal }),

  switchRole: (payload: SwitchRoleRequest, signal?: AbortSignal) =>
    request<CurrentUser>('/auth/role-context', {
      method: 'POST',
      body: payload,
      signal,
    }),

  changePassword: (payload: ChangePasswordRequest, signal?: AbortSignal) =>
    requestWithoutResponse('/auth/change-password', {
      method: 'POST',
      body: payload,
      signal,
    }),

  changeUsername: (payload: ChangeUsernameRequest, signal?: AbortSignal) =>
    requestWithoutResponse('/auth/change-username', {
      method: 'POST',
      body: payload,
      signal,
    }),

  logout: (signal?: AbortSignal) =>
    requestWithoutResponse('/auth/logout', { method: 'POST', signal }),

  getProjectAssignments: (userId: number, signal?: AbortSignal) =>
    request<AssignedProject[]>(`/users/${userId}/projects`, { signal }),

  replaceProjectAssignments: (
    userId: number,
    payload: UpdateProjectAssignmentsRequest,
    signal?: AbortSignal,
  ) =>
    request<AssignedProject[]>(`/users/${userId}/projects`, {
      method: 'PUT',
      body: payload,
      signal,
    }),
}

export const accessRequestsApi = {
  list: (status: AccessRequest['status'] | undefined, signal?: AbortSignal) =>
    request<PaginatedResult<AccessRequest>>(
      '/access-requests',
      { signal },
      { page: 1, pageSize: 100, status },
    ),

  approve: (id: number, payload: ApproveAccessRequest, signal?: AbortSignal) =>
    request<AccessRequest>(`/access-requests/${id}/approve`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  reject: (id: number, reason: string, signal?: AbortSignal) =>
    request<AccessRequest>(`/access-requests/${id}/reject`, {
      method: 'POST',
      body: { reason },
      signal,
    }),
}

export const rolesApi = {
  list: (signal?: AbortSignal) =>
    request<PaginatedResult<RoleRecord>>('/roles', { signal }, { page: 1, pageSize: 100 }),
}

export const dashboardApi = {
  get: (signal?: AbortSignal) => request<DashboardResponse>('/dashboard', { signal }),
}

export const usersApi = {
  list: (query: PageQuery = {}, signal?: AbortSignal) =>
    request<PaginatedResult<UserAccount>>('/users', { signal }, pageQuery(query)),

  get: (userId: number, signal?: AbortSignal) =>
    request<UserAccount>(`/users/${userId}`, { signal }),

  setActiveStatus: (
    userId: number,
    payload: SetUserActiveRequest,
    signal?: AbortSignal,
  ) =>
    request<UserAccount>(`/users/${userId}/active`, {
      method: 'PATCH',
      body: payload,
      signal,
    }),
}

export const materialsApi = {
  list: (query: PageQuery = {}, signal?: AbortSignal) =>
    request<PaginatedResult<Material>>('/materials', { signal }, pageQuery(query)),

  get: (materialId: number, signal?: AbortSignal) =>
    request<Material>(`/materials/${materialId}`, { signal }),

  create: (payload: CreateMaterialRequest, signal?: AbortSignal) =>
    request<Material>('/materials', { method: 'POST', body: payload, signal }),

  update: (materialId: number, payload: UpdateMaterialRequest, signal?: AbortSignal) =>
    request<Material>(`/materials/${materialId}`, {
      method: 'PUT',
      body: payload,
      signal,
    }),
}

export const materialCatalogRequestsApi = {
  list: (
    query: PageQuery & { status?: MaterialCatalogRequestStatus } = {},
    signal?: AbortSignal,
  ) =>
    request<PaginatedResult<MaterialCatalogRequest>>(
      '/material-catalog-requests',
      { signal },
      pageQuery(query),
    ),

  submit: (payload: CreateMaterialCatalogRequest, signal?: AbortSignal) =>
    request<MaterialCatalogRequest>('/material-catalog-requests', {
      method: 'POST',
      body: payload,
      signal,
    }),

  review: (
    requestId: number,
    payload: ReviewMaterialCatalogRequest,
    signal?: AbortSignal,
  ) =>
    request<MaterialCatalogRequest>(`/material-catalog-requests/${requestId}/decision`, {
      method: 'POST',
      body: payload,
      signal,
    }),
}

export const suppliersApi = {
  list: (query: PageQuery = {}, signal?: AbortSignal) =>
    request<PaginatedResult<SupplierSummary>>('/suppliers', { signal }, pageQuery(query)),

  get: (supplierId: number, signal?: AbortSignal) =>
    request<Supplier>(`/suppliers/${supplierId}`, { signal }),

  update: (supplierId: number, payload: UpdateSupplierRequest, signal?: AbortSignal) =>
    request<Supplier>(`/suppliers/${supplierId}`, {
      method: 'PUT',
      body: payload,
      signal,
    }),

  setBlacklistStatus: (supplierId: number, isBlacklisted: boolean, signal?: AbortSignal) =>
    request<Supplier>(`/suppliers/${supplierId}/blacklist`, {
      method: 'PATCH',
      body: { isBlacklisted },
      signal,
    }),
}

export const supplierOnboardingApi = {
  list: (
    query: PageQuery & { status?: SupplierOnboardingStatus } = {},
    signal?: AbortSignal,
  ) =>
    request<PaginatedResult<SupplierOnboardingRequest>>(
      '/supplier-onboarding',
      { signal },
      { ...pageQuery(query), status: query.status },
    ),

  submit: (payload: CreateSupplierOnboardingRequest, signal?: AbortSignal) =>
    request<SupplierOnboardingRequest>('/supplier-onboarding', {
      method: 'POST',
      body: payload,
      signal,
    }),

  review: (
    requestId: number,
    payload: ReviewSupplierOnboardingRequest,
    signal?: AbortSignal,
  ) =>
    request<SupplierOnboardingRequest>(`/supplier-onboarding/${requestId}/decision`, {
      method: 'POST',
      body: payload,
      signal,
    }),
}

export const projectsApi = {
  list: (query: PageQuery = {}, signal?: AbortSignal) =>
    request<PaginatedResult<Project>>('/projects', { signal }, pageQuery(query)),

  get: (projectId: number, signal?: AbortSignal) =>
    request<Project>(`/projects/${projectId}`, { signal }),

  getSummary: (projectId: number, signal?: AbortSignal) =>
    request<ProjectSummary>(`/projects/${projectId}/summary`, { signal }),

  create: (payload: CreateProjectRequest, signal?: AbortSignal) =>
    request<Project>('/projects', { method: 'POST', body: payload, signal }),

  update: (projectId: number, payload: UpdateProjectRequest, signal?: AbortSignal) =>
    request<Project>(`/projects/${projectId}`, {
      method: 'PUT',
      body: payload,
      signal,
    }),

  createCostCode: (
    projectId: number,
    payload: CreateCostCodeRequest,
    signal?: AbortSignal,
  ) =>
    request<CostCode>(`/projects/${projectId}/cost-codes`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  setBudget: (
    projectId: number,
    payload: SetProjectBudgetRequest,
    signal?: AbortSignal,
  ) =>
    request<ProjectBudget>(`/projects/${projectId}/budgets`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  addProgressVerification: (
    projectId: number,
    payload: CreateProjectProgressVerificationRequest,
    signal?: AbortSignal,
  ) =>
    request<ProjectProgressVerification>(`/projects/${projectId}/progress-verifications`, {
      method: 'POST',
      body: payload,
      signal,
    }),
}

export const requisitionsApi = {
  list: (query: RequisitionListQuery = {}, signal?: AbortSignal) =>
    request<PaginatedResult<Requisition>>(
      '/requisitions',
      { signal },
      {
        ...pageQuery(query),
        status: query.status,
        projectId: query.projectId,
      },
    ),

  get: (requisitionId: number, signal?: AbortSignal) =>
    request<Requisition>(`/requisitions/${requisitionId}`, { signal }),

  create: (payload: CreateRequisitionRequest, signal?: AbortSignal) =>
    request<Requisition>('/requisitions', { method: 'POST', body: payload, signal }),

  createStockReplenishment: (payload: CreateStockReplenishmentRequest, signal?: AbortSignal) =>
    request<Requisition>('/requisitions/stock-replenishment', {
      method: 'POST',
      body: payload,
      signal,
    }),

  update: (
    requisitionId: number,
    payload: UpdateRequisitionRequest,
    signal?: AbortSignal,
  ) =>
    request<Requisition>(`/requisitions/${requisitionId}`, {
      method: 'PATCH',
      body: payload,
      signal,
    }),

  recordTechnicalCheck: (
    requisitionId: number,
    payload: TechnicalCheckRequest,
    signal?: AbortSignal,
  ) =>
    request<Requisition>(`/requisitions/${requisitionId}/technical-check`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  recordSupervisorDecision: (
    requisitionId: number,
    payload: SupervisorDecisionRequest,
    signal?: AbortSignal,
  ) =>
    request<Requisition>(`/requisitions/${requisitionId}/decision`, {
      method: 'POST',
      body: payload,
      signal,
    }),
}

export const sourcingRoundsApi = {
  list: (query: SourcingRoundListQuery = {}, signal?: AbortSignal) =>
    request<PaginatedResult<SourcingRound>>(
      '/sourcing-rounds',
      { signal },
      {
        ...pageQuery(query),
        projectId: query.projectId,
        status: query.status,
      },
    ),

  get: (sourcingRoundId: number, signal?: AbortSignal) =>
    request<SourcingRound>(`/sourcing-rounds/${sourcingRoundId}`, { signal }),

  create: (payload: CreateSourcingRoundRequest, signal?: AbortSignal) =>
    request<SourcingRound>('/sourcing-rounds', {
      method: 'POST',
      body: payload,
      signal,
    }),

  recordQuote: (
    sourcingRoundId: number,
    payload: RecordSupplierQuoteRequest,
    signal?: AbortSignal,
  ) =>
    request<SupplierQuote>(`/sourcing-rounds/${sourcingRoundId}/quotes`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  close: (
    sourcingRoundId: number,
    payload: WorkflowReasonRequest,
    signal?: AbortSignal,
  ) =>
    request<SourcingRound>(`/sourcing-rounds/${sourcingRoundId}/close`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  cancel: (
    sourcingRoundId: number,
    payload: WorkflowReasonRequest,
    signal?: AbortSignal,
  ) =>
    request<SourcingRound>(`/sourcing-rounds/${sourcingRoundId}/cancel`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  reopen: (
    sourcingRoundId: number,
    payload: ReopenSourcingRoundRequest,
    signal?: AbortSignal,
  ) =>
    request<SourcingRound>(`/sourcing-rounds/${sourcingRoundId}/reopen`, {
      method: 'POST',
      body: payload,
      signal,
    }),
}

export const purchaseOrdersApi = {
  list: (query: PurchaseOrderListQuery = {}, signal?: AbortSignal) =>
    request<PaginatedResult<PurchaseOrder>>(
      '/purchase-orders',
      { signal },
      {
        ...pageQuery(query),
        projectId: query.projectId,
        status: query.status,
      },
    ),

  get: (purchaseOrderId: number, signal?: AbortSignal) =>
    request<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}`, { signal }),

  create: (payload: CreatePurchaseOrderRequest, signal?: AbortSignal) =>
    request<PurchaseOrder>('/purchase-orders', {
      method: 'POST',
      body: payload,
      signal,
    }),

  submit: (
    purchaseOrderId: number,
    payload: PurchaseOrderActionRequest = {},
    signal?: AbortSignal,
  ) =>
    request<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}/submit`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  approve: (
    purchaseOrderId: number,
    payload: PurchaseOrderActionRequest = {},
    signal?: AbortSignal,
  ) =>
    request<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}/approve`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  issue: (
    purchaseOrderId: number,
    payload: PurchaseOrderActionRequest = {},
    signal?: AbortSignal,
  ) =>
    request<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}/issue`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  returnToDraft: (
    purchaseOrderId: number,
    payload: WorkflowReasonRequest,
    signal?: AbortSignal,
  ) =>
    request<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}/return-to-draft`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  reject: (
    purchaseOrderId: number,
    payload: WorkflowReasonRequest,
    signal?: AbortSignal,
  ) =>
    request<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}/reject`, {
      method: 'POST',
      body: payload,
      signal,
    }),

  correct: (
    purchaseOrderId: number,
    payload: CorrectPurchaseOrderRequest,
    signal?: AbortSignal,
  ) =>
    request<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}/correction`, {
      method: 'PATCH',
      body: payload,
      signal,
    }),

  cancel: (
    purchaseOrderId: number,
    payload: WorkflowReasonRequest,
    signal?: AbortSignal,
  ) =>
    request<PurchaseOrder>(`/purchase-orders/${purchaseOrderId}/cancel`, {
      method: 'POST',
      body: payload,
      signal,
    }),
}

export const inventoryApi = {
  receipts: (signal?: AbortSignal, query: PageQuery = {}) => request<PaginatedResult<GoodsReceipt>>('/inventory/receipts', { signal }, pageQuery({ page: 1, pageSize: 100, ...query })),
  technicalAcceptances: (query: { page?: number; pageSize?: number; projectId?: number; status?: Exclude<TechnicalAcceptanceStatus, 'NotRequired'> } = {}, signal?: AbortSignal) =>
    request<PaginatedResult<TechnicalAcceptanceWorkItem>>('/inventory/technical-acceptances', { signal }, { page: 1, pageSize: 100, ...query }),
  receive: (body: { purchaseOrderId: number; deliveredQuantity: number; acceptedQuantity: number; condition: string; deliveryNoteReference: string; evidenceReference?: string | null; discrepancyNotes?: string | null }, signal?: AbortSignal) =>
    request<GoodsReceipt>('/inventory/receipts', { method: 'POST', body, signal }),
  recordTechnicalAcceptance: (receiptId: number, body: { outcome: TechnicalAcceptanceOutcome; notes: string; evidenceReference?: string | null }, signal?: AbortSignal) =>
    request<TechnicalAcceptanceWorkItem>(`/inventory/receipts/${receiptId}/technical-acceptance`, { method: 'POST', body, signal }),
  balances: (signal?: AbortSignal, query: PageQuery = {}) => request<PaginatedResult<StockBalance>>('/inventory/balances', { signal }, pageQuery({ page: 1, pageSize: 100, ...query })),
  ledger: (signal?: AbortSignal, query: PageQuery = {}) => request<PaginatedResult<StockLedgerEntry>>('/inventory/ledger', { signal }, pageQuery({ page: 1, pageSize: 100, ...query })),
  issues: (signal?: AbortSignal, query: PageQuery = {}) => request<PaginatedResult<MaterialIssue>>('/inventory/issues', { signal }, pageQuery({ page: 1, pageSize: 100, ...query })),
  issue: (body: { requisitionId: number; quantity: number; notes?: string | null }, signal?: AbortSignal) =>
    request<MaterialIssue>('/inventory/issues', { method: 'POST', body, signal }),
  confirmIssue: (id: number, body: { receivedQuantity: number; notes?: string | null }, signal?: AbortSignal) =>
    request<MaterialIssue>(`/inventory/issues/${id}/confirm`, { method: 'POST', body, signal }),
  recordUsage: (id: number, body: { usageType: 'Used' | 'Wastage'; quantity: number; purposeOrReason: string; evidenceReference?: string | null; idempotencyKey: string }, signal?: AbortSignal) =>
    request<MaterialIssue>(`/inventory/issues/${id}/usage`, { method: 'POST', body, signal }),
  transfers: (signal?: AbortSignal, query: PageQuery = {}) => request<PaginatedResult<StockTransfer>>('/inventory/transfers', { signal }, pageQuery({ page: 1, pageSize: 100, ...query })),
  createTransfer: (body: { fromProjectId: number; toProjectId: number; materialId: number; quantity: number; reason: string }, signal?: AbortSignal) =>
    request<StockTransfer>('/inventory/transfers', { method: 'POST', body, signal }),
  dispatchTransfer: (id: number, signal?: AbortSignal) =>
    request<StockTransfer>(`/inventory/transfers/${id}/dispatch`, { method: 'POST', body: {}, signal }),
  receiveTransfer: (id: number, body: { receivedQuantity: number; notes?: string | null }, signal?: AbortSignal) =>
    request<StockTransfer>(`/inventory/transfers/${id}/receive`, { method: 'POST', body, signal }),
  resolveTransfer: (id: number, body: { disposition: 'AcceptedLoss' | 'RecoveredAtDestination' | 'ReturnedToSource'; notes: string; evidenceReference?: string | null }, signal?: AbortSignal) =>
    request<StockTransfer>(`/inventory/transfers/${id}/resolve`, { method: 'POST', body, signal }),
  counts: (signal?: AbortSignal, query: PageQuery = {}) => request<PaginatedResult<StockCount>>('/inventory/counts', { signal }, pageQuery({ page: 1, pageSize: 100, ...query })),
  createCount: (body: { projectId: number; materialId: number; countedQuantity: number; notes: string }, signal?: AbortSignal) =>
    request<StockCount>('/inventory/counts', { method: 'POST', body, signal }),
  reviewCount: (id: number, body: { approve: boolean; notes: string }, signal?: AbortSignal) =>
    request<StockCount>(`/inventory/counts/${id}/review`, { method: 'POST', body, signal }),
}

export const financeApi = {
  invoices: (signal?: AbortSignal, query: PageQuery = {}) => request<PaginatedResult<SupplierInvoice>>('/finance/invoices', { signal }, pageQuery({ page: 1, pageSize: 100, ...query })),
  createInvoice: (body: { purchaseOrderId: number; invoiceNumber: string; quantity: number; unitPrice: number; amount: number; documentReference?: string | null }, signal?: AbortSignal) =>
    request<SupplierInvoice>('/finance/invoices', { method: 'POST', body, signal }),
  reviewInvoice: (id: number, notes?: string, signal?: AbortSignal) =>
    request<SupplierInvoice>(`/finance/invoices/${id}/review`, { method: 'POST', body: { notes: notes || null }, signal }),
  ceoDecision: (id: number, approve: boolean, notes: string, signal?: AbortSignal) =>
    request<SupplierInvoice>(`/finance/invoices/${id}/ceo-decision`, { method: 'POST', body: { approve, notes }, signal }),
  authorize: (id: number, notes?: string, signal?: AbortSignal) =>
    request<SupplierInvoice>(`/finance/invoices/${id}/authorize`, { method: 'POST', body: { notes: notes || null }, signal }),
  authorizations: (unpaidOnly = false, signal?: AbortSignal, query: PageQuery = {}) =>
    request<PaginatedResult<PaymentAuthorization>>('/finance/authorizations', { signal }, { ...pageQuery({ page: 1, pageSize: 100, ...query }), unpaidOnly }),
  pay: (id: number, body: { method: string; externalReference: string; evidenceReference?: string | null; cashAccountId?: number | null }, signal?: AbortSignal) =>
    request<Payment>(`/finance/authorizations/${id}/pay`, { method: 'POST', body, signal }),
  payments: (signal?: AbortSignal, query: PageQuery = {}) => request<PaginatedResult<Payment>>('/finance/payments', { signal }, pageQuery({ page: 1, pageSize: 100, ...query })),
  cashBook: (signal?: AbortSignal) => request<CashBook>('/finance/cash-book', { signal }),
  controlEvents: (
    query: PageQuery & { projectId?: number; requisitionId?: number; chainKey?: string } = {},
    signal?: AbortSignal,
  ) => request<PaginatedResult<ControlEvent>>('/finance/control-events', { signal }, pageQuery({ page: 1, pageSize: 100, ...query })),
}

export const pettyCashApi = {
  list: (signal?: AbortSignal, query: PageQuery = {}) => request<PaginatedResult<PettyCashRequest>>('/finance/petty-cash', { signal }, pageQuery({ page: 1, pageSize: 100, ...query })),
  create: (body: { projectId: number; costCodeId: number; purpose: string; amount: number; neededByDate: string }, signal?: AbortSignal) =>
    request<PettyCashRequest>('/finance/petty-cash', { method: 'POST', body, signal }),
  decide: (id: number, body: { approve: boolean; amountApproved?: number | null; notes: string }, signal?: AbortSignal) =>
    request<PettyCashRequest>(`/finance/petty-cash/${id}/decision`, { method: 'POST', body, signal }),
  disburse: (id: number, body: { method: string; externalReference: string; recipientName: string; recipientAcknowledgementReference: string; evidenceReference: string; cashAccountId?: number | null }, signal?: AbortSignal) =>
    request<PettyCashRequest>(`/finance/petty-cash/${id}/disburse`, { method: 'POST', body, signal }),
  confirmReceipt: (id: number, body: { amountReceived: number; notes?: string | null }, signal?: AbortSignal) =>
    request<PettyCashRequest>(`/finance/petty-cash/${id}/receipt-confirmation`, { method: 'POST', body, signal }),
  reconcile: (id: number, body: { amountSpent: number; amountReturned: number; evidenceReference: string; returnReference?: string | null; notes: string }, signal?: AbortSignal) =>
    request<PettyCashRequest>(`/finance/petty-cash/${id}/reconciliation`, { method: 'POST', body, signal }),
  reviewReconciliation: (id: number, body: { approve: boolean; notes: string }, signal?: AbortSignal) =>
    request<PettyCashRequest>(`/finance/petty-cash/${id}/reconciliation-decision`, { method: 'POST', body, signal }),
}

export const documentsApi = {
  uploadEvidence: (
    file: File,
    sourceType: string,
    sourceId: number,
    evidenceKind: string,
    signal?: AbortSignal,
  ) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('sourceType', sourceType)
    formData.append('sourceId', String(sourceId))
    formData.append('evidenceKind', evidenceKind)
    return requestFormData<EvidenceDocument>('/evidence', formData, signal)
  },
  forSource: (sourceType: string, sourceId: number, signal?: AbortSignal) =>
    request<EvidenceDocument[]>(`/evidence/source/${encodeURIComponent(sourceType)}/${sourceId}`, { signal }),
  content: (documentId: string, signal?: AbortSignal) =>
    requestFile(`/evidence/${encodeURIComponent(documentId)}/content`, signal),
}

export const notificationsApi = {
  list: (signal?: AbortSignal) =>
    request<PaginatedResult<AppNotification>>('/notifications', { signal }, { page: 1, pageSize: 50 }),
  unreadCount: (signal?: AbortSignal) => request<NotificationCount>('/notifications/unread-count', { signal }),
  markRead: (notificationId: number, signal?: AbortSignal) =>
    request<NotificationReadResult>(`/notifications/${notificationId}/read`, { method: 'POST', body: {}, signal }),
  markAllRead: (signal?: AbortSignal) =>
    request<NotificationReadResult>('/notifications/read-all', { method: 'POST', body: {}, signal }),
}

export const tasksApi = {
  list: (query: { projectId?: number; overdueOnly?: boolean } = {}, signal?: AbortSignal) =>
    request<MyTasksResponse>('/my-tasks', { signal }, query),
}

export const openingPositionsApi = {
  list: (projectId?: number, signal?: AbortSignal) =>
    request<OpeningPosition[]>('/controls/opening-positions', { signal }, { projectId }),
  create: (payload: CreateOpeningPositionRequest, signal?: AbortSignal) =>
    request<OpeningPosition>('/controls/opening-positions', { method: 'POST', body: payload, signal }),
  verify: (id: number, approve: boolean, notes: string, signal?: AbortSignal) =>
    request<OpeningPosition>(`/controls/opening-positions/${id}/verify`, {
      method: 'POST', body: { approve, notes }, signal,
    }),
  decide: (id: number, approve: boolean, notes: string, signal?: AbortSignal) =>
    request<OpeningPosition>(`/controls/opening-positions/${id}/decision`, {
      method: 'POST', body: { approve, notes }, signal,
    }),
}

export const cashAccountsApi = {
  list: (projectId: number, signal?: AbortSignal) =>
    request<CashAccount[]>('/controls/cash-accounts', { signal }, { projectId }),
}

export const custodyControlsApi = {
  resolveDispute: (materialIssueId: number, notes: string, evidenceReference?: string | null, signal?: AbortSignal) =>
    request<MaterialIssueDisputeResolution>(`/controls/custody/disputes/${materialIssueId}/resolve`, { method: 'POST', body: { notes, evidenceReference: evidenceReference || null }, signal }),
  returns: (projectId?: number, signal?: AbortSignal) =>
    request<MaterialReturn[]>('/controls/custody/returns', { signal }, { projectId }),
  createReturn: (payload: CreateMaterialReturnRequest, signal?: AbortSignal) =>
    request<MaterialReturn>('/controls/custody/returns', { method: 'POST', body: payload, signal }),
  receiveReturn: (
    id: number,
    payload: { accept: boolean; quantityAccepted: number; notes: string; evidenceReference?: string | null },
    signal?: AbortSignal,
  ) => request<MaterialReturn>(`/controls/custody/returns/${id}/receive`, { method: 'POST', body: payload, signal }),
  closeouts: (projectId?: number, signal?: AbortSignal) =>
    request<CustodyCloseout[]>('/controls/custody/closeouts', { signal }, { projectId }),
  submitCloseout: (payload: { materialIssueId: number; notes?: string | null; evidenceReference?: string | null }, signal?: AbortSignal) =>
    request<CustodyCloseout>('/controls/custody/closeouts', { method: 'POST', body: payload, signal }),
  reviewCloseout: (id: number, approve: boolean, notes: string, signal?: AbortSignal) =>
    request<CustodyCloseout>(`/controls/custody/closeouts/${id}/review`, { method: 'POST', body: { approve, notes }, signal }),
}

export const accountingPeriodsApi = {
  list: (projectId?: number, signal?: AbortSignal) =>
    request<OperationalPeriod[]>('/controls/periods', { signal }, { projectId }),
  create: (payload: CreateOperationalPeriodRequest, signal?: AbortSignal) =>
    request<OperationalPeriod>('/controls/periods', { method: 'POST', body: payload, signal }),
  submitClose: (id: number, notes: string, signal?: AbortSignal) =>
    request<OperationalPeriod>(`/controls/periods/${id}/submit-close`, { method: 'POST', body: { notes }, signal }),
  decide: (id: number, approve: boolean, notes: string, signal?: AbortSignal) =>
    request<OperationalPeriod>(`/controls/periods/${id}/decision`, {
      method: 'POST', body: { approve, notes }, signal,
    }),
  corrections: (projectId?: number, signal?: AbortSignal) =>
    request<ControlledCorrection[]>('/controls/corrections', { signal }, { projectId }),
  createCorrection: (payload: CreateControlledCorrectionRequest, signal?: AbortSignal) =>
    request<ControlledCorrection>('/controls/corrections', { method: 'POST', body: payload, signal }),
  decideCorrection: (id: number, approve: boolean, notes: string, signal?: AbortSignal) =>
    request<ControlledCorrection>(`/controls/corrections/${id}/decision`, {
    method: 'POST', body: { approve, notes }, signal,
  }),
}
