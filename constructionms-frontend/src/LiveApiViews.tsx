import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useSearchParams } from 'react-router'
import {
  ApiError,
  authApi,
  dashboardApi,
  materialCatalogRequestsApi,
  materialsApi,
  projectsApi,
  requisitionsApi,
  type CurrentUser,
  type DashboardResponse,
  type Material,
  type MaterialCatalogRequest,
  type Project,
  type ProjectSummary,
  type Requisition,
  type RequisitionStatus,
  type SupervisorDecision,
  type TechnicalCheckOutcome,
} from './api'
import { EvidenceFiles } from './EvidenceReferenceField'
import { CeoOverview } from './CeoOverview'
import { OperationalOverview } from './OperationalOverview'
import './live-api.css'
import './ceo-overview.css'

export type LiveDestination = 'access' | 'projects' | 'requisitions' | 'sourcing' | 'suppliers' | 'purchase-orders' | 'inventory' | 'finance' | 'audit'

export interface LiveLoginViewProps {
  onAuthenticated: (user: CurrentUser) => void
  onBack: () => void
  initialMode?: 'signin' | 'signup'
}

export interface PublicLandingViewProps {
  onSignIn: () => void
  onRequestAccess: () => void
}

export interface LiveDashboardViewProps {
  currentUser: CurrentUser
  onNavigate?: (destination: LiveDestination) => void
}

export interface LiveProjectsViewProps {
  currentUser: CurrentUser
}

export interface LiveRequisitionsViewProps {
  currentUser: CurrentUser
}

interface DashboardAction {
  destination: LiveDestination
  label: string
  detail: string
  count: DashboardCountKey | null
  countLabel?: string
}

type DashboardCountKey =
  | 'visibleProjectCount'
  | 'pendingRequisitionCount'
  | 'approvedRequisitionCount'
  | 'pendingAccessRequestCount'
  | 'pendingSupplierOnboardingCount'
  | 'pendingGoodsReceiptCount'
  | 'pendingMaterialIssueCount'
  | 'pendingMaterialConfirmationCount'
  | 'pendingStockCountReviewCount'
  | 'pendingInvoiceCaptureCount'
  | 'pendingInvoiceReviewCount'
  | 'pendingCeoDecisionCount'
  | 'pendingPaymentAuthorizationCount'
  | 'pendingPaymentCount'
  | 'completedPaymentCount'

interface DashboardSummaryItem {
  label: string
  value: number
  detail: string
  tone: 'projects' | 'pending' | 'approved'
}

interface ProjectEntry {
  project: Project
  summary: ProjectSummary | null
}

interface NoticeProps {
  tone?: 'error' | 'success' | 'neutral'
  children: ReactNode
}

