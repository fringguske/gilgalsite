import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import {
  ApiError,
  authenticationExpiredEvent,
  authApi,
  notificationsApi,
  type AppNotification,
  type ConstructionRole,
  type CurrentUser,
  type VerificationCodeSent,
} from './api'
import type { LiveDestination } from './LiveApiViews'
import { PendingVerification } from './pendingVerification'
import './live-shell.css'
import './live-shell-extras.css'

const LiveDashboardView = lazy(() => import('./LiveApiViews').then(module => ({ default: module.LiveDashboardView })))
const LiveLoginView = lazy(() => import('./LiveApiViews').then(module => ({ default: module.LiveLoginView })))
const PublicLandingView = lazy(() => import('./LiveApiViews').then(module => ({ default: module.PublicLandingView })))
const LiveProjectsView = lazy(() => import('./LiveApiViews').then(module => ({ default: module.LiveProjectsView })))
const LiveRequisitionsView = lazy(() => import('./LiveApiViews').then(module => ({ default: module.LiveRequisitionsView })))
const LiveProcurementView = lazy(() => import('./LivePurchaseViews').then(module => ({ default: module.LiveProcurementView })))
const LivePurchaseOrdersView = lazy(() => import('./LivePurchaseViews').then(module => ({ default: module.LivePurchaseOrdersView })))
const LiveAccessView = lazy(() => import('./LiveAccessView').then(module => ({ default: module.LiveAccessView })))
const LiveSuppliersView = lazy(() => import('./LiveSuppliersView').then(module => ({ default: module.LiveSuppliersView })))
const LiveInventoryView = lazy(() => import('./LiveOperationsViews').then(module => ({ default: module.LiveInventoryView })))
const LiveTechnicalAcceptanceView = lazy(() => import('./LiveOperationsViews').then(module => ({ default: module.LiveTechnicalAcceptanceView })))
const LiveFinanceView = lazy(() => import('./LiveOperationsViews').then(module => ({ default: module.LiveFinanceView })))
const LivePettyCashView = lazy(() => import('./LiveOperationsViews').then(module => ({ default: module.LivePettyCashView })))
const LiveAuditView = lazy(() => import('./LiveOperationsViews').then(module => ({ default: module.LiveAuditView })))
const LiveCashBookView = lazy(() => import('./LiveOperationsViews').then(module => ({ default: module.LiveCashBookView })))
const MyTasksView = lazy(() => import('./LiveGovernanceViews').then(module => ({ default: module.MyTasksView })))
const OpeningPositionsView = lazy(() => import('./LiveGovernanceViews').then(module => ({ default: module.OpeningPositionsView })))
const HandoverDifferencesView = lazy(() => import('./LiveGovernanceViews').then(module => ({ default: module.HandoverDifferencesView })))
const PeriodClosingView = lazy(() => import('./LiveGovernanceViews').then(module => ({ default: module.PeriodClosingView })))

type NavItem = { to: string; label: string; glyph: string; activePaths?: readonly string[] }

