import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  accountingPeriodsApi,
  ApiError,
  custodyControlsApi,
  inventoryApi,
  materialsApi,
  openingPositionsApi,
  tasksApi,
  type ControlledCorrection,
  type CurrentUser,
  type CustodyCloseout,
  type Material,
  type MaterialIssue,
  type MaterialIssueDisputeResolution,
  type MaterialReturn,
  type MyTask,
  type MyTasksResponse,
  type OpeningPosition,
  type OperationalPeriod,
  type OperationalPeriodScope,
} from './api'
import { EvidenceFiles, EvidenceReferenceField } from './EvidenceReferenceField'
import './live-api.css'
import './live-governance.css'
import './governance-extras.css'

function messageOf(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : 'The request could not be completed.'
}

function date(value: string) {
  return new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function localInputDate(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  const year = parts.find(part => part.type === 'year')?.value ?? String(value.getUTCFullYear())
  const month = parts.find(part => part.type === 'month')?.value ?? String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = parts.find(part => part.type === 'day')?.value ?? String(value.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function number(value: number) {
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 3 }).format(value)
}

function money(value: number | null) {
  if (value === null) return 'Not valued'
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value)
}

function words(value: string) {
  return value.replaceAll(/([A-Z])/g, ' $1').trim()
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

function Notice({ tone = 'neutral', children }: { tone?: 'neutral' | 'error' | 'success'; children: ReactNode }) {
  return <div className={`lav-notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>
}

function Loading({ label }: { label: string }) {
  return <div className="lav-loading" role="status" aria-live="polite"><span/><p>{label}</p></div>
}

function Empty({ title, detail }: { title: string; detail?: string }) {
  return <div className="lav-empty"><span aria-hidden="true"/><h3>{title}</h3>{detail && <p>{detail}</p>}</div>
}

function safeTarget(task: MyTask, role: CurrentUser['role']) {
  const path = task.targetPath
  if (!path.startsWith('/') || path.startsWith('//')) return '/tasks'
  if (role === 'CEO' && path === '/finance') return '/finance?section=invoices'
  if (role === 'Finance Officer' && task.taskType === 'PaymentExecution' && path === '/finance') return '/finance?section=authorized'
  if (role === 'Finance Officer' && task.taskType === 'InvoiceMatch' && path === '/finance') return '/finance?view=all'
  if (role === 'Foreman' && task.taskType === 'RequisitionRevision' && path === '/requisitions') return '/requisitions?view=action'
  if (role === 'Procurement Officer') {
    if (task.taskType === 'MaterialCatalogReview') return '/sourcing?section=catalog'
    if (task.taskType === 'CompleteSourcing' && path === '/sourcing') return '/sourcing?section=open'
    if ((task.taskType === 'SubmitPurchaseOrder' || task.taskType === 'IssuePurchaseOrder') && path === '/purchase-orders') {
      return '/purchase-orders'
    }
  }
  if (role === 'Storekeeper' && path === '/inventory') {
    if (task.taskType.includes('GoodsReceipt') || task.taskType.includes('Delivery')) return '/inventory?action=receive'
    if (task.taskType.includes('MaterialIssue')) return '/inventory?action=issue'
    if (task.taskType === 'StockTransferDispatch' || task.taskType === 'StockTransferReceipt') return '/inventory?action=transfers'
  }
  return path
}

function taskDetail(task: MyTask) {
  if (task.taskType === 'OpeningPositionDecision' || task.taskType === 'ControlledCorrectionDecision') {
    return task.detail.split(' · ')[0]
  }
  return task.detail
}

function RecordEvidence({ sourceType, sourceId, canUpload, kind = 'Other' }: { sourceType: string; sourceId: number; canUpload: boolean; kind?: string }) {
  return <EvidenceFiles sourceType={sourceType} sourceId={sourceId} canUpload={canUpload} kind={kind}/>
}

export function MyTasksView({ currentUser }: { currentUser: CurrentUser }) {
  const [result, setResult] = useState<MyTasksResponse | null>(null)
  const [projectId, setProjectId] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    tasksApi.list({ projectId: projectId ? Number(projectId) : undefined, overdueOnly }, controller.signal)
      .then(response => { setResult(response); setError(null) })
      .catch(cause => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(messageOf(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [overdueOnly, projectId, refresh])

  const simpleWorkRoles: CurrentUser['role'][] = ['Administrator', 'Finance Officer', 'Foreman', 'Engineer', 'Supervisor', 'Storekeeper', 'Procurement Officer']
  const heading = currentUser.role === 'CEO' ? 'My decisions' : simpleWorkRoles.includes(currentUser.role) ? 'My work' : 'My tasks'
  return <div className="lav-view governance-view ceo-readable">
    <header className="lav-page-head"><div><span className="lav-kicker">{currentUser.role}</span><h1>{heading}</h1></div>{result && <span className={`lav-count-chip ${result.totalCount ? 'attention' : ''}`}>{result.totalCount} open</span>}</header>
    <div className="governance-toolbar"><label><span>Project</span><select value={projectId} onChange={event => setProjectId(event.currentTarget.value)}><option value="">All assigned projects</option>{currentUser.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="governance-check"><input type="checkbox" checked={overdueOnly} onChange={event => setOverdueOnly(event.currentTarget.checked)}/><span>Overdue only</span></label></div>
    {error && <Notice tone="error">{error} <button type="button" onClick={() => setRefresh(value => value + 1)}>Try again</button></Notice>}
    {loading ? (
      <Loading label="Loading tasks…"/>
    ) : result?.items.length ? (
      <section className="task-register" aria-label="Current tasks">
        {result.items.map(task => <Link className={task.isOverdue ? 'attention' : ''} to={safeTarget(task, currentUser.role)} key={task.taskKey}><span><strong>{task.title}</strong><small>{taskDetail(task)}</small><small>{task.projectName ?? 'Company-wide'} · due {dateTime(task.dueAt)}</small></span><b>{task.isOverdue ? 'Overdue' : currentUser.role === 'CEO' ? 'Needs your decision' : task.priority}</b><i aria-hidden="true">→</i></Link>)}
      </section>
    ) : (
      <Empty title={currentUser.role === 'CEO' ? 'No decisions waiting' : 'No work waiting'} detail={currentUser.role === 'Auditor' ? 'Auditor access is read-only.' : undefined}/>
    )}
  </div>
}

export function OpeningPositionsView({ currentUser }: { currentUser: CurrentUser }) {
  const [positions, setPositions] = useState<OpeningPosition[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [decision, setDecision] = useState<{ item: OpeningPosition; approve: boolean; stage: 'verify' | 'decide' } | null>(null)
  const [decisionNotes, setDecisionNotes] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const today = localInputDate(new Date())
  const [form, setForm] = useState({ projectId: '', materialId: '', quantity: '', unitCost: '', accountName: '', amount: '', asOfDate: today, evidenceReference: '', notes: '' })
  const positionType = currentUser.role === 'Storekeeper' ? 'Inventory' : 'Cash'
  const canCreate = currentUser.role === 'Storekeeper' || currentUser.role === 'Finance Officer'

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([openingPositionsApi.list(undefined, controller.signal), currentUser.role === 'Storekeeper' ? everyPage<Material>(page => materialsApi.list({ page, pageSize: 100 }, controller.signal)) : Promise.resolve(null)])
      .then(([response, materialResponse]) => { setPositions(response); setMaterials(materialResponse ?? []); setError(null) })
      .catch(cause => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(messageOf(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [currentUser.role, refresh])

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(null); setNotice(null)
    try { await action(); setNotice(message); setRefresh(value => value + 1); return true }
    catch (cause) { setError(messageOf(cause)); return false }
    finally { setBusy(false) }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const inventory = positionType === 'Inventory'
    const saved = await run(() => openingPositionsApi.create({ projectId: Number(form.projectId), positionType, asOfDate: form.asOfDate, evidenceReference: form.evidenceReference.trim() || null, notes: form.notes.trim() || null, inventoryLines: inventory ? [{ materialId: Number(form.materialId), quantity: Number(form.quantity), unitCost: form.unitCost ? Number(form.unitCost) : null }] : [], cashLines: inventory ? [] : [{ accountName: form.accountName.trim(), amount: Number(form.amount) }] }), inventory ? 'Opening stock sent to the Supervisor.' : 'Opening cash sent to the CEO.')
    if (saved) {
      setForm({ projectId: '', materialId: '', quantity: '', unitCost: '', accountName: '', amount: '', asOfDate: today, evidenceReference: '', notes: '' })
      setCreateOpen(false)
    }
  }

  async function saveDecision() {
    if (!decision || decisionNotes.trim().length < 3) return
    const work = decision.stage === 'verify' ? () => openingPositionsApi.verify(decision.item.id, decision.approve, decisionNotes.trim()) : () => openingPositionsApi.decide(decision.item.id, decision.approve, decisionNotes.trim())
    const saved = await run(work, decision.approve ? (decision.stage === 'verify' ? 'Opening stock verified.' : 'Opening position approved.') : 'Opening position rejected.')
    if (saved) { setDecision(null); setDecisionNotes('') }
  }

  return <div className="lav-view governance-view ceo-readable">
    <header className="lav-page-head"><div><h1>{positionType === 'Inventory' ? 'Opening stock' : 'Opening cash'}</h1></div>{canCreate ? <button type="button" className="lav-button secondary" onClick={() => setCreateOpen(value => !value)}>{createOpen ? 'Close form' : positionType === 'Inventory' ? 'Record opening stock' : 'Record opening cash'}</button> : <span className="lav-count-chip">{positions.length} records</span>}</header>
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {canCreate && createOpen && <form className="lav-panel governance-form" onSubmit={event => void create(event)}><h2>{positionType === 'Inventory' ? 'Record existing stock' : 'Record existing cash'}</h2><div className="governance-fields three"><label><span>Project</span><select required value={form.projectId} onChange={event => setForm({ ...form, projectId: event.currentTarget.value })}><option value="">Choose project</option>{currentUser.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>{positionType === 'Inventory' ? <><label><span>Material</span><select required value={form.materialId} onChange={event => setForm({ ...form, materialId: event.currentTarget.value })}><option value="">Choose material</option>{materials.map(material => <option key={material.id} value={material.id}>{material.name} ({material.unit})</option>)}</select></label><label><span>Quantity</span><input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.currentTarget.value })}/></label></> : <><label><span>Cash account</span><input required minLength={2} maxLength={100} value={form.accountName} onChange={event => setForm({ ...form, accountName: event.currentTarget.value })}/></label><label><span>Amount</span><input required type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.currentTarget.value })}/></label></>}</div><div className="governance-fields">{positionType === 'Inventory' && <label><span>Unit cost (optional)</span><input type="number" min="0" step="0.01" value={form.unitCost} onChange={event => setForm({ ...form, unitCost: event.currentTarget.value })}/></label>}<label><span>As at</span><input required type="date" max={today} value={form.asOfDate} onChange={event => setForm({ ...form, asOfDate: event.currentTarget.value })}/></label></div><EvidenceReferenceField label="Count sheet or statement reference" value={form.evidenceReference} onChange={value => setForm({ ...form, evidenceReference: value })}/><label><span>Notes (optional)</span><textarea rows={2} maxLength={1000} value={form.notes} onChange={event => setForm({ ...form, notes: event.currentTarget.value })}/></label><button className="lav-button primary" disabled={busy}>Send for approval</button></form>}
    {loading ? <Loading label="Loading opening positions…"/> : positions.length ? <section className="position-register">{positions.map(item => { const totalValue = item.inventoryLines.reduce((sum, line) => sum + (line.unitCost === null ? 0 : line.quantity * line.unitCost), 0); const title = item.positionType === 'Inventory' ? item.inventoryLines.map(line => line.materialName).join(', ') : item.cashLines.map(line => line.accountName).join(', '); const ownsRecord = item.submittedByName === currentUser.fullName && ((item.positionType === 'Inventory' && currentUser.role === 'Storekeeper') || (item.positionType === 'Cash' && currentUser.role === 'Finance Officer')); return <article className="lav-panel" key={item.id}><header><div><span>{item.projectName} · {item.positionType}</span><h2>{title}</h2><small>{item.batchNumber}</small></div><b className={`governance-status ${item.status.toLowerCase()}`}>{words(item.status)}</b></header><div className="position-lines">{item.inventoryLines.map(line => <div key={line.materialId}><strong>{number(line.quantity)} {line.unit}</strong><span>{line.unitCost === null ? 'No unit cost' : `${money(line.unitCost)} each`}</span></div>)}{item.cashLines.map(line => <div key={line.accountName}><strong>{money(line.amount)}</strong><span>{line.accountName}</span></div>)}</div><dl><div><dt>As at</dt><dd>{date(item.asOfDate)}</dd></div><div><dt>Submitted by</dt><dd>{item.submittedByName}</dd></div><div><dt>Verified by</dt><dd>{item.verifiedByName ?? (item.positionType === 'Cash' ? 'Not required' : 'Waiting')}</dd></div><div><dt>Value</dt><dd>{item.positionType === 'Cash' ? money(item.cashLines.reduce((sum, line) => sum + line.amount, 0)) : totalValue ? money(totalValue) : 'Not valued'}</dd></div></dl><RecordEvidence sourceType="OpeningPositionBatch" sourceId={item.id} canUpload={ownsRecord}/>{item.decisionNotes && <p className="record-reference">Decision: {item.decisionNotes}</p>}<footer>{currentUser.role === 'Supervisor' && item.status === 'AwaitingVerification' ? <><button className="lav-button secondary" onClick={() => setDecision({ item, approve: false, stage: 'verify' })}>Reject</button><button className="lav-button primary" onClick={() => setDecision({ item, approve: true, stage: 'verify' })}>Verify</button></> : currentUser.role === 'CEO' && item.status === 'AwaitingApproval' ? <><button className="lav-button secondary" onClick={() => setDecision({ item, approve: false, stage: 'decide' })}>Reject</button><button className="lav-button primary" onClick={() => setDecision({ item, approve: true, stage: 'decide' })}>Approve</button></> : <span>{item.decidedByName ? `Decided by ${item.decidedByName}` : item.status === 'AwaitingVerification' ? 'Awaiting Supervisor verification' : 'Awaiting CEO decision'}</span>}</footer></article> })}</section> : <Empty title="No opening position recorded"/>}
    {decision && <div className="governance-dialog-wrap"><button className="governance-dialog-backdrop" aria-label="Close decision" onClick={() => setDecision(null)}/><section className="lav-panel governance-dialog" role="dialog" aria-modal="true" aria-labelledby="opening-decision-title"><header><h2 id="opening-decision-title">{decision.approve ? (decision.stage === 'verify' ? 'Verify opening stock' : 'Approve opening position') : 'Reject opening position'}</h2><button aria-label="Close" onClick={() => setDecision(null)}>×</button></header><p>{decision.item.projectName} · {decision.item.positionType}</p><label><span>Decision notes</span><textarea autoFocus required minLength={3} rows={3} value={decisionNotes} onChange={event => setDecisionNotes(event.currentTarget.value)}/></label><footer><button className="lav-button secondary" onClick={() => setDecision(null)}>Cancel</button><button className="lav-button primary" disabled={busy || decisionNotes.trim().length < 3} onClick={() => void saveDecision()}>Confirm</button></footer></section></div>}
  </div>
}

type CustodyAction =
  | { kind: 'usage'; issue: MaterialIssue }
  | { kind: 'return'; issue: MaterialIssue }
  | { kind: 'closeout'; issue: MaterialIssue }
  | { kind: 'resolve-dispute'; issue: MaterialIssue }
  | { kind: 'receive-return'; item: MaterialReturn; accept: boolean }
  | { kind: 'review-closeout'; item: CustodyCloseout; approve: boolean }

function custodyActionTitle(action: CustodyAction) {
  switch (action.kind) {
    case 'usage': return 'Record material use'
    case 'return': return 'Return material to Stores'
    case 'closeout': return 'Submit custody close-out'
    case 'resolve-dispute': return 'Resolve handover difference'
    case 'receive-return': return action.accept ? 'Receive returned material' : 'Reject material return'
    case 'review-closeout': return action.approve ? 'Approve close-out' : 'Return close-out'
  }
}

export function CustodyCloseoutView({ currentUser }: { currentUser: CurrentUser }) {
  const [issues, setIssues] = useState<MaterialIssue[]>([])
  const [returns, setReturns] = useState<MaterialReturn[]>([])
  const [closeouts, setCloseouts] = useState<CustodyCloseout[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const submitBusyRef = useRef(false)
  const [action, setAction] = useState<CustodyAction | null>(null)
  const [latestResolution, setLatestResolution] = useState<MaterialIssueDisputeResolution | null>(null)
  const [form, setForm] = useState({ usageType: 'Used' as 'Used' | 'Wastage', quantity: '', condition: 'Good', notes: '', evidenceReference: '', idempotencyKey: '' })

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([everyPage<MaterialIssue>(page => inventoryApi.issues(controller.signal, { page, pageSize: 100 })), custodyControlsApi.returns(undefined, controller.signal), custodyControlsApi.closeouts(undefined, controller.signal)])
      .then(([issueResponse, returnResponse, closeoutResponse]) => { setIssues(issueResponse); setReturns(returnResponse); setCloseouts(closeoutResponse); setError(null) })
      .catch(cause => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(messageOf(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])

  async function run(work: () => Promise<unknown>, text: string) {
    if (submitBusyRef.current) return
    submitBusyRef.current = true
    setBusy(true); setError(null); setNotice(null)
    try { await work(); setNotice(text); setAction(null); setRefresh(value => value + 1) }
    catch (cause) { setError(messageOf(cause)) }
    finally { submitBusyRef.current = false; setBusy(false) }
  }

  function issueRemaining(issue: MaterialIssue) {
    const reserved = returns.filter(item => item.materialIssueId === issue.id && item.status === 'AwaitingReceipt').reduce((sum, item) => sum + item.quantityOffered, 0)
    return Math.max(0, issue.unaccountedQuantity - reserved)
  }

  function open(next: CustodyAction) {
    const quantity = 'issue' in next ? String(issueRemaining(next.issue)) : next.kind === 'receive-return' ? String(next.item.quantityOffered) : ''
    setAction(next); setForm({ usageType: 'Used', quantity, condition: 'Good', notes: '', evidenceReference: '', idempotencyKey: crypto.randomUUID() })
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!action || submitBusyRef.current) return
    const selectedAction = action
    if (selectedAction.kind === 'usage') return run(() => inventoryApi.recordUsage(selectedAction.issue.id, { usageType: form.usageType, quantity: Number(form.quantity), purposeOrReason: form.notes.trim(), evidenceReference: form.evidenceReference.trim() || null, idempotencyKey: form.idempotencyKey }), 'Material use saved.')
    if (selectedAction.kind === 'return') return run(() => custodyControlsApi.createReturn({ materialIssueId: selectedAction.issue.id, quantity: Number(form.quantity), condition: form.condition, notes: form.notes.trim() || null, evidenceReference: form.evidenceReference.trim() || null }), 'Return sent to Stores.')
    if (selectedAction.kind === 'closeout') return run(() => custodyControlsApi.submitCloseout({ materialIssueId: selectedAction.issue.id, notes: form.notes.trim() || null, evidenceReference: form.evidenceReference.trim() || null }), 'Close-out sent to the Supervisor.')
    if (selectedAction.kind === 'resolve-dispute') {
      submitBusyRef.current = true
      setBusy(true); setError(null); setNotice(null)
      try {
        const resolution = await custodyControlsApi.resolveDispute(selectedAction.issue.id, form.notes.trim(), form.evidenceReference.trim() || null)
        setLatestResolution(resolution)
        setNotice('Handover difference resolved.')
        setAction(null)
        setRefresh(value => value + 1)
      } catch (cause) { setError(messageOf(cause)) }
      finally { submitBusyRef.current = false; setBusy(false) }
      return
    }
    if (selectedAction.kind === 'receive-return') return run(() => custodyControlsApi.receiveReturn(selectedAction.item.id, { accept: selectedAction.accept, quantityAccepted: selectedAction.accept ? selectedAction.item.quantityOffered : 0, notes: form.notes.trim(), evidenceReference: form.evidenceReference.trim() || null }), selectedAction.accept ? 'Returned material received.' : 'Return rejected.')
    return run(() => custodyControlsApi.reviewCloseout(selectedAction.item.id, selectedAction.approve, form.notes.trim()), selectedAction.approve ? 'Custody close-out approved.' : 'Custody close-out returned.')
  }

  const visibleIssues = issues.filter(item => currentUser.role !== 'Foreman' || item.issuedToUserId === currentUser.id)
  const usageRecords = visibleIssues.flatMap(issue => issue.usage.map(usage => ({ issue, usage })))
  return <div className="lav-view governance-view ceo-readable">
    <header className="lav-page-head"><div><span className="lav-kicker">Material custody</span><h1>Custody close-out</h1></div><span className="lav-count-chip">{closeouts.filter(item => item.status === 'AwaitingReview').length} reviews</span></header>
    {error && !action && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {latestResolution && <section className="lav-panel governance-evidence-result"><div><strong>{latestResolution.materialName}</strong><span>{number(latestResolution.returnedToStoreQuantity)} {latestResolution.unit} returned to store · resolved by {latestResolution.resolvedByName}</span></div><RecordEvidence sourceType="MaterialIssueDisputeResolution" sourceId={latestResolution.id} kind="Photo" canUpload={currentUser.role === 'Supervisor' && latestResolution.resolvedByName === currentUser.fullName}/></section>}
    {(usageRecords.length > 0 || returns.length > 0 || closeouts.length > 0) && <details className="record-evidence-register"><summary>Evidence files</summary><div>{usageRecords.map(({ issue, usage }) => <article key={`usage-${usage.id}`}><strong>{usage.usageType}: {number(usage.quantity)} {issue.materialUnit} · {issue.materialName}</strong><RecordEvidence sourceType="MaterialUsageRecord" sourceId={usage.id} kind="Photo" canUpload={currentUser.role === 'Foreman' && usage.recordedByName === currentUser.fullName}/></article>)}{returns.map(item => <article key={`return-${item.id}`}><strong>{item.materialName} · {item.returnNumber}</strong><RecordEvidence sourceType="MaterialReturn" sourceId={item.id} canUpload={currentUser.role === 'Foreman' && item.returnedByName === currentUser.fullName}/>{item.receivedByName && <RecordEvidence sourceType="MaterialReturnReceipt" sourceId={item.id} canUpload={currentUser.role === 'Storekeeper' && item.receivedByName === currentUser.fullName}/>}</article>)}{closeouts.map(item => <article key={`closeout-${item.id}`}><strong>{item.materialName} · {item.closeoutNumber}</strong><RecordEvidence sourceType="MaterialCustodyCloseout" sourceId={item.id} canUpload={currentUser.role === 'Foreman' && item.submittedByName === currentUser.fullName}/></article>)}</div></details>}
    {loading ? <Loading label="Loading custody records…"/> : <><section className="custody-close-register"><header><h2>Material issues</h2><span>{visibleIssues.length}</span></header>{visibleIssues.length ? visibleIssues.map(issue => { const remaining = issueRemaining(issue); const pendingReturn = returns.some(item => item.materialIssueId === issue.id && item.status === 'AwaitingReceipt'); const activeCloseout = closeouts.some(item => item.materialIssueId === issue.id && item.status !== 'Returned'); const difference = issue.quantityIssued - (issue.confirmedQuantity ?? issue.quantityIssued); return <article key={issue.id}><div><span>{issue.projectName}</span><strong>{issue.materialName}</strong><small>{issue.issuedToName} · {dateTime(issue.issuedAt)}</small></div><dl><div><dt>Issued</dt><dd>{number(issue.quantityIssued)}</dd></div><div><dt>Received</dt><dd>{issue.confirmedQuantity === null ? 'Waiting' : number(issue.confirmedQuantity)}</dd></div><div><dt>Difference</dt><dd>{number(difference)}</dd></div><div><dt>With team</dt><dd>{number(remaining)} {issue.materialUnit}</dd></div></dl><div className="custody-close-action">{currentUser.role === 'Supervisor' && issue.status === 'Disputed' ? <button className="lav-button primary" onClick={() => open({ kind: 'resolve-dispute', issue })}>Resolve difference</button> : currentUser.role === 'Foreman' && issue.status === 'Confirmed' ? <>{remaining > 0 && <button className="lav-button secondary" onClick={() => open({ kind: 'return', issue })}>Return</button>}{remaining === 0 && !pendingReturn && !activeCloseout && <button className="lav-button primary" onClick={() => open({ kind: 'closeout', issue })}>Submit close-out</button>}</> : <span>{issue.status === 'AwaitingConfirmation' ? `Awaiting ${issue.issuedToName}` : issue.status === 'Disputed' ? `Difference: ${number(difference)} ${issue.materialUnit}` : `Issued to ${issue.issuedToName}`}</span>}</div></article> }) : <Empty title="No material issue recorded"/>}</section><section className="position-register"><header className="section-register-title"><h2>Returns to Stores</h2><span>{returns.length}</span></header>{returns.map(item => <article className="lav-panel" key={item.id}><header><div><span>{item.projectName}</span><h2>{item.materialName}</h2><small>{item.returnNumber}</small></div><b className={`governance-status ${item.status.toLowerCase()}`}>{words(item.status)}</b></header><dl><div><dt>Offered</dt><dd>{number(item.quantityOffered)} {item.unit}</dd></div><div><dt>Condition</dt><dd>{item.condition}</dd></div><div><dt>Returned by</dt><dd>{item.returnedByName}</dd></div><div><dt>Received by</dt><dd>{item.receivedByName ?? 'Waiting'}</dd></div></dl>{currentUser.role === 'Storekeeper' && item.status === 'AwaitingReceipt' && <footer><button className="lav-button secondary" onClick={() => open({ kind: 'receive-return', item, accept: false })}>Reject</button><button className="lav-button primary" onClick={() => open({ kind: 'receive-return', item, accept: true })}>Receive</button></footer>}</article>)}</section><section className="position-register"><header className="section-register-title"><h2>Close-outs</h2><span>{closeouts.length}</span></header>{closeouts.map(item => <article className="lav-panel" key={item.id}><header><div><span>{item.projectName}</span><h2>{item.materialName}</h2><small>{item.closeoutNumber} · revision {item.revision}</small></div><b className={`governance-status ${item.status.toLowerCase()}`}>{words(item.status)}</b></header><dl><div><dt>Confirmed</dt><dd>{number(item.confirmedQuantity)}</dd></div><div><dt>Used</dt><dd>{number(item.usedQuantity)}</dd></div><div><dt>Wasted</dt><dd>{number(item.wastedQuantity)}</dd></div><div><dt>Returned</dt><dd>{number(item.returnedQuantity)} {item.unit}</dd></div></dl>{currentUser.role === 'Supervisor' && item.status === 'AwaitingReview' && <footer><button className="lav-button secondary" onClick={() => open({ kind: 'review-closeout', item, approve: false })}>Return</button><button className="lav-button primary" onClick={() => open({ kind: 'review-closeout', item, approve: true })}>Approve</button></footer>}</article>)}</section></>}
    {action && <div className="governance-dialog-wrap"><button className="governance-dialog-backdrop" aria-label="Close form" onClick={() => setAction(null)}/><form className="lav-panel governance-dialog" role="dialog" aria-modal="true" aria-labelledby="custody-action-title" onSubmit={event => void submitAction(event)}><header><h2 id="custody-action-title">{custodyActionTitle(action)}</h2><button type="button" aria-label="Close" onClick={() => setAction(null)}>×</button></header>{error && <Notice tone="error">{error}</Notice>}{action.kind === 'usage' && <label><span>Record type</span><select value={form.usageType} onChange={event => setForm({ ...form, usageType: event.currentTarget.value as 'Used' | 'Wastage' })}><option value="Used">Used</option><option value="Wastage">Wasted or damaged</option></select></label>}{(action.kind === 'usage' || action.kind === 'return') && <label><span>Quantity</span><input required type="number" min="0.001" step="0.001" value={form.quantity} onChange={event => setForm({ ...form, quantity: event.currentTarget.value })}/></label>}{action.kind === 'return' && <label><span>Condition</span><select value={form.condition} onChange={event => setForm({ ...form, condition: event.currentTarget.value })}><option>Good</option><option>Damaged</option><option>Mixed</option></select></label>}<label><span>{action.kind === 'usage' ? (form.usageType === 'Used' ? 'Work area or purpose' : 'Reason') : 'Notes'}</span><textarea required={action.kind === 'usage' || action.kind === 'receive-return' || action.kind === 'review-closeout' || action.kind === 'resolve-dispute'} minLength={3} rows={3} value={form.notes} onChange={event => setForm({ ...form, notes: event.currentTarget.value })}/></label>{action.kind !== 'review-closeout' && <EvidenceReferenceField label="Evidence reference" value={form.evidenceReference} onChange={value => setForm({ ...form, evidenceReference: value })}/>}<footer><button type="button" className="lav-button secondary" onClick={() => setAction(null)}>Cancel</button><button className="lav-button primary" disabled={busy || ((action.kind === 'receive-return' || action.kind === 'review-closeout' || action.kind === 'resolve-dispute') && form.notes.trim().length < 3)}>Confirm</button></footer></form></div>}
  </div>
}

type PeriodAction = { kind: 'submit' | 'decision' | 'correction-decision'; item: OperationalPeriod | ControlledCorrection; approve?: boolean }

export function PeriodClosingView({ currentUser }: { currentUser: CurrentUser }) {
  const now = new Date()
  const today = localInputDate(now)
  const monthStart = `${today.slice(0, 8)}01`
  const [periods, setPeriods] = useState<OperationalPeriod[]>([])
  const [corrections, setCorrections] = useState<ControlledCorrection[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [periodsLoading, setPeriodsLoading] = useState(true)
  const [correctionsLoading, setCorrectionsLoading] = useState(true)
  const [periodsLoadError, setPeriodsLoadError] = useState<string | null>(null)
  const [correctionsLoadError, setCorrectionsLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [form, setForm] = useState({ projectId: '', name: '', startDate: monthStart, endDate: today })
  const [action, setAction] = useState<PeriodAction | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [correctionPeriodId, setCorrectionPeriodId] = useState<number | null>(null)
  const [correction, setCorrection] = useState({ materialId: '', accountName: '', delta: '', reason: '', evidenceReference: '' })
  const [createOpen, setCreateOpen] = useState(false)
  const scope: OperationalPeriodScope = currentUser.role === 'Supervisor' || currentUser.role === 'Storekeeper' ? 'Inventory' : 'Finance'
  const canCreatePeriod = currentUser.role === 'Supervisor' || currentUser.role === 'Finance Officer'
  const canCreateCorrection = currentUser.role === 'Storekeeper' || currentUser.role === 'Finance Officer'

  useEffect(() => {
    const controller = new AbortController()

    void accountingPeriodsApi.list(undefined, controller.signal)
      .then(periodResponse => { setPeriods(periodResponse); setPeriodsLoadError(null) })
      .catch(cause => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) setPeriodsLoadError(messageOf(cause))
      })
      .finally(() => { if (!controller.signal.aborted) setPeriodsLoading(false) })

    void accountingPeriodsApi.corrections(undefined, controller.signal)
      .then(correctionResponse => { setCorrections(correctionResponse); setCorrectionsLoadError(null) })
      .catch(cause => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) setCorrectionsLoadError(messageOf(cause))
      })
      .finally(() => { if (!controller.signal.aborted) setCorrectionsLoading(false) })

    if (currentUser.role === 'Storekeeper') {
      void everyPage<Material>(page => materialsApi.list({ page, pageSize: 100 }, controller.signal))
        .then(materialResponse => { setMaterials(materialResponse); setError(null) })
        .catch(cause => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(messageOf(cause)) })
    }
    return () => controller.abort()
  }, [currentUser.role, refresh])

  async function run(work: () => Promise<unknown>, text: string) {
    setBusy(true); setError(null); setNotice(null)
    try { await work(); setNotice(text); setRefresh(value => value + 1); return true }
    catch (cause) { setError(messageOf(cause)); return false }
    finally { setBusy(false) }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const saved = await run(() => accountingPeriodsApi.create({ projectId: Number(form.projectId), scope, name: form.name.trim(), startDate: form.startDate, endDate: form.endDate }), `${scope} period opened.`)
    if (saved) {
      setForm({ projectId: '', name: '', startDate: monthStart, endDate: today })
      setCreateOpen(false)
    }
  }

  async function act() {
    if (!action || actionNotes.trim().length < 3) return
    const selectedAction = action
    const saved = selectedAction.kind === 'submit'
      ? await run(() => accountingPeriodsApi.submitClose((selectedAction.item as OperationalPeriod).id, actionNotes.trim()), 'Period sent to the CEO.')
      : selectedAction.kind === 'decision'
        ? await run(() => accountingPeriodsApi.decide(selectedAction.item.id, Boolean(selectedAction.approve), actionNotes.trim()), selectedAction.approve ? 'Period closed.' : 'Period returned.')
        : await run(() => accountingPeriodsApi.decideCorrection(selectedAction.item.id, Boolean(selectedAction.approve), actionNotes.trim()), selectedAction.approve ? 'Correction approved.' : 'Correction rejected.')
    if (saved) { setAction(null); setActionNotes('') }
  }

  async function createCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (correctionPeriodId === null) return
    const inventory = scope === 'Inventory'
    const saved = await run(() => accountingPeriodsApi.createCorrection({ operationalPeriodId: correctionPeriodId, correctionType: scope, materialId: inventory ? Number(correction.materialId) : null, cashAccountName: inventory ? null : correction.accountName.trim(), quantityDelta: inventory ? Number(correction.delta) : 0, amountDelta: inventory ? 0 : Number(correction.delta), reason: correction.reason.trim(), evidenceReference: correction.evidenceReference.trim() || null }), 'Correction sent to the CEO.')
    if (saved) { setCorrectionPeriodId(null); setCorrection({ materialId: '', accountName: '', delta: '', reason: '', evidenceReference: '' }) }
  }

  return <div className="lav-view governance-view ceo-readable">
    <header className="lav-page-head"><div><h1>Period closing and corrections</h1></div>{canCreatePeriod ? <button type="button" className="lav-button secondary" onClick={() => setCreateOpen(value => !value)}>{createOpen ? 'Close form' : 'Open period'}</button> : <span className="lav-count-chip">{periods.filter(item => item.status !== 'Closed').length} open</span>}</header>
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {corrections.length > 0 && <details className="record-evidence-register"><summary>Correction evidence</summary><div>{corrections.map(item => <article key={item.id}><strong>{item.correctionNumber} · {item.materialName ?? item.cashAccountName}</strong><RecordEvidence sourceType="ControlledCorrection" sourceId={item.id} canUpload={item.submittedByName === currentUser.fullName && ((item.correctionType === 'Inventory' && currentUser.role === 'Storekeeper') || (item.correctionType === 'Finance' && currentUser.role === 'Finance Officer'))}/></article>)}</div></details>}
    {canCreatePeriod && createOpen && <form className="lav-panel governance-form compact" onSubmit={event => void create(event)}><h2>Open {scope.toLowerCase()} period</h2><div className="governance-fields three"><label><span>Project</span><select required value={form.projectId} onChange={event => setForm({ ...form, projectId: event.currentTarget.value })}><option value="">Choose project</option>{currentUser.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label><span>Period name</span><input required minLength={2} maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.currentTarget.value })}/></label><label><span>Scope</span><input disabled value={scope}/></label><label><span>From</span><input required type="date" max={form.endDate} value={form.startDate} onChange={event => setForm({ ...form, startDate: event.currentTarget.value })}/></label><label><span>To</span><input required type="date" min={form.startDate} value={form.endDate} onChange={event => setForm({ ...form, endDate: event.currentTarget.value })}/></label></div><button className="lav-button primary" disabled={busy}>Open period</button></form>}
    {periodsLoadError && <Notice tone="error">Periods could not be loaded: {periodsLoadError}</Notice>}
    {periodsLoading ? <Loading label="Loading periods…"/> : periods.length ? <section className="period-register">{periods.map(period => { const periodCorrections = corrections.filter(item => item.operationalPeriodId === period.id); const ownsScope = (currentUser.role === 'Supervisor' && period.scope === 'Inventory') || (currentUser.role === 'Finance Officer' && period.scope === 'Finance'); return <article className="lav-panel" key={period.id}><header><div><span>{period.projectName} · {period.scope}</span><h2>{period.name}</h2><small>{date(period.startDate)} to {date(period.endDate)} · {period.periodNumber}</small></div><b className={`governance-status ${period.status.toLowerCase()}`}>{words(period.status)}</b></header><div className="period-facts"><span>Created by<strong>{period.createdByName}</strong></span><span>Latest event<strong>{period.latestEventType ? words(period.latestEventType) : 'Opened'}</strong></span><span>Corrections<strong>{correctionsLoading || correctionsLoadError ? 'Unavailable' : periodCorrections.length}</strong></span></div><footer>{ownsScope && (period.status === 'Open' || period.status === 'Returned') && <button className="lav-button primary" onClick={() => { setAction({ kind: 'submit', item: period }); setActionNotes('') }}>Submit close</button>}{currentUser.role === 'CEO' && period.status === 'AwaitingClose' && <><button className="lav-button secondary" onClick={() => { setAction({ kind: 'decision', item: period, approve: false }); setActionNotes('') }}>Return</button><button className="lav-button primary" onClick={() => { setAction({ kind: 'decision', item: period, approve: true }); setActionNotes('') }}>Close period</button></>}{canCreateCorrection && period.scope === scope && period.status === 'Closed' && <button className="lav-button secondary" onClick={() => setCorrectionPeriodId(period.id)}>Request correction</button>}</footer></article> })}</section> : periodsLoadError ? null : <Empty title="No period recorded"/>}
    <section className="position-register"><header className="section-register-title"><h2>Corrections</h2><span>{correctionsLoading || correctionsLoadError ? 'Unavailable' : corrections.length}</span></header>{correctionsLoadError && <Notice tone="error">Corrections could not be loaded: {correctionsLoadError}</Notice>}{correctionsLoading ? <Loading label="Loading corrections…"/> : corrections.map(item => <article className="lav-panel" key={item.id}><header><div><span>{item.projectName} · {item.periodName}</span><h2>{item.materialName ?? item.cashAccountName ?? item.correctionType}</h2><small>{item.correctionNumber}</small></div><b className={`governance-status ${item.status.toLowerCase()}`}>{words(item.status)}</b></header><dl><div><dt>Change</dt><dd>{item.correctionType === 'Finance' ? money(item.amountDelta) : `${number(item.quantityDelta)} ${item.unit ?? ''}`}</dd></div><div><dt>Submitted by</dt><dd>{item.submittedByName}</dd></div><div><dt>Reason</dt><dd>{item.reason}</dd></div><div><dt>Decision</dt><dd>{item.decidedByName ?? 'Waiting'}</dd></div></dl>{currentUser.role === 'CEO' && item.status === 'AwaitingApproval' && <footer><button className="lav-button secondary" onClick={() => { setAction({ kind: 'correction-decision', item, approve: false }); setActionNotes('') }}>Reject</button><button className="lav-button primary" onClick={() => { setAction({ kind: 'correction-decision', item, approve: true }); setActionNotes('') }}>Approve</button></footer>}</article>)}</section>
    {action && <div className="governance-dialog-wrap"><button className="governance-dialog-backdrop" aria-label="Close action" onClick={() => setAction(null)}/><section className="lav-panel governance-dialog" role="dialog" aria-modal="true" aria-labelledby="period-action-title"><header><h2 id="period-action-title">{action.kind === 'submit' ? 'Submit period close' : action.kind === 'correction-decision' ? `${action.approve ? 'Approve' : 'Reject'} correction` : `${action.approve ? 'Close' : 'Return'} period`}</h2><button aria-label="Close" onClick={() => setAction(null)}>×</button></header><label><span>Notes</span><textarea autoFocus required minLength={3} rows={3} value={actionNotes} onChange={event => setActionNotes(event.currentTarget.value)}/></label><footer><button className="lav-button secondary" onClick={() => setAction(null)}>Cancel</button><button className="lav-button primary" disabled={busy || actionNotes.trim().length < 3} onClick={() => void act()}>Confirm</button></footer></section></div>}
    {correctionPeriodId !== null && <div className="governance-dialog-wrap"><button className="governance-dialog-backdrop" aria-label="Close correction form" onClick={() => setCorrectionPeriodId(null)}/><form className="lav-panel governance-dialog" role="dialog" aria-modal="true" aria-labelledby="correction-title" onSubmit={event => void createCorrection(event)}><header><h2 id="correction-title">Request {scope.toLowerCase()} correction</h2><button type="button" aria-label="Close" onClick={() => setCorrectionPeriodId(null)}>×</button></header>{scope === 'Inventory' ? <label><span>Material</span><select required value={correction.materialId} onChange={event => setCorrection({ ...correction, materialId: event.currentTarget.value })}><option value="">Choose material</option>{materials.map(material => <option key={material.id} value={material.id}>{material.name} ({material.unit})</option>)}</select></label> : <label><span>Cash account name</span><input required minLength={2} maxLength={100} value={correction.accountName} onChange={event => setCorrection({ ...correction, accountName: event.currentTarget.value })}/></label>}<label><span>{scope === 'Inventory' ? 'Quantity change' : 'Amount change'}</span><input required type="number" step={scope === 'Inventory' ? '0.001' : '0.01'} value={correction.delta} onChange={event => setCorrection({ ...correction, delta: event.currentTarget.value })}/></label><label><span>Reason</span><textarea required minLength={3} rows={3} value={correction.reason} onChange={event => setCorrection({ ...correction, reason: event.currentTarget.value })}/></label><EvidenceReferenceField label="Evidence reference" value={correction.evidenceReference} onChange={value => setCorrection({ ...correction, evidenceReference: value })}/><footer><button type="button" className="lav-button secondary" onClick={() => setCorrectionPeriodId(null)}>Cancel</button><button className="lav-button primary" disabled={busy}>Submit</button></footer></form></div>}
  </div>
}