function Notice({ tone = 'neutral', children }: NoticeProps) {
  return (
    <div className={`lav-notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}

function formatDate(value: string | null): string {
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

function formatDateTime(value: string): string {
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

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits }).format(value)
}

function formatMoney(value: number | null): string {
  if (value === null) return 'Restricted'

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value)
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function statusLabel(status: RequisitionStatus): string {
  const labels: Record<RequisitionStatus, string> = {
    AwaitingTechnicalCheck: 'Waiting for Supervisor',
    AwaitingSupervisorDecision: 'Waiting for Supervisor',
    ReturnedForRevision: 'Waiting for Foreman',
    Approved: 'Approved',
    Rejected: 'Rejected',
  }

  return labels[status]
}

function statusTone(status: RequisitionStatus): string {
  if (status === 'Approved') return 'success'
  if (status === 'Rejected') return 'danger'
  if (status === 'ReturnedForRevision') return 'return'
  return 'pending'
}

function projectTone(status: Project['status']): string {
  if (status === 'Active') return 'success'
  if (status === 'Completed') return 'complete'
  if (status === 'On Hold') return 'return'
  return 'danger'
}

function todayInputValue(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function readMoney(value: string, label: string): number {
  const normalized = value.trim()
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`${label} must be zero or more, with no more than two decimal places.`)
  }

  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} must be zero or more.`)
  }

  return amount
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

function dashboardActions(role: CurrentUser['role']): DashboardAction[] {
  switch (role) {
    case 'Administrator':
      return [
        { destination: 'access', label: 'Access requests', detail: 'Approve roles and project scope', count: 'pendingAccessRequestCount', countLabel: 'waiting for approval' },
      ]
    case 'CEO':
      return [
        { destination: 'projects', label: 'Projects', detail: 'Open progress and controlled budgets', count: 'visibleProjectCount', countLabel: 'projects visible' },
        { destination: 'finance', label: 'Money exceptions', detail: 'Decide only payments above the control threshold', count: 'pendingCeoDecisionCount', countLabel: 'waiting for your action' },
        { destination: 'audit', label: 'Complete chain', detail: 'Trace material and cash from source to close', count: null },
      ]
    case 'Auditor':
      return [
        { destination: 'projects', label: 'Projects', detail: 'Open progress and controlled budgets', count: 'visibleProjectCount', countLabel: 'projects visible' },
        { destination: 'audit', label: 'Complete chain', detail: 'Trace material and cash from source to close', count: null },
      ]
    case 'Supervisor':
      return [
        { destination: 'requisitions', label: 'Material decisions', detail: 'Approve foreman requests directly', count: 'pendingRequisitionCount', countLabel: 'requests in progress' },
        { destination: 'inventory', label: 'Stock checks', detail: 'Review independent physical-count differences', count: 'pendingStockCountReviewCount', countLabel: 'waiting for review' },
        { destination: 'projects', label: 'Projects', detail: 'Review progress and commitments', count: 'visibleProjectCount', countLabel: 'projects visible' },
      ]
    case 'Engineer':
      return [
        { destination: 'projects', label: 'Project progress', detail: 'Record verified physical progress', count: 'visibleProjectCount', countLabel: 'projects visible' },
      ]
    case 'Foreman':
      return [
        { destination: 'requisitions', label: 'Material requests', detail: 'Create or revise a site request', count: 'pendingRequisitionCount', countLabel: 'requests in progress' },
        { destination: 'inventory', label: 'Materials with me', detail: 'Confirm, use and report wastage', count: 'pendingMaterialConfirmationCount', countLabel: 'issues to confirm' },
      ]
    case 'Procurement Officer':
      return [
        { destination: 'sourcing', label: 'Supplier sourcing', detail: 'Collect quotes for approved needs', count: 'approvedRequisitionCount', countLabel: 'approved requests' },
        { destination: 'suppliers', label: 'Supplier onboarding', detail: 'Submit companies for independent approval', count: 'pendingSupplierOnboardingCount', countLabel: 'awaiting review' },
        { destination: 'finance', label: 'Supplier invoices', detail: 'Capture invoices only after Stores receives goods', count: 'pendingInvoiceCaptureCount', countLabel: 'ready for invoice' },
      ]
    case 'Storekeeper':
      return [
        { destination: 'purchase-orders', label: 'Expected deliveries', detail: 'See issued orders awaiting goods', count: 'pendingGoodsReceiptCount', countLabel: 'orders not fully received' },
        { destination: 'inventory', label: 'Store operations', detail: 'Receive, issue, transfer and count stock', count: 'pendingMaterialIssueCount', countLabel: 'approved issues ready' },
      ]
    case 'Finance Officer':
      return [
        { destination: 'suppliers', label: 'Supplier approvals', detail: 'Verify supplier identity before sourcing', count: 'pendingSupplierOnboardingCount', countLabel: 'waiting for review' },
        { destination: 'finance', label: 'Invoice matching', detail: 'Match invoice, order and received goods', count: 'pendingInvoiceReviewCount', countLabel: 'waiting for review' },
        { destination: 'finance', label: 'Ready to pay', detail: 'Record payments for matched invoices', count: 'pendingPaymentCount', countLabel: 'payments waiting' },
      ]
    default:
      return []
  }
}

function dashboardSummary(role: CurrentUser['role'], dashboard: DashboardResponse): DashboardSummaryItem[] {
  const projects: DashboardSummaryItem = {
    label: 'Projects visible', value: dashboard.visibleProjectCount,
    detail: '', tone: 'projects',
  }
  switch (role) {
    case 'Administrator':
      return [{ label: 'Access requests', value: dashboard.pendingAccessRequestCount, detail: 'People waiting for account approval.', tone: 'pending' }]
    case 'CEO':
      return [projects,
        { label: 'Requests moving', value: dashboard.pendingRequisitionCount, detail: 'Still inside the controlled work chain.', tone: 'pending' },
        { label: 'Money exceptions', value: dashboard.pendingCeoDecisionCount, detail: 'High-value decisions waiting for you.', tone: 'approved' }]
    case 'Auditor':
      return [projects,
        { label: 'Requests moving', value: dashboard.pendingRequisitionCount, detail: 'Still inside the controlled work chain.', tone: 'pending' },
        { label: 'Payments recorded', value: dashboard.completedPaymentCount, detail: 'Completed payments with system receipts.', tone: 'approved' }]
    case 'Supervisor':
      return [projects,
        { label: 'Requests moving', value: dashboard.pendingRequisitionCount, detail: 'Requests not yet finally decided.', tone: 'pending' }]
    case 'Engineer':
      return [projects]
    case 'Foreman':
      return [projects,
        { label: 'My requests moving', value: dashboard.pendingRequisitionCount, detail: 'Not yet through the full approval chain.', tone: 'pending' },
        { label: 'Issues to confirm', value: dashboard.pendingMaterialConfirmationCount, detail: 'Store issues awaiting your receipt check.', tone: 'approved' }]
    case 'Procurement Officer':
      return [projects,
        { label: 'Approved needs', value: dashboard.approvedRequisitionCount, detail: 'Available for controlled sourcing.', tone: 'pending' },
        { label: 'Invoices to capture', value: dashboard.pendingInvoiceCaptureCount, detail: 'Goods received with no active invoice.', tone: 'approved' }]
    case 'Storekeeper':
      return [projects,
        { label: 'Deliveries expected', value: dashboard.pendingGoodsReceiptCount, detail: 'Issued orders not fully received.', tone: 'pending' },
        { label: 'Issues ready', value: dashboard.pendingMaterialIssueCount, detail: 'Approved requests waiting for stock issue.', tone: 'approved' }]
    case 'Finance Officer':
      return [
        { label: 'Suppliers to review', value: dashboard.pendingSupplierOnboardingCount, detail: 'Companies not yet available for sourcing.', tone: 'projects' },
        { label: 'Invoices to match', value: dashboard.pendingInvoiceReviewCount, detail: 'Waiting for the three-way check.', tone: 'pending' },
        { label: 'Ready to pay', value: dashboard.pendingPaymentCount, detail: 'Matched invoices ready for payment.', tone: 'approved' }]
    default:
      return [projects]
  }
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

export function PublicLandingView({ onSignIn, onRequestAccess }: PublicLandingViewProps) {
  return (
    <main className="lav-public-page">
      <header className="lav-public-header">
        <div className="lav-public-brand">
          <div className="lav-login-mark" aria-hidden="true"><i /><i /><i /></div>
          <strong>Construction Management System</strong>
        </div>
        <button className="lav-button secondary" type="button" onClick={onSignIn}>Staff sign in</button>
      </header>

      <section className="lav-public-hero">
        <div className="lav-public-copy">
          <h1>Construction Management System</h1>
          <div className="lav-public-actions">
            <button className="lav-button primary" type="button" onClick={onSignIn}>Staff sign in</button>
            <button className="lav-button secondary" type="button" onClick={onRequestAccess}>Request access</button>
          </div>
        </div>

        <div className="lav-public-scope" aria-label="System areas">
          <div><strong>Projects</strong></div>
          <div><strong>Materials</strong></div>
          <div><strong>Procurement</strong></div>
          <div><strong>Finance and audit</strong></div>
        </div>
      </section>
    </main>
  )
}

export function LiveLoginView({ onAuthenticated, onBack, initialMode = 'signin' }: LiveLoginViewProps) {
  const emailId = useId()
  const usernameId = useId()
  const passwordId = useId()
  const confirmPasswordId = useId()
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const previousRobots = robots?.content
    const previousTitle = document.title
    if (robots) robots.content = 'noindex, nofollow'
    document.title = 'Staff access | Construction Management System'
    return () => {
      if (robots && previousRobots) robots.content = previousRobots
      document.title = previousTitle
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    setMessage(null)

    try {
      if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError('Passwords do not match.')
          return
        }
        await authApi.register({ email: email.trim(), username: username.trim(), password, confirmPassword })
        setPassword('')
        setConfirmPassword('')
        setMode('signin')
        setMessage('Request sent. An Administrator must approve your role before you can sign in.')
      } else {
        const user = await authApi.login({ username: username.trim(), password })
        onAuthenticated(user)
      }
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="lav-login-page">
      <section className="lav-login-brand" aria-label="Construction Management System">
        <button className="lav-login-back" type="button" onClick={onBack}>← Public home</button>
        <div className="lav-login-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div>
          <h1>Construction Management System</h1>
        </div>
      </section>

      <section className="lav-login-panel">
        <form className="lav-login-card" onSubmit={submit}>
          <div className="lav-login-tabs" role="tablist" aria-label="Account access">
            <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(null); setMessage(null); setPassword(''); setConfirmPassword('') }}>Sign in</button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(null); setMessage(null); setPassword(''); setConfirmPassword('') }}>Request access</button>
          </div>
          <header>
            <span className="lav-kicker">{mode === 'signin' ? 'Staff access' : 'New account'}</span>
            <h2>{mode === 'signin' ? 'Sign in' : 'Request to join'}</h2>
          </header>

          {error && <Notice tone="error">{error}</Notice>}
          {message && <Notice tone="success">{message}</Notice>}

          {mode === 'signup' && (
            <label className="lav-field" htmlFor={emailId}>
              <span>Email address</span>
              <input
                id={emailId}
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="name@company.co.ke"
                required
                autoFocus
              />
            </label>
          )}

          <label className="lav-field" htmlFor={usernameId}>
            <span>Username</span>
            <input
              id={usernameId}
              type="text"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
              autoComplete="username"
              minLength={3}
              maxLength={50}
              pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
              placeholder="your.username"
              required
              autoFocus={mode === 'signin'}
            />
          </label>

          <label className="lav-field" htmlFor={passwordId}>
            <span>{mode === 'signup' ? 'Set password' : 'Password'}</span>
            <input
              id={passwordId}
              type="password"
              name="password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={mode === 'signup' ? 12 : 1}
              maxLength={72}
              required
            />
          </label>

          {mode === 'signup' && (
            <label className="lav-field" htmlFor={confirmPasswordId}>
              <span>Confirm password</span>
              <input
                id={confirmPasswordId}
                type="password"
                name="confirm-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required
              />
            </label>
          )}

          <button className="lav-button primary wide" type="submit" disabled={busy}>
            {busy ? (mode === 'signin' ? 'Signing in…' : 'Sending request…') : (mode === 'signin' ? 'Sign in' : 'Send access request')}
          </button>

          {mode === 'signin' && (
            <p className="lav-login-help">Cannot sign in? Ask the Administrator to confirm that your request is approved.</p>
          )}
        </form>
      </section>
    </main>
  )
}

export function LiveDashboardView(props: LiveDashboardViewProps) {
  if (props.currentUser.role === 'CEO') return <CeoOverview currentUser={props.currentUser}/>
  if (['Administrator', 'Finance Officer', 'Foreman', 'Engineer', 'Supervisor', 'Storekeeper', 'Procurement Officer', 'Auditor'].includes(props.currentUser.role)) {
    return <OperationalOverview key={`${props.currentUser.id}-${props.currentUser.role}`} currentUser={props.currentUser}/>
  }
  return <RoleDashboardView {...props}/>
}