const roleNavigation: Record<ConstructionRole, readonly NavItem[]> = {
  Administrator: [
    { to: '/', label: 'Overview', glyph: 'OV' },
    { to: '/tasks', label: 'My work', glyph: 'TK' },
    { to: '/access', label: 'Team access', glyph: 'AC' },
  ],
  CEO: [
    { to: '/', label: 'Overview', glyph: 'OV' },
    { to: '/projects', label: 'Projects', glyph: 'PR' },
    { to: '/inventory', label: 'Materials', glyph: 'MI', activePaths: ['/requisitions', '/sourcing', '/suppliers', '/purchase-orders'] },
    { to: '/finance', label: 'Money', glyph: 'MO', activePaths: ['/petty-cash'] },
    { to: '/tasks', label: 'My decisions', glyph: 'TK', activePaths: ['/opening-positions', '/period-close'] },
    { to: '/audit', label: 'Records & audit', glyph: 'AU' },
  ],
  Supervisor: [
    { to: '/', label: 'Overview', glyph: 'OV' },
    { to: '/tasks', label: 'My work', glyph: 'TK' },
    { to: '/projects', label: 'Projects', glyph: 'PR' },
    { to: '/requisitions', label: 'Materials', glyph: 'MR', activePaths: ['/sourcing', '/purchase-orders', '/inventory', '/opening-positions', '/custody-close-out'] },
    { to: '/finance', label: 'Money', glyph: 'PA', activePaths: ['/petty-cash'] },
  ],
  Engineer: [
    { to: '/', label: 'Overview', glyph: 'OV' },
    { to: '/tasks', label: 'My work', glyph: 'TK' },
    { to: '/projects', label: 'Project progress', glyph: 'PR' },
    { to: '/requisitions', label: 'Checks', glyph: 'TC', activePaths: ['/delivery-checks'] },
  ],
  Foreman: [
    { to: '/', label: 'Overview', glyph: 'OV' },
    { to: '/tasks', label: 'My work', glyph: 'TK' },
    { to: '/requisitions', label: 'Requests', glyph: 'MR' },
    { to: '/inventory', label: 'My materials', glyph: 'MI' },
  ],
  Storekeeper: [
    { to: '/', label: 'Overview', glyph: 'OV' },
    { to: '/tasks', label: 'My work', glyph: 'TK' },
    { to: '/inventory', label: 'Store', glyph: 'ST', activePaths: ['/purchase-orders', '/opening-positions', '/requisitions'] },
  ],
  'Procurement Officer': [
    { to: '/', label: 'Overview', glyph: 'OV' },
    { to: '/tasks', label: 'My work', glyph: 'TK' },
    { to: '/sourcing', label: 'Buying', glyph: 'SO', activePaths: ['/purchase-orders', '/suppliers', '/requisitions'] },
    { to: '/finance', label: 'Supplier invoices', glyph: 'IN' },
  ],
  'Finance Officer': [
    { to: '/', label: 'Overview', glyph: 'OV' },
    { to: '/tasks', label: 'My work', glyph: 'TK' },
    { to: '/suppliers', label: 'Suppliers', glyph: 'SU' },
    { to: '/finance', label: 'Supplier payments', glyph: 'IN', activePaths: ['/purchase-orders', '/inventory'] },
    { to: '/petty-cash', label: 'Petty cash', glyph: 'PC' },
    { to: '/cash-book', label: 'Cash book', glyph: 'CB' },
    { to: '/projects', label: 'Finance controls', glyph: 'PR', activePaths: ['/opening-positions'] },
  ],
  Auditor: [
    { to: '/', label: 'Overview', glyph: 'OV' },
    { to: '/projects', label: 'Projects', glyph: 'PR' },
    { to: '/inventory', label: 'Materials', glyph: 'MI', activePaths: ['/requisitions', '/sourcing', '/suppliers', '/purchase-orders'] },
    { to: '/finance', label: 'Money', glyph: 'MO', activePaths: ['/petty-cash'] },
    { to: '/audit', label: 'Records', glyph: 'AU', activePaths: ['/opening-positions'] },
  ],
}

const additionalRoleRoutes: Partial<Record<ConstructionRole, readonly string[]>> = {
  'Procurement Officer': ['/purchase-orders', '/suppliers', '/requisitions'],
  CEO: [
    '/requisitions',
    '/sourcing',
    '/suppliers',
    '/purchase-orders',
    '/opening-positions',
    '/petty-cash',
    '/period-close',
  ],
  Supervisor: ['/sourcing', '/purchase-orders', '/inventory', '/opening-positions', '/custody-close-out', '/petty-cash'],
  Engineer: ['/delivery-checks'],
  Storekeeper: ['/purchase-orders', '/opening-positions', '/requisitions'],
  'Finance Officer': ['/purchase-orders', '/inventory', '/opening-positions'],
  Auditor: [
    '/requisitions',
    '/sourcing',
    '/suppliers',
    '/purchase-orders',
    '/opening-positions',
    '/petty-cash',
  ],
}

type ContextLink = { to: string; label: string }
type ContextSection = { paths: readonly string[]; label: string; links: readonly ContextLink[] }

