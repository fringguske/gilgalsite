import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import {
  ApiError,
  supplierOnboardingApi,
  suppliersApi,
  type CurrentUser,
  type SupplierOnboardingRequest,
  type SupplierOnboardingStatus,
  type SupplierSummary,
} from './api'
import './live-suppliers.css'
import './supplier-loading.css'

export interface LiveSuppliersViewProps {
  currentUser: CurrentUser
}

const supplierCategories = [
  'Cement & concrete',
  'Aggregates & masonry',
  'Reinforcement steel',
  'Timber & formwork',
  'Roofing',
  'Electrical',
  'Plumbing',
  'Finishes',
  'General hardware',
  'Equipment',
  'Transport',
  'Other',
]

function messageFrom(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : 'The request could not be completed.'
}

function formatDateTime(value: string | null) {
  if (!value) return 'Not reviewed'
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function statusLabel(status: SupplierOnboardingStatus) {
  if (status === 'Pending') return 'Awaiting independent review'
  return status
}

function SupplierLoading() {
  return <div className="supplier-loading" role="status" aria-live="polite"><span/><p>Loading supplier records…</p></div>
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

export function LiveSuppliersView({ currentUser }: LiveSuppliersViewProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [requests, setRequests] = useState<SupplierOnboardingRequest[]>([])
  const [suppliers, setSuppliers] = useState<SupplierSummary[]>([])
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [suppliersLoading, setSuppliersLoading] = useState(true)
  const [requestsLoadError, setRequestsLoadError] = useState<string | null>(null)
  const [suppliersLoadError, setSuppliersLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [blacklistBusyId, setBlacklistBusyId] = useState<number | null>(null)
  const canSubmit = currentUser.role === 'Procurement Officer'
  const canReview = currentUser.role === 'CEO' || currentUser.role === 'Finance Officer'

  useEffect(() => {
    const controller = new AbortController()

    void everyPage<SupplierOnboardingRequest>(page => supplierOnboardingApi.list({ page, pageSize: 100 }, controller.signal))
      .then(requestItems => {
        setRequests(requestItems)
        setRequestsLoadError(null)
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setRequestsLoadError(messageFrom(requestError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRequestsLoading(false)
      })

    void everyPage<SupplierSummary>(page => suppliersApi.list({ page, pageSize: 100 }, controller.signal))
      .then(supplierItems => {
        setSuppliers(supplierItems)
        setSuppliersLoadError(null)
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setSuppliersLoadError(messageFrom(requestError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSuppliersLoading(false)
      })
    return () => controller.abort()
  }, [refreshKey])

  const pendingCount = requests.filter(request => request.status === 'Pending').length
  const sectionParam = searchParams.get('section')
  const selectedFinanceSection: SupplierOnboardingStatus | 'Register' = sectionParam === 'approved'
    ? 'Approved'
    : sectionParam === 'rejected'
      ? 'Rejected'
      : sectionParam === 'register'
        ? 'Register'
        : 'Pending'
  const selectedProcurementSection = sectionParam === 'new'
    ? 'New'
    : sectionParam === 'register'
      ? 'Register'
      : 'Applications'
  const requestGroups: Array<{ status: SupplierOnboardingStatus; title: string; items: SupplierOnboardingRequest[] }> = [
    { status: 'Pending', title: 'Awaiting review', items: requests.filter(request => request.status === 'Pending') },
    { status: 'Approved', title: 'Approved applications', items: requests.filter(request => request.status === 'Approved') },
    { status: 'Rejected', title: 'Rejected applications', items: requests.filter(request => request.status === 'Rejected') },
  ]
  const visibleRequestCount = currentUser.role === 'Finance Officer'
    ? requestGroups.find(group => group.status === selectedFinanceSection)?.items.length ?? 0
    : requests.length
  const showApplications = currentUser.role === 'Finance Officer'
    ? selectedFinanceSection !== 'Register'
    : currentUser.role === 'Procurement Officer'
      ? selectedProcurementSection === 'Applications'
      : true
  const showRegister = currentUser.role === 'Finance Officer'
    ? selectedFinanceSection === 'Register'
    : currentUser.role === 'Procurement Officer'
      ? selectedProcurementSection === 'Register'
      : true

  async function toggleBlacklist(supplier: SupplierSummary) {
    setBlacklistBusyId(supplier.id)
    setError(null)
    try {
      const updated = await suppliersApi.setBlacklistStatus(supplier.id, !supplier.isBlacklisted)
      setSuppliers(current => current.map(item => item.id === updated.id ? updated : item))
      setMessage(`${updated.name} is now ${updated.isBlacklisted ? 'blocked from sourcing' : 'available for sourcing'}.`)
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setBlacklistBusyId(null)
    }
  }

  return (
    <div className="supplier-view ceo-readable">
      <header className="supplier-page-head">
        <div>
          {currentUser.role !== 'Finance Officer' && <span>SUPPLIER CONTROL</span>}
          <h1>{currentUser.role === 'Finance Officer' ? 'Supplier approvals' : 'Supplier onboarding'}</h1>
        </div>
        <div className={pendingCount > 0 ? 'needs-review' : ''}>
          <strong>{requestsLoading || requestsLoadError ? 'Unavailable' : pendingCount}</strong>
          <span>awaiting review</span>
        </div>
      </header>

      {error && <div className="supplier-notice error" role="alert">{error}</div>}
      {message && <div className="supplier-notice success">{message}</div>}

      {currentUser.role === 'Procurement Officer' && <nav className="ops-action-nav supplier-control-nav procurement-supplier-nav" aria-label="Supplier onboarding sections">
        <button type="button" className={selectedProcurementSection === 'New' ? 'active' : ''} aria-current={selectedProcurementSection === 'New' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'new' }, { replace: true })}>New supplier</button>
        <button type="button" className={selectedProcurementSection === 'Applications' ? 'active' : ''} aria-current={selectedProcurementSection === 'Applications' ? 'page' : undefined} onClick={() => setSearchParams({}, { replace: true })}>Applications</button>
        <button type="button" className={selectedProcurementSection === 'Register' ? 'active' : ''} aria-current={selectedProcurementSection === 'Register' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'register' }, { replace: true })}>Supplier register</button>
      </nav>}

      {canSubmit && selectedProcurementSection === 'New' && (
        <SupplierApplicationForm
          initiallyOpen
          onSubmitted={request => {
            setRequests(current => [request, ...current])
            setMessage('Supplier application submitted.')
            setSearchParams({}, { replace: true })
          }}
        />
      )}

      {currentUser.role === 'Finance Officer' && <nav className="ops-action-nav supplier-control-nav" aria-label="Supplier approval sections">
        <button type="button" className={selectedFinanceSection === 'Pending' ? 'active' : ''} aria-current={selectedFinanceSection === 'Pending' ? 'page' : undefined} onClick={() => setSearchParams({}, { replace: true })}>Waiting review</button>
        <button type="button" className={selectedFinanceSection === 'Approved' ? 'active' : ''} aria-current={selectedFinanceSection === 'Approved' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'approved' }, { replace: true })}>Approved</button>
        <button type="button" className={selectedFinanceSection === 'Rejected' ? 'active' : ''} aria-current={selectedFinanceSection === 'Rejected' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'rejected' }, { replace: true })}>Rejected</button>
        <button type="button" className={selectedFinanceSection === 'Register' ? 'active' : ''} aria-current={selectedFinanceSection === 'Register' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'register' }, { replace: true })}>Supplier register</button>
      </nav>}

      {showApplications && <section className="supplier-panel">
        <header className="supplier-section-head">
          <div>
            {currentUser.role !== 'Finance Officer' && <span>APPLICATIONS</span>}
            <h2>{currentUser.role === 'Finance Officer' ? requestGroups.find(group => group.status === selectedFinanceSection)?.title : 'Onboarding decisions'}</h2>
          </div>
        </header>

        {requestsLoadError && <div className="supplier-notice error" role="alert">Supplier applications could not be loaded: {requestsLoadError}</div>}
        {requestsLoading ? (
          <SupplierLoading />
        ) : visibleRequestCount === 0 ? (
          requestsLoadError ? null : <div className="supplier-empty">{currentUser.role === 'Finance Officer'
            ? selectedFinanceSection === 'Pending' ? 'No supplier application is waiting for review.' : `No ${String(selectedFinanceSection).toLowerCase()} supplier application recorded.`
            : 'No supplier applications have been submitted.'}</div>
        ) : (
          <div className="supplier-decision-groups">
            {requestGroups.filter(group => currentUser.role !== 'Finance Officer' || group.status === selectedFinanceSection).map(group => group.items.length > 0 && (
              <section className={`supplier-decision-group ${group.status.toLowerCase()}`} key={group.status}>
                <header><h3>{group.title}</h3><strong>{group.items.length}</strong></header>
                <div className="supplier-request-list">
                  {group.items.map(request => (
                    <SupplierRequestCard
                      key={request.id}
                      request={request}
                      canReview={canReview}
                      onReviewed={updated => {
                        setRequests(current => current.map(item => item.id === updated.id ? updated : item))
                        setMessage(`Supplier application ${updated.status.toLowerCase()}.`)
                        if (updated.status === 'Approved') setRefreshKey(value => value + 1)
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>}

      {showRegister && <section className="supplier-panel">
        <header className="supplier-section-head">
          <div>
            <span>APPROVED REGISTER</span>
            <h2>Suppliers available for quotation</h2>
          </div>
          <b>{suppliersLoading || suppliersLoadError ? 'Unavailable' : suppliers.filter(supplier => !supplier.isBlacklisted).length} available</b>
        </header>
        {suppliersLoadError && <div className="supplier-notice error" role="alert">Supplier register could not be loaded: {suppliersLoadError}</div>}
        {suppliersLoading ? <SupplierLoading /> : suppliers.length === 0 ? (
          suppliersLoadError ? null :
          <div className="supplier-empty">No supplier has completed approval yet.</div>
        ) : (
          <div className="approved-supplier-list">
            {suppliers.map(supplier => (
              <article key={supplier.id}>
                <div className="supplier-monogram" aria-hidden="true">{supplier.name.charAt(0).toUpperCase()}</div>
                <div>
                  <strong>{supplier.name}</strong>
                  <span>{supplier.category || 'Uncategorised supplier'}</span>
                </div>
                <span className={`supplier-register-state ${supplier.isBlacklisted ? 'blocked' : ''}`}>
                  {supplier.isBlacklisted ? 'Blocked' : 'Approved'}
                </span>
                {currentUser.role === 'CEO' && (
                  <button
                    type="button"
                    disabled={blacklistBusyId !== null}
                    onClick={() => void toggleBlacklist(supplier)}
                  >
                    {blacklistBusyId === supplier.id
                      ? 'Saving…'
                      : supplier.isBlacklisted ? 'Reinstate' : 'Block'}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>}
    </div>
  )
}

function SupplierApplicationForm({
  onSubmitted,
  initiallyOpen = false,
}: {
  onSubmitted: (request: SupplierOnboardingRequest) => void
  initiallyOpen?: boolean
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const [form, setForm] = useState({
    name: '', contactPerson: '', phoneNumber: '', email: '', kraPin: '', mpesaNumber: '', category: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const request = await supplierOnboardingApi.submit({
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim(),
        phoneNumber: form.phoneNumber.trim(),
        email: form.email.trim() || null,
        kraPin: form.kraPin.trim().toUpperCase(),
        mpesaNumber: form.mpesaNumber.trim() || null,
        category: form.category,
      })
      onSubmitted(request)
      setForm({ name: '', contactPerson: '', phoneNumber: '', email: '', kraPin: '', mpesaNumber: '', category: '' })
      setOpen(false)
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`supplier-application ${open ? 'open' : ''}`}>
      <button type="button" className="supplier-application-toggle" onClick={() => setOpen(value => !value)}>
        <span>+</span>
        <div><strong>Submit a new supplier</strong></div>
        <b>{open ? 'Close' : 'Open form'}</b>
      </button>
      {open && (
        <form onSubmit={submit}>
          {error && <div className="supplier-notice error" role="alert">{error}</div>}
          <div className="supplier-form-grid">
            <label><span>Registered business name</span><input required minLength={2} maxLength={200} value={form.name} onChange={event => setForm({ ...form, name: event.currentTarget.value })}/></label>
            <label><span>Supply category</span><select required value={form.category} onChange={event => setForm({ ...form, category: event.currentTarget.value })}><option value="">Choose category</option>{supplierCategories.map(category => <option key={category}>{category}</option>)}</select></label>
            <label><span>Contact person</span><input required minLength={2} maxLength={150} value={form.contactPerson} onChange={event => setForm({ ...form, contactPerson: event.currentTarget.value })}/></label>
            <label><span>Phone number</span><input required type="tel" minLength={7} maxLength={30} value={form.phoneNumber} onChange={event => setForm({ ...form, phoneNumber: event.currentTarget.value })}/></label>
            <label><span>Email <small>Optional</small></span><input type="email" maxLength={254} value={form.email} onChange={event => setForm({ ...form, email: event.currentTarget.value })}/></label>
            <label><span>KRA PIN</span><input required minLength={5} maxLength={20} value={form.kraPin} onChange={event => setForm({ ...form, kraPin: event.currentTarget.value.toUpperCase() })}/></label>
            <label><span>M-Pesa business number <small>Optional</small></span><input type="tel" maxLength={30} value={form.mpesaNumber} onChange={event => setForm({ ...form, mpesaNumber: event.currentTarget.value })}/></label>
          </div>
          <div className="supplier-form-actions" style={{ justifyContent: 'flex-end' }}><button disabled={busy}>{busy ? 'Submitting…' : 'Send for approval'}</button></div>
        </form>
      )}
    </section>
  )
}

function SupplierRequestCard({
  request,
  canReview,
  onReviewed,
}: {
  request: SupplierOnboardingRequest
  canReview: boolean
  onReviewed: (request: SupplierOnboardingRequest) => void
}) {
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!decision || busy) return
    setBusy(true)
    setError(null)
    try {
      const updated = await supplierOnboardingApi.review(request.id, {
        approve: decision === 'approve',
        notes: notes.trim(),
      })
      onReviewed(updated)
      setDecision(null)
      setNotes('')
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="supplier-request-card">
      <header>
        <div><span>SUPPLIER APPLICATION</span><h3>{request.name}</h3><p>{request.category}</p></div>
        <span className={`supplier-request-status ${request.status.toLowerCase()}`}>{statusLabel(request.status)}</span>
      </header>
      <dl>
        <div><dt>KRA PIN</dt><dd>{request.kraPin}</dd></div>
        <div><dt>Contact</dt><dd>{request.contactPerson} · {request.phoneNumber}</dd></div>
        <div><dt>Email</dt><dd>{request.email || 'Not supplied'}</dd></div>
        <div><dt>M-Pesa</dt><dd>{request.mpesaNumber || 'Not supplied'}</dd></div>
      </dl>
      <div className="supplier-request-audit">
        <span>Submitted by <strong>{request.submittedByName}</strong></span>
        <time>{formatDateTime(request.submittedAt)}</time>
      </div>
      {request.status !== 'Pending' && (
        <div className="supplier-decision-record">
          <strong>{request.status} by {request.reviewedByName}</strong>
          <span>{request.reviewNotes}</span>
          <time>{formatDateTime(request.reviewedAt)}</time>
        </div>
      )}
      {canReview && request.status === 'Pending' && !decision && (
        <div className="supplier-review-actions">
          <span>Verify identity, KRA PIN and payment contact before deciding.</span>
          <button type="button" onClick={() => setDecision('reject')}>Reject</button>
          <button type="button" className="approve" onClick={() => setDecision('approve')}>Approve supplier</button>
        </div>
      )}
      {decision && (
        <form className="supplier-review-form" onSubmit={review}>
          {error && <div className="supplier-notice error" role="alert">{error}</div>}
          <label><span>{decision === 'approve' ? 'Approval evidence' : 'Reason for rejection'}</span><textarea required minLength={3} maxLength={1000} rows={3} value={notes} onChange={event => setNotes(event.currentTarget.value)} placeholder={decision === 'approve' ? 'Example: KRA PIN and payment contact independently verified.' : 'Explain what must be corrected.'}/></label>
          <div><button type="button" onClick={() => setDecision(null)}>Cancel</button><button disabled={busy} className={decision === 'approve' ? 'approve' : 'reject'}>{busy ? 'Recording…' : decision === 'approve' ? 'Confirm approval' : 'Confirm rejection'}</button></div>
        </form>
      )}
    </article>
  )
}