function RoleDashboardView({ currentUser, onNavigate }: LiveDashboardViewProps) {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    dashboardApi
      .get(controller.signal)
      .then((result) => {
        setDashboard(result)
        setError(null)
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setError(errorMessage(requestError))
        }
      })

    return () => controller.abort()
  }, [currentUser.id, currentUser.role, refreshKey])

  const assignedNames = currentUser.projects.map((project) => project.name).join(', ')
  const actions = dashboardActions(currentUser.role)
  const summaryItems = dashboard ? dashboardSummary(currentUser.role, dashboard) : []

  return (
    <div className="lav-view ceo-readable">
      <header className="lav-page-head">
        <div>
          <span className="lav-kicker">{currentUser.role} workspace</span>
          <h1>Good day, {currentUser.fullName.split(' ')[0]}</h1>
          {currentUser.role !== 'CEO' && currentUser.role !== 'Auditor' && (
            <p>{assignedNames || 'No projects assigned'}</p>
          )}
        </div>
        <div className="lav-identity-card" aria-label="Signed-in user">
          <span>{initials(currentUser.fullName)}</span>
          <div>
            <strong>{currentUser.fullName}</strong>
            <small>{currentUser.role}</small>
          </div>
        </div>
      </header>

      {error && (
        <Notice tone="error">
          {error}{' '}
          <button type="button" onClick={() => setRefreshKey((value) => value + 1)}>
            Try again
          </button>
        </Notice>
      )}

      {!dashboard && !error ? (
        <LoadingBlock label="Loading your workspace…" />
      ) : (
        dashboard && (
          <>
            <section className="lav-summary-grid" aria-label="Workspace summary">
              {summaryItems.map((item) => (
                <article className={`lav-summary-card ${item.tone}`} key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  {item.detail && <small>{item.detail}</small>}
                </article>
              ))}
            </section>

            <section className="lav-home-grid">
              <article className="lav-panel lav-home-focus">
                <header className="lav-panel-head">
                  <div>
                    <span className="lav-kicker">Start here</span>
                    <h2>Your work</h2>
                  </div>
                </header>
                <div className="lav-home-actions">
                  {actions.length > 0 ? actions.map(action => {
                    const count = action.count ? dashboard[action.count] : null
                    return <button key={`${action.destination}-${action.label}`} type="button" onClick={() => onNavigate?.(action.destination)}>
                      <span>{action.label}</span>
                      <strong>{action.detail}</strong>
                      {count !== null && <small>{count} {action.countLabel}</small>}
                    </button>
                  }) : <div className="lav-home-boundary">
                    <strong>No action is assigned to this role</strong>
                    <small>The Administrator can confirm the account role and project scope.</small>
                  </div>}
                </div>
              </article>

              <aside className="lav-panel lav-scope-card">
                <header className="lav-panel-head">
                  <div>
                    <span className="lav-kicker">Access scope</span>
                    <h2>Projects on this account</h2>
                  </div>
                </header>
                <ul>
                  {currentUser.projects.length ? (
                    currentUser.projects.map((project) => (
                      <li key={project.id}>
                        <span aria-hidden="true">{project.name.slice(0, 2).toUpperCase()}</span>
                        <strong>{project.name}</strong>
                      </li>
                    ))
                  ) : (
                    <li className="lav-scope-empty">
                      {currentUser.role === 'CEO' || currentUser.role === 'Auditor'
                        ? 'Portfolio access is applied automatically.'
                        : 'Ask the Administrator to assign a project.'}
                    </li>
                  )}
                </ul>
              </aside>
            </section>
          </>
        )
      )}
    </div>
  )
}

export function LiveProjectsView({ currentUser }: LiveProjectsViewProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedProjectId = Number(searchParams.get('projectId'))
  const [entries, setEntries] = useState<ProjectEntry[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    everyPage<Project>(page => projectsApi.list({ page, pageSize: 100 }, controller.signal))
      .then(async (projectItems) => {
        const loadedEntries = await Promise.all(
          projectItems.map(async (project): Promise<ProjectEntry> => {
            try {
              const summary = await projectsApi.getSummary(project.id, controller.signal)
              return { project, summary }
            } catch (requestError) {
              if (requestError instanceof DOMException && requestError.name === 'AbortError') {
                throw requestError
              }
              return { project, summary: null }
            }
          }),
        )

        setEntries(loadedEntries)
        setSelectedProjectId((current) => {
          if (requestedProjectId > 0 && loadedEntries.some((entry) => entry.project.id === requestedProjectId)) {
            return requestedProjectId
          }
          if (current && loadedEntries.some((entry) => entry.project.id === current)) {
            return current
          }
          return loadedEntries[0]?.project.id ?? null
        })
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
  }, [refreshKey, requestedProjectId])

  const selectedEntry = entries.find((entry) => entry.project.id === selectedProjectId) ?? null

  function replaceSummary(projectId: number, summary: ProjectSummary) {
    setEntries((current) =>
      current.map((entry) => (entry.project.id === projectId ? { ...entry, summary } : entry)),
    )
  }

  function reloadProjects(preferredProjectId?: number) {
    if (preferredProjectId !== undefined) {
      setSelectedProjectId(preferredProjectId)
      setSearchParams({ projectId: String(preferredProjectId) }, { replace: true })
    }
    setLoading(true)
    setRefreshKey((value) => value + 1)
  }

  return (
    <div className="lav-view ceo-readable">
      <header className="lav-page-head">
        <div>
          <h1>{currentUser.role === 'Engineer' ? 'Project progress' : currentUser.role === 'Finance Officer' ? 'Project budgets' : 'Projects'}</h1>
        </div>
        <span className="lav-count-chip">{entries.length} visible</span>
      </header>

      {error && (
        <Notice tone="error">
          {error}{' '}
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setRefreshKey((value) => value + 1)
            }}
          >
            Try again
          </button>
        </Notice>
      )}


      {currentUser.role === 'CEO' && (
        <CreateProjectForm
          onCreated={(project) => reloadProjects(project.id)}
        />
      )}

      {loading ? (
        <LoadingBlock label="Loading assigned projects…" />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No projects are visible"
          detail={currentUser.role === 'CEO'
            ? 'Create the first project above.'
            : 'This account may still need a project assignment.'}
        />
      ) : (
        <div className="lav-project-layout">
          <nav className="lav-project-list" aria-label="Visible projects">
            {entries.map(({ project, summary }) => {
              const progress = summary?.latestProgress?.percentageComplete
              return (
                <button
                  type="button"
                  key={project.id}
                  className={selectedProjectId === project.id ? 'active' : ''}
                  onClick={() => {
                    setSelectedProjectId(project.id)
                    setSearchParams({ projectId: String(project.id) }, { replace: true })
                  }}
                  aria-current={selectedProjectId === project.id ? 'true' : undefined}
                >
                  <span className="lav-project-monogram" aria-hidden="true">
                    {project.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="lav-project-list-copy">
                    <strong>{project.name}</strong>
                    <small>{project.location || 'Location not set'}</small>
                    <i>
                      <b style={{ width: `${Math.min(100, Math.max(0, progress ?? 0))}%` }} />
                    </i>
                  </span>
                  <span className="lav-project-percent">{summary === null ? 'Unavailable' : progress === undefined ? 'Not recorded' : `${formatNumber(progress, 0)}%`}</span>
                </button>
              )
            })}
          </nav>

          {selectedEntry && (
            <ProjectDetail
              key={selectedEntry.project.id}
              entry={selectedEntry}
              currentUser={currentUser}
              onSummaryChanged={replaceSummary}
            />
          )}
        </div>
      )}
    </div>
  )
}

interface CreateProjectFormProps {
  onCreated: (project: Project) => void
}