const roleContextSections: Partial<Record<ConstructionRole, readonly ContextSection[]>> = {
  CEO: [{
    paths: ['/inventory', '/requisitions', '/sourcing', '/suppliers', '/purchase-orders'],
    label: 'Materials',
    links: [
      { to: '/inventory', label: 'Current stock' },
      { to: '/requisitions', label: 'Requests' },
      { to: '/suppliers', label: 'Suppliers' },
      { to: '/purchase-orders', label: 'Orders' },
    ],
  }, {
    paths: ['/finance', '/petty-cash'],
    label: 'Money',
    links: [
      { to: '/finance', label: 'Summary' },
      { to: '/finance?section=invoices', label: 'Supplier invoices' },
      { to: '/finance?section=executed', label: 'Executed payments' },
      { to: '/petty-cash', label: 'Petty cash' },
    ],
  }, {
    paths: ['/tasks', '/opening-positions', '/period-close'],
    label: 'My decisions',
    links: [
      { to: '/tasks', label: 'Waiting decisions' },
      { to: '/opening-positions', label: 'Starting balances' },
    ],
  }],
  Supervisor: [{
    paths: ['/requisitions', '/sourcing', '/purchase-orders', '/inventory', '/opening-positions', '/custody-close-out'],
    label: 'Materials',
    links: [
      { to: '/requisitions', label: 'Requests' },
      { to: '/purchase-orders', label: 'Orders' },
      { to: '/inventory', label: 'Stock controls' },
      { to: '/inventory?section=stock', label: 'Current stock' },
      { to: '/inventory?section=movements', label: 'Movements' },
      { to: '/opening-positions', label: 'Opening stock' },
      { to: '/custody-close-out', label: 'Handover differences' },
    ],
  }, {
    paths: ['/finance', '/petty-cash'],
    label: 'Money',
    links: [
      { to: '/finance', label: 'Supplier payments' },
      { to: '/finance?section=executed', label: 'Executed payments' },
      { to: '/petty-cash', label: 'Petty cash' },
    ],
  }],
  Storekeeper: [{
    paths: ['/inventory', '/purchase-orders', '/opening-positions', '/requisitions'],
    label: 'Store',
    links: [
      { to: '/inventory', label: 'Operations' },
      { to: '/inventory?section=stock', label: 'Current stock' },
      { to: '/inventory?section=movements', label: 'Movements' },
      { to: '/purchase-orders', label: 'Expected deliveries' },
      { to: '/requisitions', label: 'Request tracker' },
      { to: '/opening-positions', label: 'Opening stock' },
    ],
  }],
  'Finance Officer': [{
    paths: ['/suppliers', '/finance', '/purchase-orders', '/inventory'],
    label: 'Supplier payments',
    links: [
      { to: '/suppliers', label: 'Suppliers' },
      { to: '/purchase-orders', label: 'Purchase orders' },
      { to: '/inventory', label: 'Delivery records' },
      { to: '/finance', label: 'Supplier invoices' },
      { to: '/finance?section=authorized', label: 'Payments ready' },
      { to: '/finance?section=executed', label: 'Payments paid' },
    ],
  }, {
    paths: ['/projects', '/opening-positions'],
    label: 'Finance controls',
    links: [
      { to: '/projects', label: 'Project budgets' },
      { to: '/opening-positions', label: 'Opening cash' },
    ],
  }],
  'Procurement Officer': [{
    paths: ['/sourcing', '/purchase-orders', '/suppliers', '/requisitions'],
    label: 'Buying',
    links: [
      { to: '/sourcing', label: 'To order' },
      { to: '/purchase-orders', label: 'Purchase orders' },
      { to: '/suppliers', label: 'Suppliers' },
      { to: '/sourcing?section=catalog', label: 'Material catalog' },
      { to: '/requisitions', label: 'Request tracker' },
    ],
  }],
  Auditor: [{
    paths: ['/inventory', '/requisitions', '/sourcing', '/suppliers', '/purchase-orders'],
    label: 'Materials',
    links: [
      { to: '/inventory', label: 'Stock' },
      { to: '/requisitions', label: 'Requests' },
      { to: '/suppliers', label: 'Suppliers' },
      { to: '/purchase-orders', label: 'Orders' },
    ],
  }, {
    paths: ['/finance', '/petty-cash'],
    label: 'Money',
    links: [
      { to: '/finance', label: 'Supplier payments' },
      { to: '/finance?section=executed', label: 'Executed payments' },
      { to: '/petty-cash', label: 'Petty cash' },
    ],
  }, {
    paths: ['/audit', '/opening-positions'],
    label: 'Records',
    links: [
      { to: '/audit', label: 'Complete chain' },
      { to: '/opening-positions', label: 'Opening positions' },
    ],
  }],
}

const destinationPaths: Record<LiveDestination, string> = {
  access: '/access', projects: '/projects', requisitions: '/requisitions', sourcing: '/sourcing',
  suppliers: '/suppliers', 'purchase-orders': '/purchase-orders', inventory: '/inventory',
  finance: '/finance', audit: '/audit',
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U'
}

function errorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : 'The request could not be completed.'
}

function SessionLoading() {
  return <main className="lav-session-state" role="status"><span/><p>Opening your workspace…</p></main>
}

function AccessRestricted({ role }: { role: ConstructionRole }) {
  return <div className="lav-view"><div className="lav-empty"><span aria-hidden="true"/><h3>Access unavailable</h3><p>This page is not assigned to the {role} role.</p></div></div>
}

function AccountDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="account-dialog-wrap"><button className="account-dialog-backdrop" aria-label={`Close ${title}`} onClick={onClose}/><section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title"><header><h2 id="account-dialog-title">{title}</h2><button aria-label="Close" onClick={onClose}>×</button></header>{children}</section></div>
}

