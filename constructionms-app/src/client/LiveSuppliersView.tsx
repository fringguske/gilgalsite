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
  if (status === 'Pending') return 'Waiting for Finance Officer or CEO'
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
  const canAdd = currentUser.role === 'Procurement Officer' || currentUser.role === 'CEO'
  // Applications sent before suppliers could be added directly are still decided here.
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
  const availableCount = suppliers.filter(supplier => !supplier.isBlacklisted).length
  const sectionParam = searchParams.get('section')
  const section = canAdd && (sectionParam === 'add' || sectionParam === 'new')
    ? 'add'
    : sectionParam === 'applications' && requests.length > 0
      ? 'applications'
      : 'register'
  const tabs: Array<{ key: string; label: string; params: Record<string, string> }> = [
    { key: 'register', label: 'Supplier register', params: {} },
    ...(canAdd ? [{ key: 'add', label: 'Add supplier', params: { section: 'add' } }] : []),
    ...(requests.length > 0
      ? [{ key: 'applications', label: pendingCount > 0 ? `Earlier applications (${pendingCount} waiting)` : 'Earlier applications', params: { section: 'applications' } }]
      : []),
  ]
  const requestGroups: Array<{ status: SupplierOnboardingStatus; title: string; items: SupplierOnboardingRequest[] }> = [
    { status: 'Pending', title: 'Waiting for Finance Officer or CEO', items: requests.filter(request => request.status === 'Pending') },
    { status: 'Approved', title: 'Approved applications', items: requests.filter(request => request.status === 'Approved') },
    { status: 'Rejected', title: 'Rejected applications', items: requests.filter(request => request.status === 'Rejected') },
  ]

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
          <span>SUPPLIERS</span>
          <h1>Suppliers</h1>
        </div>
        <div>
          <strong>{suppliersLoading || suppliersLoadError ? 'Unavailable' : availableCount}</strong>
          <span>available for quotes</span>
        </div>
      </header>

      {error && <div className="supplier-notice error" role="alert">{error}</div>}
      {message && <div className="supplier-notice success">{message}</div>}

      {tabs.length > 1 && <nav className={`ops-action-nav supplier-control-nav ${tabs.length === 3 ? 'procurement-supplier-nav' : 'two-tabs'}`} aria-label="Supplier sections">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            className={section === tab.key ? 'active' : ''}
            aria-current={section === tab.key ? 'page' : undefined}
            onClick={() => setSearchParams(tab.params, { replace: true })}
          >
            {tab.label}
          </button>
        ))}
      </nav>}

      {section === 'add' && (
        <SupplierForm
          onAdded={supplier => {
            setSuppliers(current => [...current, supplier].sort((left, right) => left.name.localeCompare(right.name)))
            setMessage(`${supplier.name} was added and can now be asked for quotes.`)
            setSearchParams({}, { replace: true })
          }}
        />
      )}

      {section === 'applications' && <section className="supplier-panel">
        <header className="supplier-section-head">
          <div>
            <span>EARLIER APPLICATIONS</span>
            <h2>Sent before suppliers could be added directly</h2>
          </div>
        </header>
        {requestsLoadError && <div className="supplier-notice error" role="alert">Supplier applications could not be loaded: {requestsLoadError}</div>}
        {requestsLoading ? <SupplierLoading /> : (
          <div className="supplier-decision-groups">
            {requestGroups.map(group => group.items.length > 0 && (
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

      {section === 'register' && <section className="supplier-panel">
        <header className="supplier-section-head">
          <div>
            <span>SUPPLIER REGISTER</span>
            <h2>Suppliers available for quotes</h2>
          </div>
          <b>{suppliersLoading || suppliersLoadError ? 'Unavailable' : availableCount} available</b>
        </header>
        {suppliersLoadError && <div className="supplier-notice error" role="alert">Supplier register could not be loaded: {suppliersLoadError}</div>}
        {suppliersLoading ? <SupplierLoading /> : suppliers.length === 0 ? (
          suppliersLoadError ? null :
          <div className="supplier-empty">{canAdd ? 'No suppliers yet. Use Add supplier for the companies you buy from.' : 'No suppliers have been added yet.'}</div>
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
                  {supplier.isBlacklisted ? 'Blocked' : 'Available'}
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

function SupplierForm({ onAdded }: { onAdded: (supplier: SupplierSummary) => void }) {
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
      const supplier = await suppliersApi.create({
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim(),
        phoneNumber: form.phoneNumber.trim(),
        email: form.email.trim() || null,
        kraPin: form.kraPin.trim().toUpperCase(),
        mpesaNumber: form.mpesaNumber.trim() || null,
        category: form.category,
      })
      onAdded(supplier)
      setForm({ name: '', contactPerson: '', phoneNumber: '', email: '', kraPin: '', mpesaNumber: '', category: '' })
    } catch (requestError) {
      setError(messageFrom(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="supplier-application open">
      <div className="supplier-application-toggle" role="presentation">
        <span>+</span>
        <div><strong>Add a supplier</strong></div>
        <b>Ready for quotes as soon as it is saved</b>
      </div>
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
        <div className="supplier-form-actions" style={{ justifyContent: 'flex-end' }}><button disabled={busy}>{busy ? 'Saving…' : 'Add supplier'}</button></div>
      </form>
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
