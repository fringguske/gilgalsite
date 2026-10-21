import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  ApiError,
  materialCatalogRequestsApi,
  purchaseOrdersApi,
  requisitionsApi,
  suppliersApi,
  type CurrentUser,
  type MaterialCatalogRequest,
  type PurchaseOrder,
  type PurchaseOrderStatus,
  type Requisition,
  type SupplierSummary,
} from './api'
import { statusText } from './statusLabels'
import './live-api.css'

export interface LiveProcurementViewProps {
  currentUser: CurrentUser
}

export interface LivePurchaseOrdersViewProps {
  currentUser: CurrentUser
}

async function everyPage<T>(load: (page: number) => Promise<{ items: T[]; totalPages: number }>) {
  const first = await load(1)
  const items = [...first.items]
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await load(page)
    items.push(...next.items)
  }
  return items
}

interface NoticeProps {
  tone?: 'error' | 'success' | 'neutral'
  children: ReactNode
}

type OrderAction =
  | 'submit'
  | 'approve'
  | 'issue'
  | 'return'
  | 'reject'
  | 'cancel'
  | 'correct'
  | null

const liveOrderStatuses: PurchaseOrderStatus[] = [
  'Draft',
  'Submitted',
  'Approved',
  'Issued',
]

function Notice({ tone = 'neutral', children }: NoticeProps) {
  return (
    <div className={`lav-notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="lav-loading" role="status" aria-live="polite">
      <span aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="lav-empty">
      <span aria-hidden="true" />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits: digits }).format(value)
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Not shown for this role'
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date)
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
}

function localDate(daysFromToday = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + daysFromToday)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function orderStatusLabel(status: PurchaseOrderStatus): string {
  const labels: Record<PurchaseOrderStatus, string> = {
    Draft: 'Draft',
    Submitted: 'Waiting for Supervisor',
    Approved: 'Approved',
    Issued: 'Sent to supplier',
    Rejected: 'Rejected',
    Cancelled: 'Cancelled',
  }
  return labels[status]
}

function statusTone(status: PurchaseOrderStatus): string {
  if (status === 'Approved' || status === 'Issued') return 'success'
  if (status === 'Rejected' || status === 'Cancelled') return 'danger'
  return 'pending'
}

function projectOptionsFrom(
  currentUser: CurrentUser,
  records: Array<{ projectId: number; projectName: string }>,
) {
  const projects = new Map<number, string>()
  currentUser.projects.forEach((project) => projects.set(project.id, project.name))
  records.forEach((record) => projects.set(record.projectId, record.projectName))
  return [...projects.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Procurement's buying page. Suppliers do not use this system, so price and delivery are agreed
 * with them directly; the officer records the order here and it goes straight to Stores.
 */
export function LiveProcurementView({ currentUser }: LiveProcurementViewProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const allowed = ['Procurement Officer', 'Supervisor', 'CEO', 'Auditor'].includes(currentUser.role)
  const procurement = currentUser.role === 'Procurement Officer'
  const [requisitions, setRequisitions] = useState<Requisition[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([])
  const [catalogRequests, setCatalogRequests] = useState<MaterialCatalogRequest[]>([])
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(allowed)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [projectFilter, setProjectFilter] = useState('')
  const section = procurement && searchParams.get('section') === 'catalog' ? 'catalog' : 'order'

  useEffect(() => {
    if (!allowed) return

    const controller = new AbortController()

    Promise.all([
      everyPage<Requisition>(page => requisitionsApi.list({ page, pageSize: 100, status: 'Approved' }, controller.signal)),
      everyPage<PurchaseOrder>(page => purchaseOrdersApi.list({ page, pageSize: 100 }, controller.signal)),
      procurement
        ? everyPage<SupplierSummary>(page => suppliersApi.list({ page, pageSize: 100 }, controller.signal))
        : Promise.resolve([] as SupplierSummary[]),
      procurement
        ? everyPage<MaterialCatalogRequest>(page => materialCatalogRequestsApi.list({ page, pageSize: 100 }, controller.signal))
          .then(items => ({ items, error: null as string | null }))
          .catch((requestError: unknown) => {
            if (requestError instanceof DOMException && requestError.name === 'AbortError') throw requestError
            return { items: [] as MaterialCatalogRequest[], error: errorMessage(requestError) }
          })
        : Promise.resolve({ items: [] as MaterialCatalogRequest[], error: null as string | null }),
    ])
      .then(([requisitionItems, orderItems, supplierItems, catalogResult]) => {
        setRequisitions(requisitionItems)
        setOrders(orderItems)
        setSuppliers(supplierItems)
        setCatalogRequests(catalogResult.items)
        setCatalogLoadError(catalogResult.error)
        setError(null)
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setError(errorMessage(requestError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [allowed, procurement, refreshKey])

  // The request tracker already decides when the store is short and Procurement has to buy.
  const toOrder = useMemo(() => {
    const ordered = new Set(orders.filter(order => liveOrderStatuses.includes(order.status)).map(order => order.requisitionId))
    return requisitions.filter(request => !ordered.has(request.id)
      && request.progress.state === 'InProgress'
      && request.progress.waitingOn === 'Procurement Officer')
  }, [orders, requisitions])
  const visibleToOrder = toOrder.filter(request => !projectFilter || request.projectId === Number(projectFilter))
  const projects = useMemo(() => projectOptionsFrom(currentUser, toOrder), [currentUser, toOrder])
  const availableSuppliers = suppliers.filter(supplier => !supplier.isBlacklisted)
  const pendingCatalogCount = catalogRequests.filter(request => request.status === 'Pending').length

  if (!allowed) {
    return (
      <div className="lav-view">
        <header className="lav-page-head">
          <div>
            <h1>To order</h1>
          </div>
        </header>
        <EmptyState
          title="This workspace is not part of your role"
          detail="Buying is not available to this role."
        />
      </div>
    )
  }

  return (
    <div className="lav-view lav-procurement-view ceo-readable">
      <header className="lav-page-head">
        <div>
          <h1>{section === 'catalog' ? 'Material catalog' : 'To order'}</h1>
        </div>
        <span className="lav-count-chip">
          {section === 'catalog'
            ? catalogLoadError ? 'Unavailable' : `${pendingCatalogCount} waiting`
            : `${visibleToOrder.length} to order`}
        </span>
      </header>

      {error && (
        <Notice tone="error">
          {error}{' '}
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setError(null)
              setRefreshKey((value) => value + 1)
            }}
          >
            Try again
          </button>
        </Notice>
      )}
      {notice && (
        <Notice tone="success">
          {notice}{' '}
          <button type="button" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </Notice>
      )}

      {procurement && <nav className="lav-po-section-nav" aria-label="Buying sections">
        <button type="button" className={section === 'order' ? 'active' : ''} aria-current={section === 'order' ? 'page' : undefined} onClick={() => setSearchParams({}, { replace: true })}>To order</button>
        <button type="button" className={section === 'catalog' ? 'active' : ''} aria-current={section === 'catalog' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'catalog' }, { replace: true })}>Material catalog</button>
      </nav>}

      {loading ? (
        <LoadingBlock label="Loading requests to order…" />
      ) : section === 'catalog' ? (
        <MaterialCatalogReview
          requests={catalogRequests}
          loadError={catalogLoadError}
          onReviewed={(updated) => {
            setCatalogRequests((current) => current.map((item) => item.id === updated.id ? updated : item))
            setNotice(`Material catalog request ${updated.status.toLowerCase()}.`)
          }}
        />
      ) : (
        <section className="lav-panel">
          <header className="lav-panel-head lav-request-toolbar">
            <div>
              <h2>Approved requests waiting for an order</h2>
            </div>
            <div className="lav-filter-row">
              <label>
                <span className="lav-visually-hidden">Filter by project</span>
                <select value={projectFilter} onChange={(event) => setProjectFilter(event.currentTarget.value)}>
                  <option value="">All projects</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
            </div>
          </header>

          {procurement && availableSuppliers.length === 0 && (
            <Notice>Add the suppliers you buy from under Suppliers before placing an order.</Notice>
          )}

          <div className="lav-purchase-list">
            {visibleToOrder.length === 0 ? (
              <EmptyState
                title="Nothing to order"
                detail={projectFilter
                  ? 'Choose another project.'
                  : 'Approved requests the store cannot cover, and approved store restocks, appear here.'}
              />
            ) : (
              visibleToOrder.map((request) => (
                <OrderRequestCard
                  key={request.id}
                  requisition={request}
                  suppliers={availableSuppliers}
                  canOrder={procurement}
                  onPlaced={(order) => {
                    setOrders((current) => [order, ...current])
                    setNotice(`${order.purchaseOrderNumber} placed with ${order.supplierName}. Stores now see it as an expected delivery.`)
                  }}
                />
              ))
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function OrderRequestCard({
  requisition,
  suppliers,
  canOrder,
  onPlaced,
}: {
  requisition: Requisition
  suppliers: SupplierSummary[]
  canOrder: boolean
  onPlaced: (order: PurchaseOrder) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <article className="lav-purchase-card">
      <header>
        <div className="lav-request-id">
          <span>{requisition.requestType === 'StockReplenishment' ? 'STORE RESTOCK' : 'SITE REQUEST'}</span>
          <strong>{formatNumber(requisition.quantity)} {requisition.materialUnit} {requisition.materialName}</strong>
          <small>{requisition.projectName}</small>
        </div>
        <span className="lav-status pending">Waiting for Procurement Officer</span>
      </header>

      <div className="lav-purchase-facts order">
        <div>
          <span>Needed by</span>
          <strong>{formatDate(requisition.neededByDate)}</strong>
        </div>
        <div>
          <span>Budget area</span>
          <strong>{requisition.costCode} · {requisition.costCodeName}</strong>
        </div>
        <div>
          <span>Purpose</span>
          <strong>{requisition.purpose}</strong>
        </div>
        <div>
          <span>Approved</span>
          <strong>{formatDateTime(requisition.approvedAt)}</strong>
        </div>
      </div>

      {open ? (
        <PlaceOrderForm
          requisition={requisition}
          suppliers={suppliers}
          onCancel={() => setOpen(false)}
          onPlaced={onPlaced}
        />
      ) : canOrder && (
        <div className="lav-card-action-row">
          <span>Agree the price and delivery with the supplier, then record the order here.</span>
          <button className="lav-button primary" type="button" disabled={suppliers.length === 0} onClick={() => setOpen(true)}>
            Order from a supplier
          </button>
        </div>
      )}
    </article>
  )
}

function PlaceOrderForm({
  requisition,
  suppliers,
  onCancel,
  onPlaced,
}: {
  requisition: Requisition
  suppliers: SupplierSummary[]
  onCancel: () => void
  onPlaced: (order: PurchaseOrder) => void
}) {
  const [supplierId, setSupplierId] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(localDate(7))
  const [deliveryLocation, setDeliveryLocation] = useState('')
  const [supplierReference, setSupplierReference] = useState('')
  const [notes, setNotes] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supplier = suppliers.find((item) => item.id === Number(supplierId)) ?? null
  const price = Number(unitPrice)
  const total = unitPrice !== '' && Number.isFinite(price) && price > 0 ? price * requisition.quantity : null
  const item = `${formatNumber(requisition.quantity)} ${requisition.materialUnit} ${requisition.materialName}`

  async function place() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const order = await purchaseOrdersApi.place({
        requisitionId: requisition.id,
        supplierId: Number(supplierId),
        unitPrice: price,
        expectedDeliveryDate,
        deliveryLocation: deliveryLocation.trim() || null,
        supplierReference: supplierReference.trim() || null,
        notes: notes.trim() || null,
      })
      onPlaced(order)
    } catch (requestError) {
      setError(errorMessage(requestError))
      setReviewing(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="lav-workflow-form lav-order-create-form"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        setReviewing(true)
      }}
    >
      <header>
        <div>
          <span className="lav-kicker">Purchase order</span>
          <h3>Order {item}</h3>
        </div>
        <button className="lav-text-button" type="button" onClick={onCancel}>Cancel</button>
      </header>
      {error && <Notice tone="error">{error}</Notice>}

      {reviewing && supplier && total !== null ? (
        <div className="lav-order-confirm" role="group" aria-label="Check the order">
          <strong>Place this order with {supplier.name}?</strong>
          <p>
            {item} at {formatMoney(price)} each, {formatMoney(total)} in total, delivered by{' '}
            {formatDate(expectedDeliveryDate)} to {deliveryLocation.trim() || requisition.projectName}.
          </p>
          <p>It is recorded as sent to the supplier and cannot be changed afterwards, so check the supplier and price.</p>
          <div className="lav-form-actions">
            <button className="lav-button secondary" type="button" disabled={busy} onClick={() => setReviewing(false)}>Back</button>
            <button className="lav-button primary" type="button" disabled={busy} onClick={() => void place()}>
              {busy ? 'Placing…' : 'Place order'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="lav-form-grid lav-purchase-form-grid">
            <label className="lav-field compact span-two">
              <span>Supplier</span>
              <select required value={supplierId} onChange={(event) => setSupplierId(event.currentTarget.value)}>
                <option value="">Choose supplier</option>
                {suppliers.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}{option.category ? ` · ${option.category}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="lav-field compact">
              <span>Unit price (KES)</span>
              <input type="number" min="0.01" step="0.01" inputMode="decimal" required value={unitPrice} onChange={(event) => setUnitPrice(event.currentTarget.value)} />
            </label>
            <label className="lav-field compact">
              <span>Expected delivery</span>
              <input type="date" min={localDate()} required value={expectedDeliveryDate} onChange={(event) => setExpectedDeliveryDate(event.currentTarget.value)} />
            </label>
            <label className="lav-field compact span-two">
              <span>Deliver to <small>Defaults to the project location</small></span>
              <input maxLength={300} value={deliveryLocation} onChange={(event) => setDeliveryLocation(event.currentTarget.value)} />
            </label>
            <label className="lav-field compact">
              <span>Supplier&apos;s quote or invoice no. <small>Optional</small></span>
              <input maxLength={100} value={supplierReference} onChange={(event) => setSupplierReference(event.currentTarget.value)} />
            </label>
            <label className="lav-field compact span-two">
              <span>Notes <small>Optional</small></span>
              <input maxLength={1000} value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
            </label>
          </div>
          <div className="lav-form-actions">
            <span>{total !== null ? `Order total: ${formatMoney(total)}` : 'The quantity is the approved quantity.'}</span>
            <button className="lav-button primary" type="submit">Review order</button>
          </div>
        </>
      )}
    </form>
  )
}