function UsernameDialog({ username, onClose, onChanged }: { username: string; onClose: () => void; onChanged: () => void }) {
  const [newUsername, setNewUsername] = useState(username)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null)
    try { await authApi.changeUsername({ newUsername: newUsername.trim(), currentPassword: password }); onChanged() }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <AccountDialog title="Change username" onClose={onClose}><form onSubmit={event => void submit(event)}><label><span>New username</span><input autoFocus required minLength={3} maxLength={64} value={newUsername} onChange={event => setNewUsername(event.currentTarget.value)}/></label><label><span>Current password</span><input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.currentTarget.value)}/></label>{error && <p role="alert">{error}</p>}<footer><button type="button" onClick={onClose}>Cancel</button><button disabled={busy}>{busy ? 'Saving…' : 'Save username'}</button></footer></form></AccountDialog>
}

function VerificationCodeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <label><span>Verification code</span><input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} placeholder="6-digit code" value={value} onChange={event => onChange(event.currentTarget.value.replace(/\D/g, ''))}/></label>
}

type SentCode = Pick<VerificationCodeSent, 'sentTo' | 'expiresAt'>

function PasswordDialog({ currentUser, onClose, onChanged }: { currentUser: CurrentUser; onClose: () => void; onChanged: () => void }) {
  // Passwords are never stored, so after a reload the code step asks for them again.
  const [resumed] = useState(() => PendingVerification.read('ChangePassword', currentUser.username))
  const [forgotCurrentPassword, setForgotCurrentPassword] = useState(resumed?.forgotCurrentPassword ?? false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState<SentCode | null>(resumed)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsCode = currentUser.emailVerificationEnabled
  // A reset needs no current password, so its code only goes to a confirmed address.
  const canReset = needsCode && currentUser.emailVerified
  function close() { PendingVerification.clear(); onClose() }
  async function sendCode() {
    if (!forgotCurrentPassword && !currentPassword) { setError('Enter your current password to get a new code.'); return }
    setBusy(true); setError(null)
    try {
      let next: SentCode
      if (forgotCurrentPassword) {
        await authApi.sendPasswordResetCode({ username: currentUser.username })
        next = { sentTo: currentUser.email, expiresAt: PendingVerification.expiresAtFromNow() }
      } else {
        next = await authApi.sendPasswordChangeCode({ currentPassword })
      }
      PendingVerification.save({ flow: 'ChangePassword', username: currentUser.username, forgotCurrentPassword, sentTo: next.sentTo, expiresAt: next.expiresAt })
      setSent(next)
      setCode('')
    }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword !== confirmPassword) { setError('The new passwords do not match.'); return }
    if (needsCode && !sent) { await sendCode(); return }
    setBusy(true); setError(null)
    try {
      if (forgotCurrentPassword) await authApi.resetPassword({ username: currentUser.username, verificationCode: code, newPassword, confirmNewPassword: confirmPassword })
      else await authApi.changePassword({ currentPassword, newPassword, confirmNewPassword: confirmPassword, verificationCode: needsCode ? code : undefined })
      PendingVerification.clear()
      onChanged()
    }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  const submitLabel = needsCode && !sent ? (busy ? 'Sending…' : 'Send code') : forgotCurrentPassword ? (busy ? 'Resetting…' : 'Reset password') : (busy ? 'Changing…' : 'Change password')
  const passwordFields = <>{!forgotCurrentPassword && <label><span>Current password</span><input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.currentTarget.value)}/></label>}<label><span>New password</span><input autoFocus={forgotCurrentPassword && !sent} type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={newPassword} onChange={event => setNewPassword(event.currentTarget.value)}/></label><label><span>Confirm new password</span><input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={confirmPassword} onChange={event => setConfirmPassword(event.currentTarget.value)}/></label></>
  return <AccountDialog title={forgotCurrentPassword ? 'Reset password' : 'Change password'} onClose={close}><form onSubmit={event => void submit(event)}>{sent ? <><SentCodeNote sent={sent}/><VerificationCodeField value={code} onChange={setCode}/>{resumed && <><p className="account-dialog-note">The page reloaded, so enter your {forgotCurrentPassword ? 'new password' : 'passwords'} again.</p>{passwordFields}</>}</> : <>{passwordFields}{needsCode && <p className="account-dialog-note">{forgotCurrentPassword ? <>A code will be emailed to <strong>{currentUser.email}</strong>. You do not need your current password.</> : <>A code will be emailed to <strong>{currentUser.email}</strong> to confirm the change.</>}</p>}{canReset && !forgotCurrentPassword && <button type="button" className="account-dialog-link" onClick={() => { setForgotCurrentPassword(true); setCurrentPassword(''); setError(null) }}>Forgot your current password?</button>}</>}{error && <p role="alert">{error}</p>}<footer><button type="button" onClick={close}>Cancel</button>{sent && <button type="button" disabled={busy} onClick={() => void sendCode()}>Resend code</button>}<button disabled={busy}>{submitLabel}</button></footer></form></AccountDialog>
}