function CreateProjectForm({ onCreated }: CreateProjectFormProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [budget, setBudget] = useState('0')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setMessage(null)

    try {
      const cleanName = name.trim()
      const cleanLocation = location.trim()
      if (cleanName.length < 2 || cleanName.length > 150) {
        throw new Error('Project name must be between 2 and 150 characters.')
      }
      if (cleanLocation.length > 300) {
        throw new Error('Location cannot be longer than 300 characters.')
      }
      if (!startDate) {
        throw new Error('Start date is required.')
      }
      if (endDate && endDate < startDate) {
        throw new Error('Planned end date cannot be before the start date.')
      }

      const created = await projectsApi.create({
        name: cleanName,
        location: cleanLocation || null,
        budget: readMoney(budget, 'Starting budget'),
        startDate,
        endDate: endDate || null,
        status: 'Active',
      })

      setName('')
      setLocation('')
      setBudget('0')
      setStartDate(todayInputValue())
      setEndDate('')
      setMessage({ tone: 'success', text: `${created.name} was created and selected.` })
      onCreated(created)
    } catch (requestError) {
      setMessage({ tone: 'error', text: errorMessage(requestError) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`lav-project-create ${open ? 'open' : ''}`}>
      <button
        className="lav-project-create-toggle"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">+</span>
        <span>
          <strong>Create a project</strong>
        </span>
        <b>{open ? 'Close' : 'Open'}</b>
      </button>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {open && (
        <form onSubmit={submit}>
          <div className="lav-project-create-grid">
            <label className="lav-field">
              <span>Project name</span>
              <input
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                minLength={2}
                maxLength={150}
                placeholder="Example: Gilgal 3"
                required
              />
            </label>
            <label className="lav-field">
              <span>Location <small>Optional</small></span>
              <input
                value={location}
                onChange={(event) => setLocation(event.currentTarget.value)}
                maxLength={300}
                placeholder="Town or site address"
              />
            </label>
            <label className="lav-field">
              <span>Starting budget (KES)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={budget}
                onChange={(event) => setBudget(event.currentTarget.value)}
                required
              />
            </label>
            <label className="lav-field">
              <span>Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.currentTarget.value)}
                required
              />
            </label>
            <label className="lav-field">
              <span>Planned end <small>Optional</small></span>
              <input
                type="date"
                min={startDate}
                value={endDate}
                onChange={(event) => setEndDate(event.currentTarget.value)}
              />
            </label>
          </div>
          <div className="lav-form-actions">
            <button className="lav-button primary" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

interface ProjectDetailProps {
  entry: ProjectEntry
  currentUser: CurrentUser
  onSummaryChanged: (projectId: number, summary: ProjectSummary) => void
}

function ProjectDetail({ entry, currentUser, onSummaryChanged }: ProjectDetailProps) {
  const { project, summary } = entry
  const progress = summary?.latestProgress?.percentageComplete

  return (
    <section className="lav-project-detail" aria-labelledby={`project-${project.id}-title`}>
      <header>
        <div>
          <span className={`lav-status ${projectTone(project.status)}`}>{project.status}</span>
          <h2 id={`project-${project.id}-title`}>{project.name}</h2>
          <p>{project.location || 'Location not recorded'}</p>
        </div>
        <div className="lav-project-dates">
          <span>Started</span>
          <strong>{formatDate(project.startDate)}</strong>
          <small>End: {formatDate(project.endDate)}</small>
        </div>
      </header>

      {!summary ? (
        <Notice tone="error">The project opened, but its detailed summary could not be loaded.</Notice>
      ) : (
        <>
          <div className="lav-progress-block">
            <div>
              <span>Verified construction progress</span>
              <strong>{progress === undefined ? 'Not recorded' : `${formatNumber(progress, 0)}%`}</strong>
            </div>
            <div className="lav-progress-track" aria-label={progress === undefined ? 'Progress not recorded' : `${formatNumber(progress, 0)}% complete`}>
              <i style={{ width: `${Math.min(100, Math.max(0, progress ?? 0))}%` }} />
            </div>
            {summary.latestProgress ? (
              <div className="lav-progress-note">
                <strong>{summary.latestProgress.workSummary}</strong>
                <span>
                  Verified by {summary.latestProgress.verifiedByUserName} ·{' '}
                  {formatDateTime(summary.latestProgress.verifiedAt)}
                </span>
                <EvidenceFiles
                  sourceType="ProjectProgressVerification"
                  sourceId={summary.latestProgress.id}
                  kind="Photo"
                  canUpload={currentUser.role === 'Engineer' && summary.latestProgress.verifiedByUserId === currentUser.id}
                />
              </div>
            ) : null}
          </div>

          <div className="lav-project-facts">
            <article>
              <span>Cost areas</span>
              <strong>{summary.costCodes.filter((code) => code.isActive).length}</strong>
            </article>
            <article>
              <span>Progress checks</span>
              <strong>{summary.progressVerificationCount}</strong>
            </article>
            {summary.canViewFinancials && (
              <article>
                <span>Approved budget</span>
                <strong>{formatMoney(summary.currentBudget?.approvedAmount ?? project.budget)}</strong>
                <small>
                  {summary.remainingAfterCommitments === null
                    ? 'No commitment balance yet'
                    : `${formatMoney(summary.remainingAfterCommitments)} after commitments`}
                </small>
              </article>
            )}
          </div>

          {currentUser.role === 'Engineer' && project.status === 'Active' && (
            <ProgressVerificationForm
              projectId={project.id}
              latestPercentage={progress ?? 0}
              onSaved={async () => {
                const nextSummary = await projectsApi.getSummary(project.id)
                onSummaryChanged(project.id, nextSummary)
              }}
            />
          )}

          {currentUser.role === 'CEO' && (
            <CeoProjectControls
              projectId={project.id}
              summary={summary}
              onSummaryChanged={(nextSummary) => onSummaryChanged(project.id, nextSummary)}
            />
          )}
        </>
      )}
    </section>
  )
}

interface CeoProjectControlsProps {
  projectId: number
  summary: ProjectSummary
  onSummaryChanged: (summary: ProjectSummary) => void
}

function CeoProjectControls({
  projectId,
  summary,
  onSummaryChanged,
}: CeoProjectControlsProps) {
  async function refreshSummary() {
    const nextSummary = await projectsApi.getSummary(projectId)
    onSummaryChanged(nextSummary)
  }

  return (
    <details className="lav-ceo-project-tools">
      <summary>Project setup</summary>
      <div className="lav-ceo-project-tools-body">
        <CostCodeForm projectId={projectId} onSaved={refreshSummary} />
        <BudgetRevisionForm
          key={summary.costCodes
            .filter((costCode) => costCode.isActive)
            .map((costCode) => costCode.id)
            .join(':')}
          projectId={projectId}
          summary={summary}
          onSaved={refreshSummary}
        />
      </div>
    </details>
  )
}

interface CostCodeFormProps {
  projectId: number
  onSaved: () => Promise<void>
}

function CostCodeForm({ projectId, onSaved }: CostCodeFormProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setMessage(null)
    try {
      const cleanCode = code.trim()
      const cleanName = name.trim()
      if (!cleanCode || cleanCode.length > 30) {
        throw new Error('Short code must be between 1 and 30 characters.')
      }
      if (cleanName.length < 2 || cleanName.length > 150) {
        throw new Error('Budget area name must be between 2 and 150 characters.')
      }

      const created = await projectsApi.createCostCode(projectId, {
        code: cleanCode,
        name: cleanName,
      })
      await onSaved()
      setCode('')
      setName('')
      setMessage({ tone: 'success', text: `${created.code}: ${created.name} was added.` })
    } catch (requestError) {
      setMessage({ tone: 'error', text: errorMessage(requestError) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="lav-ceo-tool-card" onSubmit={submit}>
      <header>
        <div>
          <strong>Add a budget area</strong>
        </div>
      </header>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="lav-cost-code-fields">
        <label className="lav-field">
          <span>Short code</span>
          <input
            value={code}
            onChange={(event) => setCode(event.currentTarget.value.toUpperCase())}
            minLength={1}
            maxLength={30}
            placeholder="ROOF"
            required
          />
        </label>
        <label className="lav-field">
          <span>Area name</span>
          <input
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            minLength={2}
            maxLength={150}
            placeholder="Roofing"
            required
          />
        </label>
        <button className="lav-button secondary" type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add area'}
        </button>
      </div>
    </form>
  )
}

interface BudgetRevisionFormProps {
  projectId: number
  summary: ProjectSummary
  onSaved: () => Promise<void>
}

function BudgetRevisionForm({ projectId, summary, onSaved }: BudgetRevisionFormProps) {
  const activeCostCodes = summary.costCodes.filter((costCode) => costCode.isActive)
  const [approvedAmount, setApprovedAmount] = useState(() =>
    String(summary.currentBudget?.approvedAmount ?? summary.project.budget ?? 0),
  )
  const [allocationAmounts, setAllocationAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      activeCostCodes.map((costCode) => [costCode.id, String(costCode.currentAllocation ?? 0)]),
    ),
  )
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  const allocationPreview = activeCostCodes.reduce((total, costCode) => {
    const amount = Number(allocationAmounts[costCode.id] ?? 0)
    return total + (Number.isFinite(amount) && amount >= 0 ? amount : 0)
  }, 0)
  const approvedPreview = Number(approvedAmount)
  const unallocatedPreview = Number.isFinite(approvedPreview)
    ? approvedPreview - allocationPreview
    : 0

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setMessage(null)
    try {
      if (activeCostCodes.length === 0) {
        throw new Error('Add at least one budget area before approving a budget split.')
      }

      const nextApprovedAmount = readMoney(approvedAmount, 'Approved budget')
      const allocations = activeCostCodes.map((costCode) => ({
        costCodeId: costCode.id,
        amount: readMoney(allocationAmounts[costCode.id] ?? '0', costCode.name),
      }))
      const allocatedAmount = allocations.reduce((total, allocation) => total + allocation.amount, 0)
      if (allocatedAmount - nextApprovedAmount > 0.005) {
        throw new Error('The cost-area allocations cannot be more than the approved budget.')
      }
      if (notes.trim().length > 1000) {
        throw new Error('Budget note cannot be longer than 1,000 characters.')
      }

      await projectsApi.setBudget(projectId, {
        approvedAmount: nextApprovedAmount,
        notes: notes.trim() || null,
        allocations,
      })
      await onSaved()
      setNotes('')
      setMessage({ tone: 'success', text: 'The new approved budget record was saved.' })
    } catch (requestError) {
      setMessage({ tone: 'error', text: errorMessage(requestError) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="lav-ceo-tool-card budget" onSubmit={submit}>
      <header>
        <div>
          <strong>Approve a new budget split</strong>
        </div>
        {summary.currentBudget && (
          <span className="lav-current-budget">
            Current: {formatMoney(summary.currentBudget.approvedAmount)}
          </span>
        )}
      </header>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {activeCostCodes.length === 0 ? (
        <p className="lav-budget-empty">Add a budget area above to prepare the first split.</p>
      ) : (
        <>
          <label className="lav-field lav-budget-total">
            <span>Approved project budget (KES)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={approvedAmount}
              onChange={(event) => setApprovedAmount(event.currentTarget.value)}
              required
            />
          </label>

          <div className="lav-budget-allocations" aria-label="Budget area allocations">
            {activeCostCodes.map((costCode) => (
              <label className="lav-budget-row" key={costCode.id}>
                <span>
                  <strong>{costCode.name}</strong>
                  <small>{costCode.code}</small>
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label={`${costCode.name} allocation in KES`}
                  value={allocationAmounts[costCode.id] ?? '0'}
                  onChange={(event) => {
                    const value = event.currentTarget.value
                    setAllocationAmounts((current) => ({
                      ...current,
                      [costCode.id]: value,
                    }))
                  }}
                  required
                />
              </label>
            ))}
          </div>

          <div className={`lav-budget-check ${unallocatedPreview < -0.005 ? 'over' : ''}`}>
            <span>Allocated <strong>{formatMoney(allocationPreview)}</strong></span>
            <span>Not yet allocated <strong>{formatMoney(Math.max(0, unallocatedPreview))}</strong></span>
          </div>

          <label className="lav-field">
            <span>Approval note <small>Optional</small></span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.currentTarget.value)}
              maxLength={1000}
              rows={2}
              placeholder="Reason for this budget revision"
            />
          </label>

          <div className="lav-form-actions">
            <button className="lav-button primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Approve new budget'}
            </button>
          </div>
        </>
      )}
    </form>
  )
}

interface ProgressVerificationFormProps {
  projectId: number
  latestPercentage: number
  onSaved: () => Promise<void>
}

function ProgressVerificationForm({
  projectId,
  latestPercentage,
  onSaved,
}: ProgressVerificationFormProps) {
  const [percentage, setPercentage] = useState(String(latestPercentage))
  const [workSummary, setWorkSummary] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setMessage(null)
    try {
      await projectsApi.addProgressVerification(projectId, {
        percentageComplete: Number(percentage),
        workSummary: workSummary.trim(),
        evidenceReference: evidenceReference.trim() || null,
      })
      await onSaved()
      setWorkSummary('')
      setEvidenceReference('')
      setMessage({ tone: 'success', text: 'Progress verification recorded.' })
    } catch (requestError) {
      setMessage({ tone: 'error', text: errorMessage(requestError) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="lav-progress-entry">
      <summary>Record progress</summary>
      <form className="lav-inline-form" onSubmit={submit}>
      <header>
        <div>
          <h3>Record verified progress</h3>
        </div>
      </header>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="lav-form-grid progress-form">
        <label className="lav-field compact">
          <span>Complete (%)</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={percentage}
            onChange={(event) => setPercentage(event.currentTarget.value)}
            required
          />
        </label>
        <label className="lav-field compact span-two">
          <span>Work verified</span>
          <textarea
            value={workSummary}
            onChange={(event) => setWorkSummary(event.currentTarget.value)}
            minLength={5}
            maxLength={2000}
            rows={3}
            placeholder="Briefly state what you inspected on site."
            required
          />
        </label>
        <label className="lav-field compact span-two offset-one">
          <span>Evidence reference <small>Optional</small></span>
          <input
            value={evidenceReference}
            onChange={(event) => setEvidenceReference(event.currentTarget.value)}
            maxLength={500}
            placeholder="Example: Site photos G2-2026-08-03"
          />
        </label>
      </div>
      <div className="lav-form-actions">
        <button className="lav-button primary" type="submit" disabled={busy}>
          {busy ? 'Recording…' : 'Record progress'}
        </button>
      </div>
      </form>
    </details>
  )
}

export function LiveRequisitionsView({ currentUser }: LiveRequisitionsViewProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [requisitions, setRequisitions] = useState<Requisition[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [catalogRequests, setCatalogRequests] = useState<MaterialCatalogRequest[]>([])
  const [projectSummaries, setProjectSummaries] = useState<Record<number, ProjectSummary>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [projectFilter, setProjectFilter] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      const requestItems = await everyPage<Requisition>(page => requisitionsApi.list({ page, pageSize: 100 }, controller.signal))
      setRequisitions(requestItems)

      if (currentUser.role !== 'Foreman') {
        setMaterials([])
        setCatalogRequests([])
        setProjectSummaries({})
        setError(null)
        return
      }

      const [materialResult, summaryResult, catalogRequestResult] = await Promise.allSettled([
        everyPage<Material>(page => materialsApi.list({ page, pageSize: 100 }, controller.signal)),
        Promise.all(currentUser.projects.map(project => projectsApi.getSummary(project.id, controller.signal))),
        everyPage<MaterialCatalogRequest>(page => materialCatalogRequestsApi.list({ page, pageSize: 100 }, controller.signal)),
      ])
      if (controller.signal.aborted) return

      setMaterials(materialResult.status === 'fulfilled' ? materialResult.value : [])
      setCatalogRequests(catalogRequestResult.status === 'fulfilled' ? catalogRequestResult.value : [])
      const summaries = summaryResult.status === 'fulfilled' ? summaryResult.value : []
      setProjectSummaries(Object.fromEntries(summaries.map(summary => [summary.project.id, summary])))
      setError(materialResult.status === 'rejected' || summaryResult.status === 'rejected' || catalogRequestResult.status === 'rejected'
        ? 'New-request setup is temporarily unavailable. Existing requests are still shown.'
        : null)
    }

    void load()
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
          setError(errorMessage(requestError))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [currentUser.projects, currentUser.role, refreshKey])

  const needsCurrentRole = (requisition: Requisition) => {
    if (currentUser.role === 'Foreman') return requisition.status === 'ReturnedForRevision'
    if (currentUser.role === 'Engineer') return false
    if (currentUser.role === 'Supervisor') return requisition.status === 'AwaitingSupervisorDecision' || requisition.status === 'AwaitingTechnicalCheck'
    return false
  }
  const hasSimpleQueue = ['Foreman', 'Engineer', 'Supervisor'].includes(currentUser.role)
  const requestedQueue = searchParams.get('view')
  const queueView = requestedQueue === 'action' || requestedQueue === 'moving' || requestedQueue === 'finished'
    ? requestedQueue
    : currentUser.role === 'Foreman' ? 'moving' : 'action'
  const filteredRequisitions = requisitions.filter(requisition => {
    if (projectFilter && requisition.projectId !== Number(projectFilter)) return false
    if (!hasSimpleQueue) return true
    if (queueView === 'action') return needsCurrentRole(requisition)
    const finished = requisition.status === 'Approved' || requisition.status === 'Rejected'
    return queueView === 'finished' ? finished : !finished
  })
  const queueCount = requisitions.filter(needsCurrentRole).length
  const pageTitle = currentUser.role === 'Foreman'
    ? 'Material requests'
    : currentUser.role === 'Engineer'
      ? 'Material checks'
      : currentUser.role === 'Supervisor'
        ? 'Material approvals'
        : 'Requisitions'

  function upsertRequisition(next: Requisition) {
    setRequisitions((current) => {
      const found = current.some((item) => item.id === next.id)
      return found
        ? current.map((item) => (item.id === next.id ? next : item))
        : [next, ...current]
    })
  }

  return (
    <div className="lav-view ceo-readable">
      <header className="lav-page-head">
        <div>
          <h1>{pageTitle}</h1>
        </div>
        {['Foreman', 'Engineer', 'Supervisor'].includes(currentUser.role) && (
          <span className={`lav-count-chip ${queueCount > 0 ? 'attention' : ''}`}>
            {queueCount} for your action
          </span>
        )}
      </header>

      {error && (
        <Notice tone="error">
          {error}{' '}
          <button
            type="button"
            onClick={() => {
              setLoading(true)
              setRefreshKey((value) => value + 1)
            }}
          >
            Try again
          </button>
        </Notice>
      )}

      {loading ? (
        <LoadingBlock label="Loading material requests…" />
      ) : (
        <>
          {currentUser.role === 'Foreman' && (
            <CreateRequisitionForm
              projects={Object.values(projectSummaries)}
              materials={materials}
              openInitially={searchParams.get('new') === '1'}
              onCreated={upsertRequisition}
              onCatalogSubmitted={(request) => setCatalogRequests((current) => [request, ...current])}
            />
          )}

          {currentUser.role === 'Foreman' && catalogRequests.length > 0 && (
            <details className="lav-catalog-request-status">
              <summary>
                <span>Material catalog requests</span>
                <b>{catalogRequests.filter((request) => request.status === 'Pending').length} waiting</b>
              </summary>
              <div>
                {catalogRequests.map((request) => (
                  <article key={request.id}>
                    <span><strong>{request.name}</strong><small>{request.unit} · {request.projectName}</small></span>
                    <b className={`status-${request.status.toLowerCase()}`}>{request.status}</b>
                    {request.reviewNotes && <small>{request.reviewNotes}</small>}
                  </article>
                ))}
              </div>
            </details>
          )}

          {hasSimpleQueue && <nav className="ops-action-nav requisition-section-nav" aria-label="Material request sections">
            <button type="button" className={queueView === 'action' ? 'active' : ''} aria-current={queueView === 'action' ? 'page' : undefined} onClick={() => setSearchParams({ view: 'action' }, { replace: true })}>Needs action</button>
            <button type="button" className={queueView === 'moving' ? 'active' : ''} aria-current={queueView === 'moving' ? 'page' : undefined} onClick={() => setSearchParams({ view: 'moving' }, { replace: true })}>In progress</button>
            <button type="button" className={queueView === 'finished' ? 'active' : ''} aria-current={queueView === 'finished' ? 'page' : undefined} onClick={() => setSearchParams({ view: 'finished' }, { replace: true })}>Finished</button>
          </nav>}

          <section className="lav-panel lav-request-panel">
            <header className="lav-panel-head lav-request-toolbar">
              <div>
                <h2>{currentUser.role === 'CEO' || currentUser.role === 'Auditor'
                  ? 'Material request records'
                  : queueView === 'action' ? 'Needs action' : queueView === 'finished' ? 'Finished requests' : 'Requests in progress'}</h2>
              </div>
              <div className="lav-filter-row">
                <label>
                  <span className="lav-visually-hidden">Filter by project</span>
                  <select
                    value={projectFilter}
                    onChange={(event) => setProjectFilter(event.currentTarget.value)}
                  >
                    <option value="">All projects</option>
                    {Object.values(projectSummaries).map(summary => (
                      <option key={summary.project.id} value={summary.project.id}>
                        {summary.project.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </header>

            <div className="lav-request-list">
              {filteredRequisitions.length ? (
                filteredRequisitions.map((requisition) => (
                  <RequisitionCard
                    key={requisition.id}
                    requisition={requisition}
                    currentUser={currentUser}
                    projectSummary={projectSummaries[requisition.projectId] ?? null}
                    onChanged={upsertRequisition}
                  />
                ))
              ) : (
                <EmptyState
                  title="No requests match"
                  detail={
                    requisitions.length
                      ? 'Choose another project.'
                      : 'There are no material requests visible to this account.'
                  }
                />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

interface CreateRequisitionFormProps {
  projects: ProjectSummary[]
  materials: Material[]
  openInitially?: boolean
  onCreated: (requisition: Requisition) => void
  onCatalogSubmitted: (request: MaterialCatalogRequest) => void
}

const missingMaterialValue = '__material_not_listed__'
const otherMaterialUnitValue = '__other_unit__'
const commonMaterialUnits = [
  'bags',
  'boxes',
  'cubic metres',
  'kilograms',
  'lengths',
  'litres',
  'metres',
  'packets',
  'pieces',
  'rolls',
  'sets',
  'sheets',
  'square metres',
  'tonnes',
  'units',
]

function CreateRequisitionForm({ projects, materials, openInitially = false, onCreated, onCatalogSubmitted }: CreateRequisitionFormProps) {
  const [open, setOpen] = useState(openInitially)
  const [projectId, setProjectId] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [costCodeId, setCostCodeId] = useState('')
  const [quantity, setQuantity] = useState('')
  const [neededByDate, setNeededByDate] = useState('')
  const [purpose, setPurpose] = useState('')
  const [notes, setNotes] = useState('')
  const [proposedMaterial, setProposedMaterial] = useState({
    name: '',
    category: '',
    unit: '',
    customUnit: '',
  })
  const requestSubmitLock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const hasMaterials = materials.length > 0
  const materialNotListed = materialId === missingMaterialValue

  const selectedProject = projects.find((project) => project.project.id === Number(projectId))
  const selectedMaterial = materials.find((material) => material.id === Number(materialId))
  const costCodes = selectedProject?.costCodes.filter((code) => code.isActive) ?? []
  const materialGroups = useMemo(() => {
    const grouped = new Map<string, Material[]>()
    materials.forEach((material) => {
      const category = material.category?.trim() || 'Other building materials'
      grouped.set(category, [...(grouped.get(category) ?? []), material])
    })
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, items]) => ({
        category,
        items: items.sort((left, right) => left.name.localeCompare(right.name)),
      }))
  }, [materials])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (requestSubmitLock.current) return

    requestSubmitLock.current = true
    setBusy(true)
    setMessage(null)
    try {
      if (materialNotListed) {
        const proposedUnit = proposedMaterial.unit === otherMaterialUnitValue
          ? proposedMaterial.customUnit.trim()
          : proposedMaterial.unit
        if (proposedMaterial.name.trim().length < 2) {
          throw new Error('Enter the material name.')
        }
        if (!proposedUnit) {
          throw new Error('Choose or enter the material unit.')
        }
        const catalogRequest = await materialCatalogRequestsApi.submit({
          projectId: Number(projectId),
          name: proposedMaterial.name.trim(),
          category: proposedMaterial.category.trim() || null,
          unit: proposedUnit,
          purpose: purpose.trim(),
        })
        onCatalogSubmitted(catalogRequest)
        setMaterialId('')
        setCostCodeId('')
        setQuantity('')
        setNeededByDate('')
        setPurpose('')
        setNotes('')
        setProposedMaterial({ name: '', category: '', unit: '', customUnit: '' })
        setMessage({ tone: 'success', text: 'Material sent to Procurement for review.' })
        return
      }

      const created = await requisitionsApi.create({
        projectId: Number(projectId),
        materialId: Number(materialId),
        costCodeId: Number(costCodeId),
        quantity: Number(quantity),
        neededByDate,
        purpose: purpose.trim(),
        notes: notes.trim() || null,
      })
      onCreated(created)
      setMaterialId('')
      setCostCodeId('')
      setQuantity('')
      setNeededByDate('')
      setPurpose('')
      setNotes('')
      setMessage({ tone: 'success', text: 'Request submitted.' })
    } catch (requestError) {
      setMessage({ tone: 'error', text: errorMessage(requestError) })
    } finally {
      requestSubmitLock.current = false
      setBusy(false)
    }
  }

  return (
    <section className={`lav-create-request ${open ? 'open' : ''}`}>
      <button
        className="lav-create-toggle"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span aria-hidden="true">+</span>
        <span>
          <strong>New material request</strong>
          <small>State what the site needs and when it is needed.</small>
        </span>
        <b>{open ? 'Close' : 'Open form'}</b>
      </button>

      {open && (
        <form onSubmit={submit}>
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          <div className="lav-form-grid request-form">
            <label className="lav-field compact">
              <span>Project</span>
              <select
                value={projectId}
                onChange={(event) => {
                  setProjectId(event.currentTarget.value)
                  setCostCodeId('')
                }}
                required
              >
                <option value="">Choose project</option>
                {projects.map((project) => (
                  <option key={project.project.id} value={project.project.id}>
                    {project.project.name}
                  </option>
                ))}
              </select>
            </label>
            {!materialNotListed && <label className="lav-field compact">
              <span>Budget area</span>
              <select
                value={costCodeId}
                onChange={(event) => setCostCodeId(event.currentTarget.value)}
                disabled={!projectId || costCodes.length === 0}
                required
              >
                <option value="">
                  {!projectId
                    ? 'Choose project first'
                    : costCodes.length
                      ? 'Choose budget area'
                      : 'No cost areas available'}
                </option>
                {costCodes.map((code) => (
                  <option key={code.id} value={code.id}>
                    {code.code}: {code.name}
                  </option>
                ))}
              </select>
            </label>}
            <label className="lav-field compact">
              <span>Material</span>
              <select
                value={materialId}
                onChange={(event) => {
                  const nextMaterialId = event.currentTarget.value
                  setMaterialId(nextMaterialId)
                  if (nextMaterialId === missingMaterialValue) setCostCodeId('')
                  setQuantity('')
                  setNeededByDate('')
                  setNotes('')
                }}
                required
              >
                <option value="">
                  {hasMaterials ? 'Choose material' : 'No materials available'}
                </option>
                {materialGroups.map((group) => (
                  <optgroup label={group.category} key={group.category}>
                    {group.items.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.name} ({material.unit})
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={missingMaterialValue}>Material not listed</option>
              </select>
            </label>
            {materialNotListed ? (
              <>
                <label className="lav-field compact">
                  <span>Material name</span>
                  <input
                    value={proposedMaterial.name}
                    onChange={(event) => setProposedMaterial({ ...proposedMaterial, name: event.currentTarget.value })}
                    minLength={2}
                    maxLength={150}
                    required
                  />
                </label>
                <label className="lav-field compact">
                  <span>Category <small>Optional</small></span>
                  <input
                    value={proposedMaterial.category}
                    onChange={(event) => setProposedMaterial({ ...proposedMaterial, category: event.currentTarget.value })}
                    maxLength={100}
                  />
                </label>
                <label className="lav-field compact">
                  <span>Unit of measure</span>
                  <select
                    value={proposedMaterial.unit}
                    onChange={(event) => setProposedMaterial({ ...proposedMaterial, unit: event.currentTarget.value, customUnit: '' })}
                    required
                  >
                    <option value="">Choose unit</option>
                    {commonMaterialUnits.map((unit) => <option value={unit} key={unit}>{unit}</option>)}
                    <option value={otherMaterialUnitValue}>Other unit</option>
                  </select>
                </label>
                {proposedMaterial.unit === otherMaterialUnitValue && (
                  <label className="lav-field compact">
                    <span>Other unit</span>
                    <input
                      value={proposedMaterial.customUnit}
                      onChange={(event) => setProposedMaterial({ ...proposedMaterial, customUnit: event.currentTarget.value })}
                      maxLength={30}
                      required
                    />
                  </label>
                )}
              </>
            ) : <>
            <label className="lav-field compact">
              <span>Quantity</span>
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={quantity}
                onChange={(event) => setQuantity(event.currentTarget.value)}
                required
              />
            </label>
            <label className="lav-field compact">
              <span>Unit of measure</span>
              <select value={selectedMaterial?.unit ?? ''} disabled aria-label="Unit fixed by selected material">
                <option value="">Choose material first</option>
                {selectedMaterial && <option value={selectedMaterial.unit}>{selectedMaterial.unit}</option>}
              </select>
            </label>
            <label className="lav-field compact">
              <span>Needed by</span>
              <input
                type="date"
                min={todayInputValue()}
                value={neededByDate}
                onChange={(event) => setNeededByDate(event.currentTarget.value)}
                required
              />
            </label>
            </>}
            <label className="lav-field compact span-two">
              <span>Purpose</span>
              <input
                value={purpose}
                onChange={(event) => setPurpose(event.currentTarget.value)}
                minLength={3}
                maxLength={500}
                placeholder="Example: Ground-floor columns"
                required
              />
            </label>
            {!materialNotListed && <label className="lav-field compact span-three">
              <span>Notes <small>Optional</small></span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.currentTarget.value)}
                maxLength={1000}
                rows={2}
                placeholder="Add a short site detail."
              />
            </label>}
          </div>
          <div className="lav-form-actions">
            <span />
            <button className="lav-button primary" type="submit" disabled={busy}>
              {busy ? 'Sending…' : materialNotListed ? 'Send for review' : 'Send request'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}

interface RequisitionCardProps {
  requisition: Requisition
  currentUser: CurrentUser
  projectSummary: ProjectSummary | null
  onChanged: (requisition: Requisition) => void
}

function RequisitionCard({
  requisition,
  currentUser,
  projectSummary,
  onChanged,
}: RequisitionCardProps) {
  const canRevise =
    currentUser.role === 'Foreman' &&
    requisition.status === 'ReturnedForRevision' &&
    requisition.requestedByUserId === currentUser.id
  const canCheck = false
  const canDecide =
    (currentUser.role === 'Supervisor'
      && (requisition.status === 'AwaitingSupervisorDecision' || requisition.status === 'AwaitingTechnicalCheck'))
  const canSeeHistory = currentUser.role === 'CEO' || currentUser.role === 'Auditor'

  return (
    <article className="lav-request-card">
      <header>
        <div className="lav-request-id">
          <span>{requisition.requestType === 'StockReplenishment' ? 'STORE REPLENISHMENT' : 'SITE MATERIAL REQUEST'}</span>
          <strong>{requisition.materialName}</strong>
          <small>
            {formatNumber(requisition.quantity)} {requisition.materialUnit} · needed{' '}
            {formatDate(requisition.neededByDate)}
          </small>
        </div>
        <span className={`lav-status ${statusTone(requisition.status)}`}>
          {statusLabel(requisition.status)}
        </span>
      </header>

      <div className="lav-request-context">
        <div>
          <span>Project</span>
          <strong>{requisition.projectName}</strong>
        </div>
        <div>
          <span>Budget area</span>
          <strong>
            {requisition.costCode} · {requisition.costCodeName}
          </strong>
        </div>
        <div>
          <span>Purpose</span>
          <strong>{requisition.purpose}</strong>
        </div>
        <div><span>Request for</span><strong>{requisition.requestType === 'StockReplenishment' ? 'Store stock' : 'Site use'}</strong></div>
      </div>

      {requisition.latestTechnicalCheck?.comments && (
        <div className="lav-review-note">
          <span>Engineer note</span>
          <p>{requisition.latestTechnicalCheck.comments}</p>
        </div>
      )}

      {canRevise && (
        <ForemanRevisionForm
          requisition={requisition}
          projectSummary={projectSummary}
          onChanged={onChanged}
        />
      )}
      {canCheck && <EngineerCheckForm requisition={requisition} onChanged={onChanged} />}
      {canDecide && <SupervisorDecisionForm requisition={requisition} onChanged={onChanged} />}
      {canSeeHistory && <RequisitionHistory requisition={requisition} />}
    </article>
  )
}

interface WorkflowFormProps {
  requisition: Requisition
  onChanged: (requisition: Requisition) => void
}

interface ForemanRevisionFormProps extends WorkflowFormProps {
  projectSummary: ProjectSummary | null
}

function ForemanRevisionForm({
  requisition,
  projectSummary,
  onChanged,
}: ForemanRevisionFormProps) {
  const [open, setOpen] = useState(false)
  const [costCodeId, setCostCodeId] = useState(String(requisition.costCodeId))
  const [quantity, setQuantity] = useState(String(requisition.quantity))
  const [neededByDate, setNeededByDate] = useState(requisition.neededByDate)
  const [purpose, setPurpose] = useState(requisition.purpose)
  const [notes, setNotes] = useState(requisition.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const costCodes = projectSummary?.costCodes.filter((code) => code.isActive) ?? []

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    try {
      const updated = await requisitionsApi.update(requisition.id, {
        costCodeId: Number(costCodeId),
        quantity: Number(quantity),
        neededByDate,
        purpose: purpose.trim(),
        notes: notes.trim() || null,
        expectedRevision: requisition.workflowRevision,
      })
      onChanged(updated)
      setOpen(false)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="lav-card-action-row">
        <span>Change the request using the engineer or supervisor note.</span>
        <button className="lav-button primary" type="button" onClick={() => setOpen(true)}>
          Revise request
        </button>
      </div>
    )
  }

  return (
    <form className="lav-workflow-form" onSubmit={submit}>
      <header>
        <div>
          <span className="lav-kicker">Foreman action</span>
          <h3>Revise and resubmit</h3>
        </div>
        <button className="lav-text-button" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="lav-form-grid request-form">
        <label className="lav-field compact">
          <span>Budget area</span>
          <select
            value={costCodeId}
            onChange={(event) => setCostCodeId(event.currentTarget.value)}
            required
          >
            {costCodes.length === 0 && (
              <option value={requisition.costCodeId}>
                {requisition.costCode}: {requisition.costCodeName}
              </option>
            )}
            {costCodes.map((code) => (
              <option key={code.id} value={code.id}>
                {code.code}: {code.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lav-field compact">
          <span>Quantity ({requisition.materialUnit})</span>
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={quantity}
            onChange={(event) => setQuantity(event.currentTarget.value)}
            required
          />
        </label>
        <label className="lav-field compact">
          <span>Needed by</span>
          <input
            type="date"
            min={todayInputValue()}
            value={neededByDate}
            onChange={(event) => setNeededByDate(event.currentTarget.value)}
            required
          />
        </label>
        <label className="lav-field compact span-two">
          <span>Purpose</span>
          <input
            value={purpose}
            onChange={(event) => setPurpose(event.currentTarget.value)}
            minLength={3}
            maxLength={500}
            required
          />
        </label>
        <label className="lav-field compact span-three">
          <span>Notes <small>Optional</small></span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            maxLength={1000}
            rows={2}
          />
        </label>
      </div>
      <div className="lav-form-actions">
        <span>Next: Engineer review.</span>
        <button className="lav-button primary" type="submit" disabled={busy}>
          {busy ? 'Resubmitting…' : 'Resubmit revision'}
        </button>
      </div>
    </form>
  )
}

function EngineerCheckForm({ requisition, onChanged }: WorkflowFormProps) {
  const [outcome, setOutcome] = useState<TechnicalCheckOutcome>('Verified')
  const [comments, setComments] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    try {
      const updated = await requisitionsApi.recordTechnicalCheck(requisition.id, {
        outcome,
        comments: comments.trim() || null,
        expectedRevision: requisition.workflowRevision,
      })
      onChanged(updated)
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
          <span className="lav-kicker">Engineer action</span>
          <h3>Technical check</h3>
        </div>
        <span className="lav-separation-note">You cannot approve this request.</span>
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="lav-decision-options" role="radiogroup" aria-label="Technical outcome">
        <label>
          <input
            type="radio"
            name={`technical-${requisition.id}`}
            value="Verified"
            checked={outcome === 'Verified'}
            onChange={() => setOutcome('Verified')}
          />
          <span>
            <strong>Technically correct</strong>
            <small>Send to the supervisor.</small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name={`technical-${requisition.id}`}
            value="RevisionRequired"
            checked={outcome === 'RevisionRequired'}
            onChange={() => setOutcome('RevisionRequired')}
          />
          <span>
            <strong>Needs revision</strong>
            <small>Return it to the foreman.</small>
          </span>
        </label>
      </div>
      <label className="lav-field compact">
        <span>
          Engineer note {outcome === 'Verified' && <small>Optional</small>}
        </span>
        <textarea
          value={comments}
          onChange={(event) => setComments(event.currentTarget.value)}
          maxLength={1000}
          minLength={outcome === 'RevisionRequired' ? 3 : undefined}
          rows={3}
          placeholder={
            outcome === 'RevisionRequired'
              ? 'Tell the foreman exactly what must change.'
              : 'Add a brief technical note if useful.'
          }
          required={outcome === 'RevisionRequired'}
        />
      </label>
      <div className="lav-form-actions">
        <button className="lav-button primary" type="submit" disabled={busy}>
          {busy ? 'Recording…' : outcome === 'Verified' ? 'Verify request' : 'Return to foreman'}
        </button>
      </div>
    </form>
  )
}

function SupervisorDecisionForm({ requisition, onChanged }: WorkflowFormProps) {
  const [decision, setDecision] = useState<SupervisorDecision>('Approve')
  const [comments, setComments] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    try {
      const updated = await requisitionsApi.recordSupervisorDecision(requisition.id, {
        decision,
        comments: comments.trim() || null,
        expectedRevision: requisition.workflowRevision,
      })
      onChanged(updated)
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
          <span className="lav-kicker">Supervisor action</span>
          <h3>Independent decision</h3>
        </div>
        <span className="lav-separation-note">{requisition.requestType === 'StockReplenishment' ? 'Store stock request' : 'Engineer check: verified'}</span>
      </header>
      {error && <Notice tone="error">{error}</Notice>}
      <div className={`lav-decision-options ${requisition.requestType === 'StockReplenishment' ? 'two' : 'three'}`} role="radiogroup" aria-label="Decision">
        <label>
          <input
            type="radio"
            name={`decision-${requisition.id}`}
            value="Approve"
            checked={decision === 'Approve'}
            onChange={() => setDecision('Approve')}
          />
          <span>
            <strong>Approve</strong>
            <small>Release to procurement.</small>
          </span>
        </label>
        {requisition.requestType !== 'StockReplenishment' && <label>
          <input
            type="radio"
            name={`decision-${requisition.id}`}
            value="ReturnForRevision"
            checked={decision === 'ReturnForRevision'}
            onChange={() => setDecision('ReturnForRevision')}
          />
          <span>
            <strong>Return</strong>
            <small>Foreman can correct it.</small>
          </span>
        </label>}
        <label>
          <input
            type="radio"
            name={`decision-${requisition.id}`}
            value="Reject"
            checked={decision === 'Reject'}
            onChange={() => setDecision('Reject')}
          />
          <span>
            <strong>Reject</strong>
            <small>Close this request.</small>
          </span>
        </label>
      </div>
      <label className="lav-field compact">
        <span>
          Decision note {decision === 'Approve' && <small>Optional</small>}
        </span>
        <textarea
          value={comments}
          onChange={(event) => setComments(event.currentTarget.value)}
          maxLength={1000}
          minLength={decision === 'Approve' ? undefined : 3}
          rows={3}
          placeholder={
            decision === 'Approve'
              ? 'Add a short approval note if needed.'
              : 'Give the reason so the record is clear.'
          }
          required={decision !== 'Approve'}
        />
      </label>
      <div className="lav-form-actions">
        <button
          className={`lav-button ${decision === 'Reject' ? 'danger' : 'primary'}`}
          type="submit"
          disabled={busy}
        >
          {busy
            ? 'Recording…'
            : decision === 'Approve'
              ? 'Approve request'
              : decision === 'Reject'
                ? 'Reject request'
                : 'Return for revision'}
        </button>
      </div>
    </form>
  )
}

function RequisitionHistory({ requisition }: { requisition: Requisition }) {
  function requestedQuantity(event: Requisition['history'][number]) {
    try {
      const snapshot = JSON.parse(event.eventDataJson) as { quantity?: unknown }
      const quantity = Number(snapshot.quantity)
      return Number.isFinite(quantity) && quantity > 0 ? quantity : requisition.quantity
    } catch {
      return requisition.quantity
    }
  }

  return (
    <details className="lav-history">
      <summary>
        <span>
          <strong>Approval history</strong>
          <small>{requisition.history.length} recorded steps</small>
        </span>
        <b>Show steps</b>
      </summary>
      <ol>
        {requisition.history.length ? (
          requisition.history.map((event) => {
            const isRequest = event.eventType === 'Requested' || event.eventType === 'StockReplenishmentRequested'
            return <li key={`${event.sequenceNumber}-${event.eventHash}`}>
              <span aria-hidden="true">{event.sequenceNumber}</span>
              <div>
                <strong>{event.eventType.replace(/([a-z])([A-Z])/g, '$1 $2')}</strong>
                <p>
                  {event.actorName} · {event.actorRole}
                </p>
                {isRequest
                  ? <blockquote>{requisition.materialName} · {formatNumber(requestedQuantity(event))} {requisition.materialUnit}</blockquote>
                  : event.comments && <blockquote>{event.comments}</blockquote>}
                <small>{formatDateTime(event.occurredAt)}</small>
              </div>
            </li>
          })
        ) : (
          <li className="lav-history-empty">No history was returned for this record.</li>
        )}
      </ol>
    </details>
  )
}