function MaterialCatalogReview({
  requests,
  loadError,
  onReviewed,
}: {
  requests: MaterialCatalogRequest[]
  loadError: string | null
  onReviewed: (request: MaterialCatalogRequest) => void
}) {
  const pending = requests.filter((request) => request.status === 'Pending')
  const reviewed = requests.filter((request) => request.status !== 'Pending')

  return (
    <section className="lav-panel material-catalog-review">
      <header className="lav-panel-head">
        <div><h2>Material catalog requests</h2></div>
        <span className="lav-count-chip">{pending.length} waiting</span>
      </header>

      {loadError && <Notice tone="error">Material catalog requests could not be loaded. {loadError}</Notice>}

      <div className="material-catalog-group pending">
        <h3>Waiting review</h3>
        {!loadError && pending.length === 0
          ? <div className="material-catalog-empty">No pending catalog requests.</div>
          : pending.map((request) => (
            <MaterialCatalogRequestCard key={request.id} request={request} canReview onReviewed={onReviewed} />
          ))}
      </div>

      {reviewed.length > 0 && (
        <details className="material-catalog-history">
          <summary>Reviewed <b>{reviewed.length}</b></summary>
          <div>
            {reviewed.map((request) => (
              <MaterialCatalogRequestCard key={request.id} request={request} canReview={false} onReviewed={onReviewed} />
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

function MaterialCatalogRequestCard({
  request,
  canReview,
  onReviewed,
}: {
  request: MaterialCatalogRequest
  canReview: boolean
  onReviewed: (request: MaterialCatalogRequest) => void
}) {
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [notes, setNotes] = useState('')
  const reviewLock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!decision || reviewLock.current) return
    reviewLock.current = true
    setBusy(true)
    setError(null)
    try {
      const updated = await materialCatalogRequestsApi.review(request.id, {
        approve: decision === 'approve',
        notes: notes.trim(),
      })
      onReviewed(updated)
      setDecision(null)
      setNotes('')
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      reviewLock.current = false
      setBusy(false)
    }
  }

  return (
    <article className={`material-catalog-card status-${request.status.toLowerCase()}`}>
      <header>
        <div><h3>{request.name}</h3><span>{request.unit}</span></div>
        <b>{statusText('MaterialCatalogRequest', request.status)}</b>
      </header>
      <dl>
        <div><dt>Project</dt><dd>{request.projectName}</dd></div>
        <div><dt>Category</dt><dd>{request.category || 'Not specified'}</dd></div>
        <div><dt>Requested by</dt><dd>{request.submittedByName}</dd></div>
        <div><dt>Submitted</dt><dd>{formatDateTime(request.submittedAt)}</dd></div>
      </dl>
      <p><strong>Purpose</strong>{request.purpose}</p>

      {request.status !== 'Pending' && (
        <div className="material-catalog-decision">
          <strong>{request.status} by {request.reviewedByName}</strong>
          {request.reviewNotes && <span>{request.reviewNotes}</span>}
        </div>
      )}

      {canReview && request.status === 'Pending' && !decision && (
        <footer>
          <button type="button" className="lav-button secondary" onClick={() => setDecision('reject')}>Reject</button>
          <button type="button" className="lav-button primary" onClick={() => setDecision('approve')}>Approve material</button>
        </footer>
      )}

      {decision && (
        <form onSubmit={review}>
          {error && <Notice tone="error">{error}</Notice>}
          <label className="lav-field">
            <span>{decision === 'approve' ? 'Approval note' : 'Reason for rejection'}</span>
            <textarea required minLength={3} maxLength={1000} rows={2} value={notes} onChange={(event) => setNotes(event.currentTarget.value)} />
          </label>
          <div>
            <button type="button" className="lav-button secondary" onClick={() => setDecision(null)}>Cancel</button>
            <button className="lav-button primary" disabled={busy}>{busy ? 'Saving…' : 'Confirm'}</button>
          </div>
        </form>
      )}
    </article>
  )
}

export function LivePurchaseOrdersView({ currentUser }: LivePurchaseOrdersViewProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const allowed = [
    'Procurement Officer',
    'Supervisor',
    'Storekeeper',
    'Finance Officer',
    'CEO',
    'Auditor',
  ].includes(currentUser.role)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(allowed)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [projectFilter, setProjectFilter] = useState('')
  const procurement = currentUser.role === 'Procurement Officer'
  // Orders are placed and sent in one step now; Draft, Submitted and Approved only exist on
  // orders started on the old quote screens, so their tab appears only while any remain.
  const unfinishedOrders = orders.filter(order => order.status === 'Draft' || order.status === 'Submitted' || order.status === 'Approved')
  const requestedProcurementSection = searchParams.get('section')
  const procurementSection = requestedProcurementSection === 'history'
    ? 'history'
    : requestedProcurementSection === 'unfinished' && unfinishedOrders.length > 0
      ? 'unfinished'
      : 'sent'
  const simplifiedOrderRole = currentUser.role === 'Supervisor' || currentUser.role === 'Storekeeper' || currentUser.role === 'Finance Officer'
  const showHistory = searchParams.get('view') === 'history'

  useEffect(() => {
    if (!allowed) return
    const controller = new AbortController()
    everyPage<PurchaseOrder>(page => purchaseOrdersApi.list({ page, pageSize: 100 }, controller.signal))
      .then((result) => {
        setOrders(result)
        setError(null)
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setError(errorMessage(requestError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [allowed, refreshKey])

  const projects = useMemo(
    () => projectOptionsFrom(currentUser, orders),
    [currentUser, orders],
  )
  const filteredOrders = useMemo(() => {
    return orders.filter(
      (order) => {
        if (projectFilter && order.projectId !== Number(projectFilter)) return false
        if (procurement) {
          if (procurementSection === 'sent') return order.status === 'Issued'
          if (procurementSection === 'unfinished') return unfinishedOrders.includes(order)
          return order.status === 'Rejected' || order.status === 'Cancelled'
        }
        if (!simplifiedOrderRole) return true
        const current = currentUser.role === 'Storekeeper'
          ? order.status === 'Issued'
          : currentUser.role === 'Supervisor'
            ? order.status === 'Submitted'
            : order.status !== 'Rejected' && order.status !== 'Cancelled'
        return showHistory ? !current : current
      },
    )
  }, [currentUser.role, orders, procurement, procurementSection, projectFilter, showHistory, simplifiedOrderRole, unfinishedOrders])

  const sectionTitle = procurement
    ? procurementSection === 'sent'
      ? 'Sent to supplier'
      : procurementSection === 'unfinished'
        ? 'Unfinished orders'
        : 'Order history'
    : simplifiedOrderRole
      ? showHistory
        ? 'Order history'
        : currentUser.role === 'Storekeeper'
          ? 'Expected deliveries'
          : currentUser.role === 'Supervisor'
            ? 'Orders to review'
            : 'Current orders'
      : 'Orders'

  function replaceOrder(updated: PurchaseOrder, message: string) {
    setOrders((current) => current.map((order) => (order.id === updated.id ? updated : order)))
    setNotice(message)
  }

  if (!allowed) {
    return (
      <div className="lav-view">
        <header className="lav-page-head">
          <div>
            <h1>Purchase orders</h1>
          </div>
        </header>
        <EmptyState title="This workspace is not part of your role" detail="Purchase orders are not available to this role." />
      </div>
    )
  }

  return (
    <div className="lav-view lav-procurement-view ceo-readable">
      <header className="lav-page-head">
        <div>
          <h1>Purchase orders</h1>
        </div>
        <span className="lav-count-chip">{filteredOrders.length} visible</span>
      </header>

      {error && (
        <Notice tone="error">
          {error}{' '}
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setError(null)
              setRefreshKey((value) => value + 1)
            }}
          >
            Try again
          </button>
        </Notice>
      )}
      {notice && (
        <Notice tone="success">
          {notice}{' '}
          <button type="button" onClick={() => setNotice(null)}>Dismiss</button>
        </Notice>
      )}

      {simplifiedOrderRole && <nav className="lav-po-section-nav" aria-label="Purchase order sections">
        <button type="button" className={!showHistory ? 'active' : ''} aria-current={!showHistory ? 'page' : undefined} onClick={() => setSearchParams({}, { replace: true })}>{currentUser.role === 'Storekeeper' ? 'Expected deliveries' : currentUser.role === 'Supervisor' ? 'Needs review' : 'Current orders'}</button>
        <button type="button" className={showHistory ? 'active' : ''} aria-current={showHistory ? 'page' : undefined} onClick={() => setSearchParams({ view: 'history' }, { replace: true })}>History</button>
      </nav>}

      {procurement && <nav className={`lav-po-section-nav ${unfinishedOrders.length > 0 ? 'three-tabs' : ''}`} aria-label="Procurement purchase order sections">
        <button type="button" className={procurementSection === 'sent' ? 'active' : ''} aria-current={procurementSection === 'sent' ? 'page' : undefined} onClick={() => setSearchParams({}, { replace: true })}>Sent to supplier</button>
        {unfinishedOrders.length > 0 && <button type="button" className={procurementSection === 'unfinished' ? 'active' : ''} aria-current={procurementSection === 'unfinished' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'unfinished' }, { replace: true })}>Unfinished ({unfinishedOrders.length})</button>}
        <button type="button" className={procurementSection === 'history' ? 'active' : ''} aria-current={procurementSection === 'history' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'history' }, { replace: true })}>History</button>
      </nav>}

      {loading ? (
        <LoadingBlock label="Loading purchase orders…" />
      ) : (
        <section className="lav-panel">
          <header className="lav-panel-head lav-request-toolbar">
            <div>
              <h2>{sectionTitle}</h2>
            </div>
            <div className="lav-filter-row">
              <label>
                <span className="lav-visually-hidden">Filter by project</span>
                <select value={projectFilter} onChange={(event) => setProjectFilter(event.currentTarget.value)}>
                  <option value="">All projects</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
            </div>
          </header>
          <div className="lav-purchase-list">
            {filteredOrders.length === 0 ? (
              <EmptyState
                title="No purchase orders here"
                detail={orders.length ? 'Choose another project.' : 'Orders appear here once they are placed from To order.'}
              />
            ) : (
              filteredOrders.map((order) => (
                <PurchaseOrderCard
                  key={order.id}
                  order={order}
                  currentUser={currentUser}
                  onChanged={replaceOrder}
                />
              ))
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function PurchaseOrderCard({
  order,
  currentUser,
  onChanged,
}: {
  order: PurchaseOrder
  currentUser: CurrentUser
  onChanged: (order: PurchaseOrder, message: string) => void
}) {
  const [action, setAction] = useState<OrderAction>(null)
  const procurement = currentUser.role === 'Procurement Officer'
  const reviewer = currentUser.role === 'Supervisor' || currentUser.role === 'CEO'
  const creator = order.createdByUserId === currentUser.id
  const canSubmit = procurement && creator && order.status === 'Draft'
  const canCorrect = canSubmit
  const canIssue = procurement && order.status === 'Approved'
  const canProcurementCancel = procurement && creator && (order.status === 'Draft' || order.status === 'Rejected')
  const canReview = reviewer && order.status === 'Submitted'
  const canReviewerCancel = reviewer && (order.status === 'Submitted' || order.status === 'Approved')
  const showActions = canSubmit || canCorrect || canIssue || canProcurementCancel || canReview || canReviewerCancel
  const line = order.lines[0]

  return (
    <article className="lav-purchase-card">
      <header>
        <div className="lav-request-id">
          <span>{order.status === 'Cancelled' ? 'CANCELLED ORDER' : 'PURCHASE ORDER'}</span>
          <strong>{order.supplierName}</strong>
          <small>{order.projectName}</small>
        </div>
        <span className={`lav-status ${statusTone(order.status)}`}>{orderStatusLabel(order.status)}</span>
      </header>

      <div className="lav-purchase-facts order">
        <div>
          <span>Material</span>
          <strong>{line ? `${formatNumber(line.quantity)} ${line.materialUnit} ${line.materialName}` : 'No lines returned'}</strong>
        </div>
        <div>
          <span>Order value</span>
          <strong>{formatMoney(order.totalAmount)}</strong>
        </div>
        <div>
          <span>Expected delivery</span>
          <strong>{formatDate(order.expectedDeliveryDate)}</strong>
        </div>
        <div>
          <span>Deliver to</span>
          <strong>{order.deliveryLocation || order.projectName}</strong>
        </div>
      </div>

      {order.notes && <p className="lav-action-message">{order.notes}</p>}
      <OrderMilestones order={order} />

      {action && (
        <OrderActionForm
          key={action}
          order={order}
          action={action}
          onCancel={() => setAction(null)}
          onChanged={(updated, message) => {
            onChanged(updated, message)
            setAction(null)
          }}
        />
      )}

      {showActions && (
        <div className="lav-card-action-row lav-multi-actions">
          {canCorrect && <button className="lav-button secondary" type="button" onClick={() => setAction('correct')}>Correct details</button>}
          {canSubmit && <button className="lav-button primary" type="button" onClick={() => setAction('submit')}>Submit and approve</button>}
          {canIssue && <button className="lav-button primary" type="button" onClick={() => setAction('issue')}>Issue to supplier</button>}
          {canReview && <button className="lav-button primary" type="button" onClick={() => setAction('approve')}>Approve</button>}
          {canReview && <button className="lav-button secondary" type="button" onClick={() => setAction('return')}>Return for correction</button>}
          {canReview && <button className="lav-button danger-outline" type="button" onClick={() => setAction('reject')}>Reject</button>}
          {(canProcurementCancel || canReviewerCancel) && <button className="lav-button danger-outline" type="button" onClick={() => setAction('cancel')}>Cancel order</button>}
        </div>
      )}

      {(currentUser.role === 'CEO' || currentUser.role === 'Auditor') && (
        <WorkflowHistory
          title="Complete order history"
          events={order.events.map((event) => ({
            id: event.id,
            eventType: event.eventType,
            actor: `${event.actorUserName} · ${event.actorRole}`,
            notes: event.notes,
            occurredAt: event.occurredAt,
          }))}
        />
      )}
    </article>
  )
}

function OrderMilestones({ order }: { order: PurchaseOrder }) {
  const milestones = [
    { label: 'Prepared', at: order.createdAt, by: order.createdByUserName, reached: true },
    { label: 'Sent to supplier', at: order.issuedAt, by: order.issuedByUserName, reached: order.status === 'Issued' },
  ]
  return (
    <ol className="lav-order-milestones" aria-label="Purchase order progress">
      {milestones.map((milestone) => (
        <li key={milestone.label} className={milestone.at || milestone.reached ? 'done' : ''}>
          <i aria-hidden="true" />
          <span>{milestone.label}</span>
          <small>{milestone.at ? `${formatDateTime(milestone.at)}${milestone.by ? ` · ${milestone.by}` : ''}` : milestone.reached ? 'Completed' : 'Not reached'}</small>
        </li>
      ))}
    </ol>
  )
}

function OrderActionForm({
  order,
  action,
  onCancel,
  onChanged,
}: {
  order: PurchaseOrder
  action: Exclude<OrderAction, null>
  onCancel: () => void
  onChanged: (order: PurchaseOrder, message: string) => void
}) {
  const [notes, setNotes] = useState(action === 'correct' ? (order.notes ?? '') : '')
  const [reason, setReason] = useState('')
  const [deliveryDate, setDeliveryDate] = useState(order.expectedDeliveryDate ?? localDate())
  const [deliveryLocation, setDeliveryLocation] = useState(order.deliveryLocation ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reasonRequired = action === 'return' || action === 'reject' || action === 'cancel' || action === 'correct'

  const titles: Record<Exclude<OrderAction, null>, string> = {
    submit: 'Submit and approve order',
    approve: 'Approve supplier order',
    issue: 'Issue approved order',
    return: 'Return order for correction',
    reject: 'Reject order',
    cancel: 'Cancel order',
    correct: 'Correct delivery details',
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      let updated: PurchaseOrder
      if (action === 'submit') {
        updated = await purchaseOrdersApi.submit(order.id, { notes: notes.trim() || null })
      } else if (action === 'approve') {
        updated = await purchaseOrdersApi.approve(order.id, { notes: notes.trim() || null })
      } else if (action === 'issue') {
        updated = await purchaseOrdersApi.issue(order.id, { notes: notes.trim() || null })
      } else if (action === 'return') {
        updated = await purchaseOrdersApi.returnToDraft(order.id, { reason: reason.trim() })
      } else if (action === 'reject') {
        updated = await purchaseOrdersApi.reject(order.id, { reason: reason.trim() })
      } else if (action === 'cancel') {
        updated = await purchaseOrdersApi.cancel(order.id, { reason: reason.trim() })
      } else {
        updated = await purchaseOrdersApi.correct(order.id, {
          expectedDeliveryDate: deliveryDate,
          deliveryLocation: deliveryLocation.trim() || null,
          notes: notes.trim() || null,
          reason: reason.trim(),
        })
      }
      onChanged(updated, `Order ${orderStatusLabel(updated.status).toLowerCase()}.`)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="lav-workflow-form" onSubmit={submit}>
      <header>
        <div>
          <span className="lav-kicker">Recorded action</span>
          <h3>{titles[action]}</h3>
        </div>
        <button className="lav-text-button" type="button" onClick={onCancel}>Cancel</button>
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      {action === 'correct' && (
        <div className="lav-form-grid lav-purchase-form-grid">
          <label className="lav-field compact">
            <span>Expected delivery</span>
            <input type="date" min={localDate()} value={deliveryDate} onChange={(event) => setDeliveryDate(event.currentTarget.value)} required />
          </label>
          <label className="lav-field compact span-two">
            <span>Delivery location</span>
            <input value={deliveryLocation} onChange={(event) => setDeliveryLocation(event.currentTarget.value)} maxLength={300} />
          </label>
        </div>
      )}
      {(action === 'submit' || action === 'approve' || action === 'issue' || action === 'correct') && (
        <label className="lav-field compact lav-action-field">
          <span>{action === 'correct' ? 'Order notes' : 'Action note'} <small>Optional</small></span>
          <textarea value={notes} onChange={(event) => setNotes(event.currentTarget.value)} maxLength={1000} rows={2} />
        </label>
      )}
      {reasonRequired && (
        <label className="lav-field compact lav-action-field">
          <span>Reason</span>
          <textarea value={reason} onChange={(event) => setReason(event.currentTarget.value)} minLength={3} maxLength={1000} rows={2} required />
        </label>
      )}
      <div className="lav-form-actions">
        <span />
        <button className={`lav-button ${action === 'reject' || action === 'cancel' ? 'danger' : 'primary'}`} type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Confirm action'}
        </button>
      </div>
    </form>
  )
}

function WorkflowHistory({
  title,
  events,
}: {
  title: string
  events: Array<{
    id: number
    eventType: string
    actor: string
    notes: string | null
    occurredAt: string
  }>
}) {
  return (
    <details className="lav-history">
      <summary>
        <span>
          <strong>{title}</strong>
          <small>{events.length} recorded events</small>
        </span>
        <b>Open</b>
      </summary>
      <ol>
        {events.length ? (
          events.map((event, index) => (
            <li key={event.id}>
              <span>{index + 1}</span>
              <div>
                <strong>{event.eventType}</strong>
                <p>{event.actor} · {formatDateTime(event.occurredAt)}</p>
                {event.notes && <blockquote>{event.notes}</blockquote>}
              </div>
            </li>
          ))
        ) : (
          <li className="lav-history-empty">No detailed events were returned.</li>
        )}
      </ol>
    </details>
  )
}