function SentCodeNote({ sent }: { sent: SentCode }) {
  return <p className="account-dialog-note">Enter the code sent to <strong>{sent.sentTo}</strong>. It works until {PendingVerification.formatExpiry(sent.expiresAt)}. If it is not in your inbox, check the spam folder.</p>
}

function EmailDialog({ currentUser, onClose, onVerified }: { currentUser: CurrentUser; onClose: () => void; onVerified: (user: CurrentUser) => void }) {
  const [email, setEmail] = useState(currentUser.email)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState<SentCode | null>(() => PendingVerification.read('ConfirmEmail', currentUser.username))
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  function close() { PendingVerification.clear(); onClose() }
  async function sendCode() {
    // After a reload the password is gone, so a new code starts from the first step again.
    if (!password) { PendingVerification.clear(); setSent(null); setError(null); return }
    setBusy(true); setError(null)
    try {
      const next = await authApi.changeEmail({ email: email.trim(), currentPassword: password })
      PendingVerification.save({ flow: 'ConfirmEmail', username: currentUser.username, sentTo: next.sentTo, expiresAt: next.expiresAt })
      setSent(next); setCode('')
    }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!sent) { await sendCode(); return }
    setBusy(true); setError(null)
    try { const user = await authApi.confirmEmail({ verificationCode: code }); PendingVerification.clear(); setConfirmed(true); onVerified(user) }
    catch (cause) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  if (currentUser.emailVerified) {
    return <AccountDialog title="Email address" onClose={close}><form onSubmit={event => { event.preventDefault(); close() }}><p className="account-dialog-note">{confirmed ? 'Your email address is confirmed: ' : 'Your confirmed email address is '}<strong>{currentUser.email}</strong>. Codes to change or reset your password are sent to it.</p><p className="account-dialog-note">If it needs to change, ask an Administrator.</p><footer><button>Close</button></footer></form></AccountDialog>
  }
  return <AccountDialog title="Confirm email address" onClose={close}><form onSubmit={event => void submit(event)}>{sent ? <><SentCodeNote sent={sent}/><VerificationCodeField value={code} onChange={setCode}/></> : <><p className="account-dialog-note">A code will be emailed to this address to confirm it is yours. Once it is confirmed, codes sent to it let you change your password, or reset it if you forget it.</p><label><span>Email address</span><input autoFocus required type="email" inputMode="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.currentTarget.value)}/></label><label><span>Current password</span><input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.currentTarget.value)}/></label></>}{error && <p role="alert">{error}</p>}<footer><button type="button" onClick={close}>Cancel</button>{sent && <button type="button" disabled={busy} onClick={() => void sendCode()}>Resend code</button>}<button disabled={busy}>{busy ? (sent ? 'Confirming…' : 'Sending…') : sent ? 'Confirm email' : 'Send code'}</button></footer></form></AccountDialog>
}

function notificationMessage(item: AppNotification) {
  if (item.taskType === 'OpeningPositionDecision' || item.taskType === 'ControlledCorrectionDecision') {
    return item.message.split(' · ')[0]
  }
  return item.message
}

function notificationTarget(item: AppNotification, role: ConstructionRole) {
  const path = item.targetPath && item.targetPath.startsWith('/') && !item.targetPath.startsWith('//')
    ? item.targetPath
    : null
  if (!path) return null
  if (role === 'CEO' && path === '/finance') return '/finance?section=invoices'
  if (role === 'Finance Officer' && item.taskType === 'PaymentExecution' && path === '/finance') {
    return '/finance?section=authorized'
  }
  if (role === 'Finance Officer' && item.taskType === 'InvoiceMatch' && path === '/finance') {
    return '/finance?view=all'
  }
  if (role === 'Foreman' && item.taskType === 'RequisitionRevision' && path === '/requisitions') {
    return '/requisitions?view=action'
  }
  if (role === 'Procurement Officer') {
    if (item.taskType === 'MaterialCatalogReview') return '/sourcing?section=catalog'
    if (item.taskType === 'OpenSourcing' && path === '/sourcing') return '/sourcing'
    if ((item.taskType === 'SubmitPurchaseOrder' || item.taskType === 'IssuePurchaseOrder') && path === '/purchase-orders') {
      return '/purchase-orders?section=unfinished'
    }
  }
  if (role === 'Storekeeper' && path === '/inventory') {
    if (item.taskType.includes('GoodsReceipt') || item.taskType.includes('Delivery')) return '/inventory?action=receive'
    if (item.taskType.includes('MaterialIssue')) return '/inventory?action=issue'
    if (item.taskType === 'StockTransferDispatch' || item.taskType === 'StockTransferReceipt') return '/inventory?action=transfers'
  }
  return path
}

function NotificationMenu({ role, onNavigate }: { role: ConstructionRole; onNavigate: (path: string) => void }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([notificationsApi.list(controller.signal), notificationsApi.unreadCount(controller.signal)])
      .then(([result, count]) => { setItems(result.items); setUnreadCount(count.unreadCount); setError(null) })
      .catch(cause => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(errorMessage(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    const timer = window.setInterval(() => setRefresh(value => value + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  async function openItem(item: AppNotification) {
    if (!item.isRead) {
      try {
        await notificationsApi.markRead(item.id)
        const readAt = new Date().toISOString()
        setUnreadCount(current => Math.max(0, current - 1))
        setItems(current => current.map(entry => entry.id === item.id ? { ...entry, isRead: true, readAt } : entry))
      } catch (cause) { setError(errorMessage(cause)); return }
    }
    const target = notificationTarget(item, role)
    setOpen(false)
    if (target) onNavigate(target)
  }

  async function readAll() {
    try {
      await notificationsApi.markAllRead()
      const readAt = new Date().toISOString()
      setUnreadCount(0)
      setItems(current => current.map(item => ({ ...item, isRead: true, readAt: item.readAt ?? readAt })))
    } catch (cause) { setError(errorMessage(cause)) }
  }

  return <div className="notification-menu">
    <button className="notification-trigger" aria-label="Notifications" aria-expanded={open} onClick={() => { if (!open) setRefresh(value => value + 1); setOpen(value => !value) }}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 20h4"/></svg>{Boolean(unreadCount) && <b>{unreadCount > 99 ? '99+' : unreadCount}</b>}</button>
    {open && <section className="notification-popover" role="dialog" aria-modal="false" aria-label="Notifications"><header><h2>Notifications</h2>{Boolean(unreadCount) && <button onClick={() => void readAll()}>Mark all read</button>}</header>{loading ? <div className="notification-state">Loading…</div> : error ? <div className="notification-state error"><span>{error}</span><button onClick={() => { setLoading(true); setRefresh(value => value + 1) }}>Try again</button></div> : items.length ? <div className="notification-list">{items.map(item => <button className={item.isRead ? '' : 'unread'} key={item.id} onClick={() => void openItem(item)}><span><b>{item.title}</b>{item.projectName && <small>{item.projectName}</small>}</span><p>{notificationMessage(item)}</p><time>{new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}</time></button>)}</div> : <div className="notification-state">No notifications</div>}</section>}
  </div>
}

function isContextLinkActive(pathname: string, search: string, target: string) {
  const [targetPath, targetQuery = ''] = target.split('?')
  if (pathname !== targetPath) return false
  const currentParams = new URLSearchParams(search)
  const targetParams = new URLSearchParams(targetQuery)
  const targetSection = targetParams.get('section')
  const currentSection = currentParams.get('section')

  if (targetSection) {
    return currentSection === targetSection
  }
  if (targetPath === '/finance' || targetPath === '/inventory' || targetPath === '/sourcing') return currentSection === null
  return true
}

function RoleContextNavigation({ role, pathname, search }: { role: ConstructionRole; pathname: string; search: string }) {
  const section = roleContextSections[role]?.find(item => item.paths.includes(pathname))
  if (!section) return null

  return <nav className="role-context-nav" aria-label={`${section.label} sections`}>
    {section.links.map(item => <Link
      className={isContextLinkActive(pathname, search, item.to) ? 'active' : ''}
      aria-current={isContextLinkActive(pathname, search, item.to) ? 'page' : undefined}
      key={item.to}
      to={item.to}
    >{item.label}</Link>)}
  </nav>
}

function Shell({ currentUser, onLogout, onRoleChanged, onUserChanged, onCredentialsChanged }: { currentUser: CurrentUser; onLogout: () => void; onRoleChanged: (user: CurrentUser) => void; onUserChanged: (user: CurrentUser) => void; onCredentialsChanged: (message: string) => void }) {
  const [navOpen, setNavOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [switchingRole, setSwitchingRole] = useState<ConstructionRole | null>(null)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [usernameOpen, setUsernameOpen] = useState(false)
  // Reopen a dialog whose code step was interrupted by a reload.
  const [passwordOpen, setPasswordOpen] = useState(() => PendingVerification.read('ChangePassword', currentUser.username) !== null)
  const [emailOpen, setEmailOpen] = useState(() => PendingVerification.read('ConfirmEmail', currentUser.username) !== null)
  const [emailPromptDismissed, setEmailPromptDismissed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const nav = roleNavigation[currentUser.role]
  const allowed = useMemo(() => new Set([...nav.map(item => item.to), ...(additionalRoleRoutes[currentUser.role] ?? [])]), [currentUser.role, nav])

  async function switchRole(role: ConstructionRole) {
    if (role === currentUser.role) { setAccountOpen(false); return }
    setSwitchingRole(role); setAccountError(null)
    try { const user = await authApi.switchRole({ role }); onRoleChanged(user); navigate('/') }
    catch (cause) { setAccountError(errorMessage(cause)) }
    finally { setSwitchingRole(null) }
  }

  const canAccess = (path: string) => path === '/' || path === '/tasks' || allowed.has(path)

  const showEmailPrompt = currentUser.emailVerificationEnabled && !currentUser.emailVerified && !emailPromptDismissed

  const readableOperationalRole = ['Administrator', 'Finance Officer', 'Foreman', 'Engineer', 'Supervisor', 'Storekeeper', 'Procurement Officer', 'Auditor'].includes(currentUser.role)

  return <div className={`live-shell${readableOperationalRole ? ' simplified-role-workspace' : ''}`}>
    <aside className={`live-sidebar ${navOpen ? 'open' : ''}`}>
      <header><div className="live-brand-mark" aria-hidden="true"><span/><span/><span/></div><div><strong>CONSTRUCT</strong><small>CONTROL SYSTEM</small></div><button aria-label="Close navigation" onClick={() => setNavOpen(false)}>×</button></header>
      <nav aria-label={`${currentUser.role} workspace`}><span>WORKSPACE</span>{nav.map(item => {
        const groupedActive = item.activePaths?.includes(location.pathname) ?? false
        return <NavLink key={item.to} to={item.to} end={item.to === '/'} aria-current={groupedActive ? 'page' : undefined} className={({ isActive }) => isActive || groupedActive ? 'active' : ''} onClick={() => setNavOpen(false)}><b>{item.label}</b></NavLink>
      })}</nav>
      <footer><span>{currentUser.role}</span><strong>{currentUser.projects.length ? `${currentUser.projects.length} assigned project${currentUser.projects.length === 1 ? '' : 's'}` : 'Portfolio access'}</strong></footer>
    </aside>
    {navOpen && <button className="live-sidebar-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)}/>}
    <main className="live-main">
      <header className="live-topbar"><button className="live-menu-button" aria-label="Open navigation" onClick={() => setNavOpen(true)}>☰</button><span className="live-mobile-brand">CONSTRUCT</span><div className="live-top-actions"><NotificationMenu role={currentUser.role} onNavigate={path => navigate(currentUser.role === 'CEO' && path === '/finance' ? '/finance?section=invoices' : path)}/><div className="live-account"><button className="live-profile" aria-expanded={accountOpen} onClick={() => setAccountOpen(value => !value)}><span>{initials(currentUser.fullName)}</span><div><strong>{currentUser.fullName}</strong><small>{currentUser.role}</small></div><i aria-hidden="true">⌄</i></button>{accountOpen && <section className="live-account-menu"><header><span>@{currentUser.username}</span><button aria-label="Close account menu" onClick={() => setAccountOpen(false)}>×</button></header>{currentUser.canSwitchRoles && <div className="live-role-list"><strong>Verification role</strong>{currentUser.availableRoles.map(role => <button className={role === currentUser.role ? 'active' : ''} disabled={switchingRole !== null} key={role} onClick={() => void switchRole(role)}><span>{role}</span>{switchingRole === role ? <small>Opening…</small> : role === currentUser.role && <small>Current</small>}</button>)}</div>}{accountError && <p role="alert">{accountError}</p>}<button onClick={() => { setAccountOpen(false); setUsernameOpen(true) }}>Change username</button><button onClick={() => { setAccountOpen(false); setPasswordOpen(true) }}>Change password</button>{currentUser.emailVerificationEnabled && <button onClick={() => { setAccountOpen(false); setEmailOpen(true) }}>{currentUser.emailVerified ? 'Email address' : 'Confirm email address'}</button>}<button className="sign-out" onClick={onLogout}>Sign out</button></section>}</div></div></header>
      <RoleContextNavigation role={currentUser.role} pathname={location.pathname} search={location.search}/>
      {showEmailPrompt && <div className="live-email-prompt" role="status"><p>Confirm your email address so you can reset your password if you forget it.</p><button className="primary" onClick={() => setEmailOpen(true)}>Confirm email</button><button aria-label="Dismiss" onClick={() => setEmailPromptDismissed(true)}>×</button></div>}
      <div className="live-content"><Routes>
        <Route path="/" element={<LiveDashboardView currentUser={currentUser} onNavigate={destination => navigate(destinationPaths[destination])}/>}/>
        <Route path="/tasks" element={<MyTasksView currentUser={currentUser}/>}/>
        <Route path="/projects" element={canAccess('/projects') ? <LiveProjectsView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/requisitions" element={canAccess('/requisitions') ? <LiveRequisitionsView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/sourcing" element={canAccess('/sourcing') ? <LiveProcurementView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/purchase-orders" element={canAccess('/purchase-orders') ? <LivePurchaseOrdersView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/access" element={canAccess('/access') ? <LiveAccessView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/suppliers" element={canAccess('/suppliers') ? <LiveSuppliersView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/inventory" element={canAccess('/inventory') ? <LiveInventoryView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/delivery-checks" element={canAccess('/delivery-checks') ? <LiveTechnicalAcceptanceView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/finance" element={canAccess('/finance') ? <LiveFinanceView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/petty-cash" element={canAccess('/petty-cash') ? <LivePettyCashView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/cash-book" element={canAccess('/cash-book') ? <LiveCashBookView/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/opening-positions" element={canAccess('/opening-positions') ? <OpeningPositionsView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/custody-close-out" element={canAccess('/custody-close-out') ? <HandoverDifferencesView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/period-close" element={canAccess('/period-close') ? <PeriodClosingView currentUser={currentUser}/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="/audit" element={canAccess('/audit') ? <LiveAuditView/> : <AccessRestricted role={currentUser.role}/>}/>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes></div>
    </main>
    {usernameOpen && <UsernameDialog username={currentUser.username} onClose={() => setUsernameOpen(false)} onChanged={() => onCredentialsChanged('Username changed. Sign in with your new username.')}/>}
    {passwordOpen && <PasswordDialog currentUser={currentUser} onClose={() => setPasswordOpen(false)} onChanged={() => onCredentialsChanged('Password changed. Sign in with your new password.')}/>}
    {emailOpen && <EmailDialog currentUser={currentUser} onClose={() => setEmailOpen(false)} onVerified={onUserChanged}/>}
  </div>
}

function LiveSession() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>()
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const controller = new AbortController()
    authApi.me(controller.signal).then(user => { setCurrentUser(user); setSessionError(null) }).catch(cause => {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setCurrentUser(null)
      if (!(cause instanceof ApiError && cause.status === 401)) setSessionError(errorMessage(cause))
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!currentUser) return
    const sessionExpired = () => {
      setSessionError('Session expired. Sign in again.')
      setSessionMessage(null)
      navigate('/login', { replace: true })
      setCurrentUser(null)
    }
    window.addEventListener(authenticationExpiredEvent, sessionExpired)
    return () => window.removeEventListener(authenticationExpiredEvent, sessionExpired)
  }, [currentUser, navigate])

  if (currentUser === undefined) return <SessionLoading/>
  if (currentUser === null) {
    if (location.pathname !== '/' && location.pathname !== '/login') return <Navigate to="/" replace/>
    const notices = <>{sessionError && <div className="lav-bootstrap-notice" role="alert">{sessionError}</div>}{sessionMessage && <div className="lav-bootstrap-notice success" role="status">{sessionMessage}</div>}</>
    if (location.pathname === '/') {
      return <>{notices}<PublicLandingView onSignIn={() => navigate('/login')} onRequestAccess={() => navigate('/login?mode=request')}/></>
    }
    const initialMode = new URLSearchParams(location.search).get('mode') === 'request' ? 'signup' : 'signin'
    return <>{notices}<LiveLoginView key={initialMode} initialMode={initialMode} onBack={() => navigate('/')} onAuthenticated={user => { setCurrentUser(user); setSessionError(null); setSessionMessage(null); navigate('/') }}/></>
  }

  async function logout() {
    PendingVerification.clear()
    try { await authApi.logout() } finally { setCurrentUser(null) }
  }
  function credentialsChanged(message: string) { setCurrentUser(null); setSessionError(null); setSessionMessage(message) }
  return <Shell currentUser={currentUser} onLogout={() => void logout()} onRoleChanged={setCurrentUser} onUserChanged={setCurrentUser} onCredentialsChanged={credentialsChanged}/>
}

export default function LiveApp() {
  return <BrowserRouter><Suspense fallback={<SessionLoading/>}><LiveSession/></Suspense></BrowserRouter>
}
