import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  ApiError,
  type CashAccount,
  type CashBook,
  cashAccountsApi,
  custodyControlsApi,
  financeApi,
  inventoryApi,
  materialsApi,
  pettyCashApi,
  projectsApi,
  purchaseOrdersApi,
  requisitionsApi,
  type ControlEvent,
  type CurrentUser,
  type GoodsReceipt,
  type Material,
  type MaterialIssue,
  type MaterialReturn,
  type Payment,
  type PaymentAuthorization,
  type PettyCashRequest,
  type ProjectSummary,
  type PurchaseOrder,
  type Requisition,
  type StockBalance,
  type StockCount,
  type StockLedgerEntry,
  type StockTransfer,
  type SupplierInvoice,
  type TechnicalAcceptanceOutcome,
  type TechnicalAcceptanceWorkItem,
} from './api'
import './live-api.css'
import './live-operations.css'
import { CeoMaterialsInventory } from './CeoMaterialsInventory'
import { EvidenceFiles } from './EvidenceReferenceField'

function messageOf(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : 'The action could not be completed.'
}

function money(value: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(value)
}

function when(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Not recorded'
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

function committedReceiptQuantity(order: PurchaseOrder, receipts: GoodsReceipt[]) {
  const requiresEngineer = order.lines[0]?.requiresTechnicalAcceptance ?? false
  return receipts
    .filter(receipt => receipt.purchaseOrderId === order.id)
    .filter(receipt => !requiresEngineer || receipt.technicalAcceptanceStatus !== 'Rejected')
    .reduce((total, receipt) => total + receipt.acceptedQuantity, 0)
}

function invoiceEligibleQuantity(order: PurchaseOrder, receipts: GoodsReceipt[]) {
  return receipts
    .filter(receipt => receipt.purchaseOrderId === order.id)
    .filter(receipt => receipt.technicalAcceptanceStatus !== 'Rejected')
    .reduce((total, receipt) => total + receipt.acceptedQuantity, 0)
}

function Notice({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'error' | 'success' }) {
  return <div className={`lav-notice ${tone}`}>{children}</div>
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="ops-empty"><strong>Nothing waiting</strong><span>{children}</span></div>
}

function Loading({ children }: { children: ReactNode }) {
  return <div className="lav-loading" role="status" aria-live="polite"><span/><p>{children}</p></div>
}

export function LiveInventoryView({ currentUser }: { currentUser: CurrentUser }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [balances, setBalances] = useState<StockBalance[]>([])
  const [ledger, setLedger] = useState<StockLedgerEntry[]>([])
  const [issues, setIssues] = useState<MaterialIssue[]>([])
  const [transfers, setTransfers] = useState<StockTransfer[]>([])
  const [counts, setCounts] = useState<StockCount[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [requisitions, setRequisitions] = useState<Requisition[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([])
  const [returns, setReturns] = useState<MaterialReturn[]>([])
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const role = currentUser.role
  const sectionedRole = role === 'Storekeeper' || role === 'Supervisor' || role === 'Auditor'
  const requestedSection = searchParams.get('section')
  const inventorySection = role === 'Auditor'
    ? requestedSection === 'movements' || requestedSection === 'evidence' ? requestedSection : 'stock'
    : requestedSection === 'stock' || requestedSection === 'movements' ? requestedSection : 'work'

  useEffect(() => {
    const controller = new AbortController()

    if (role === 'Foreman') {
      void everyPage<MaterialIssue>(page => inventoryApi.issues(controller.signal, { page, pageSize: 100 }))
        .then(items => { setIssues(items); setBalances([]); setLedger([]); setTransfers([]); setCounts([]); setReceipts([]); setReturns([]); setReady(true); setError(null) })
        .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setError(messageOf(error)) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
      return () => controller.abort()
    }

    if (role === 'Finance Officer') {
      void everyPage<GoodsReceipt>(page => inventoryApi.receipts(controller.signal, { page, pageSize: 100 }))
        .then(items => { setReceipts(items); setBalances([]); setLedger([]); setIssues([]); setTransfers([]); setCounts([]); setReturns([]); setReady(true); setError(null) })
        .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setError(messageOf(error)) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
      return () => controller.abort()
    }

    const tasks: Promise<void>[] = [
      everyPage<StockBalance>(page => inventoryApi.balances(controller.signal, { page, pageSize: 100 })).then(setBalances),
      everyPage<MaterialIssue>(page => inventoryApi.issues(controller.signal, { page, pageSize: 100 })).then(setIssues),
    ]
    if (['Storekeeper', 'Supervisor', 'CEO', 'Auditor'].includes(role)) {
      tasks.push(
        everyPage<StockTransfer>(page => inventoryApi.transfers(controller.signal, { page, pageSize: 100 })).then(setTransfers),
        everyPage<StockCount>(page => inventoryApi.counts(controller.signal, { page, pageSize: 100 })).then(setCounts),
      )
    }
    if (['Storekeeper', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor'].includes(role)) {
      tasks.push(everyPage<StockLedgerEntry>(page => inventoryApi.ledger(controller.signal, { page, pageSize: 100 })).then(setLedger))
    }
    if (['Storekeeper', 'Finance Officer', 'CEO', 'Auditor'].includes(role)) {
      tasks.push(everyPage<GoodsReceipt>(page => inventoryApi.receipts(controller.signal, { page, pageSize: 100 })).then(setReceipts))
    }
    if (role === 'CEO') {
      tasks.push(custodyControlsApi.returns(undefined, controller.signal).then(setReturns))
    }
    if (role === 'Storekeeper') {
      tasks.push(everyPage<PurchaseOrder>(page => purchaseOrdersApi.list({ page, pageSize: 100, status: 'Issued' }, controller.signal)).then(setOrders))
      tasks.push(everyPage<Requisition>(page => requisitionsApi.list({ page, pageSize: 100, status: 'Approved' }, controller.signal)).then(setRequisitions))
      tasks.push(everyPage<Material>(page => materialsApi.list({ page, pageSize: 100 }, controller.signal)).then(setMaterials))
      tasks.push(Promise.allSettled(currentUser.projects.map(project => projectsApi.getSummary(project.id, controller.signal))).then(results => {
        const loaded = results.filter((result): result is PromiseFulfilledResult<ProjectSummary> => result.status === 'fulfilled').map(result => result.value)
        setProjectSummaries(loaded)
        const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
        if (failed) throw failed.reason
      }))
    }
    if (role === 'Supervisor') tasks.push(everyPage<Material>(page => materialsApi.list({ page, pageSize: 100 }, controller.signal)).then(setMaterials))

    Promise.allSettled(tasks).then(results => {
      if (controller.signal.aborted) return
      if (results[0]?.status === 'fulfilled' && results[1]?.status === 'fulfilled') setReady(true)
      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected' && !(result.reason instanceof DOMException && result.reason.name === 'AbortError'))
      setError(failed ? messageOf(failed.reason) : null)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [currentUser.projects, refresh, role])

  const changed = (text: string) => { setNotice(text); setRefresh(value => value + 1) }

  if (loading) return <Loading>Loading stock records…</Loading>
  if (!ready) return <div className="lav-view ops-view">{error && <Notice tone="error">{error}</Notice>}</div>
  const pageHeading = role === 'Foreman'
    ? currentUser.canSwitchRoles ? 'Foreman material handovers' : 'Materials with me'
    : role === 'Storekeeper'
      ? inventorySection === 'stock' ? 'Current stock' : inventorySection === 'movements' ? 'Store movements' : 'Store operations'
      : role === 'Supervisor'
        ? inventorySection === 'stock' ? 'Current stock' : inventorySection === 'movements' ? 'Material movements' : 'Stock controls'
        : role === 'Finance Officer'
          ? 'Delivery records'
          : role === 'Auditor'
            ? inventorySection === 'stock' ? 'Current stock' : inventorySection === 'movements' ? 'Material movements' : 'Material evidence'
            : null
  return <div className="lav-view ops-view">
    {pageHeading && <header className="lav-page-head"><div><h1>{pageHeading}</h1></div></header>}
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {role === 'Auditor' && <nav className="ops-action-nav auditor-inventory-nav" aria-label="Auditor material record sections">
      <button type="button" className={inventorySection === 'stock' ? 'active' : ''} aria-current={inventorySection === 'stock' ? 'page' : undefined} onClick={() => setSearchParams({}, { replace: true })}>Current stock</button>
      <button type="button" className={inventorySection === 'movements' ? 'active' : ''} aria-current={inventorySection === 'movements' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'movements' }, { replace: true })}>Movements</button>
      <button type="button" className={inventorySection === 'evidence' ? 'active' : ''} aria-current={inventorySection === 'evidence' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'evidence' }, { replace: true })}>Evidence</button>
    </nav>}
    {role === 'Storekeeper' && inventorySection === 'work' && <StorekeeperActions currentUser={currentUser} projectSummaries={projectSummaries} orders={orders} receipts={receipts} requisitions={requisitions} balances={balances} materials={materials} issues={issues} transfers={transfers} counts={counts} onChanged={changed}/>}
    {role === 'Supervisor' && inventorySection === 'work' && <SupervisorInventoryActions currentUser={currentUser} balances={balances} materials={materials} transfers={transfers} counts={counts} onChanged={changed}/>}
    {role === 'Foreman' && <ForemanIssueActions currentUser={currentUser} issues={issues} onChanged={changed}/>}
    {role !== 'CEO' && (role === 'Auditor' ? inventorySection === 'evidence' : !sectionedRole || inventorySection === 'movements') && <InventoryEvidenceRegister currentUser={currentUser} receipts={receipts} issues={issues}/>}
    {role === 'Finance Officer' && !error && receipts.length === 0 && <section className="lav-panel ops-panel"><Empty>No received delivery recorded.</Empty></section>}
    {role === 'CEO'
      ? <CeoMaterialsInventory currentUser={currentUser} balances={balances} ledger={ledger} issues={issues} transfers={transfers} counts={counts} receipts={receipts} returns={returns} onChanged={changed}/>
      : <>
        {!['Foreman', 'Finance Officer'].includes(role) && (!sectionedRole || inventorySection === 'stock') && <StockCards balances={balances}/>}
        {!['Foreman', 'Finance Officer'].includes(role) && (!sectionedRole || inventorySection === 'movements') && <section className="lav-panel ops-panel">
          {ledger.length ? <div className="ops-table"><div className="ops-row head"><span>Material</span><span>Movement</span><span>Quantity</span><span>Balance</span><span>Recorded by</span></div>{ledger.slice(0, 12).map(item => <div className="ops-row movement" key={item.id}><span data-label="Material"><b>{item.materialName}</b><small>{item.projectName}</small></span><span data-label="Movement">{item.movementType === 'TechnicalAcceptance' ? 'Engineer accepted' : item.movementType}</span><span data-label="Quantity" className={item.quantityDelta < 0 ? 'negative' : 'positive'}>{item.quantityDelta > 0 ? '+' : ''}{item.quantityDelta} {item.unit}</span><span data-label="Balance">{item.balanceAfter} {item.unit}</span><span data-label="Recorded by"><b>{item.actorName}</b><small>{when(item.occurredAt)}</small></span></div>)}</div> : <Empty>No receipts, issues, transfers or count adjustments yet.</Empty>}
        </section>}
        {sectionedRole && inventorySection === 'movements' && <MovementSummary issues={issues} transfers={transfers} counts={counts}/>}
      </>}
  </div>
}

function InventoryEvidenceRegister({ currentUser, receipts, issues }: { currentUser: CurrentUser; receipts: GoodsReceipt[]; issues: MaterialIssue[] }) {
  const usageRecords = currentUser.role === 'Finance Officer' ? [] : issues.flatMap(issue => issue.usage.map(usage => ({ issue, usage })))
  if (!receipts.length && !usageRecords.length) return null
  return <details className="record-evidence-register lav-panel" open={currentUser.role === 'Finance Officer'}>
    <summary>{currentUser.role === 'Finance Officer' ? 'Received deliveries' : 'Evidence files'} <span>{receipts.length + usageRecords.length} records</span></summary>
    <div className="record-evidence-list">
      {receipts.map(receipt => <article key={`receipt-${receipt.id}`}>
        <div><strong>{receipt.materialName}</strong><small>{receipt.projectName} · received {when(receipt.receivedAt)} by {receipt.receivedByName}</small></div>
        <EvidenceFiles sourceType="GoodsReceipt" sourceId={receipt.id} kind="DeliveryNote" label="Delivery files" canUpload={currentUser.role === 'Storekeeper' && receipt.receivedByName === currentUser.fullName}/>
      </article>)}
      {usageRecords.map(({ issue, usage }) => <article key={`usage-${usage.id}`}>
        <div><strong>{usage.usageType}: {usage.quantity} {issue.materialUnit} of {issue.materialName}</strong><small>{issue.projectName} · recorded {when(usage.recordedAt)} by {usage.recordedByName}</small></div>
        <EvidenceFiles sourceType="MaterialUsageRecord" sourceId={usage.id} kind="Photo" label="Usage files" canUpload={currentUser.role === 'Foreman' && usage.recordedByName === currentUser.fullName}/>
      </article>)}
    </div>
  </details>
}

export function LiveTechnicalAcceptanceView({ currentUser }: { currentUser: CurrentUser }) {
  const [items, setItems] = useState<TechnicalAcceptanceWorkItem[]>([])
  const [activeList, setActiveList] = useState<'pending' | 'reviewed'>('pending')
  const [selectedReceiptId, setSelectedReceiptId] = useState<number | null>(null)
  const [form, setForm] = useState<{ outcome: '' | TechnicalAcceptanceOutcome; notes: string; evidenceReference: string }>({ outcome: '', notes: '', evidenceReference: '' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    everyPage<TechnicalAcceptanceWorkItem>(page => inventoryApi.technicalAcceptances({ page, pageSize: 100 }, controller.signal))
      .then(result => {
        setItems(result)
        setError(null)
      })
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setError(messageOf(error)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])

  useEffect(() => {
    if (selectedReceiptId === null) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) setSelectedReceiptId(null) }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [busy, selectedReceiptId])

  const pending = items.filter(item => item.requiresTechnicalAcceptance && !item.outcome)
  const reviewed = items.filter(item => item.requiresTechnicalAcceptance && item.outcome)
  const visible = activeList === 'pending' ? pending : reviewed
  const selected = items.find(item => item.goodsReceiptId === selectedReceiptId)
  const openReview = (item: TechnicalAcceptanceWorkItem) => {
    setSelectedReceiptId(item.goodsReceiptId)
    setForm({ outcome: '', notes: '', evidenceReference: '' })
    setReviewError(null)
  }
  const closeReview = () => { if (!busy) setSelectedReceiptId(null) }
  const submitReview = async () => {
    const outcome = form.outcome
    if (!selected || !outcome || form.notes.trim().length < 3) return
    setBusy(true)
    setReviewError(null)
    try {
      await inventoryApi.recordTechnicalAcceptance(selected.goodsReceiptId, {
        outcome,
        notes: form.notes.trim(),
        evidenceReference: form.evidenceReference.trim() || null,
      })
      setNotice(`${selected.materialName} marked ${outcome.toLowerCase()}.`)
      setSelectedReceiptId(null)
      setRefresh(value => value + 1)
    } catch (error) {
      setReviewError(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  if (currentUser.role !== 'Engineer') return <Notice tone="error">Only an Engineer can record technical acceptance.</Notice>
  if (loading) return <Loading>Loading delivery checks…</Loading>
  return <div className="lav-view ops-view technical-acceptance-view">
    {error && <Notice tone="error">{error} <button type="button" onClick={() => { setError(null); setLoading(true); setRefresh(value => value + 1) }}>Try again</button></Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {!error && <section className="lav-panel technical-acceptance-panel">
      <header className="technical-acceptance-toolbar">
        <div>
          <h2>Received materials</h2>
          <span>{pending.length} waiting · legacy deliveries only</span>
        </div>
        <nav aria-label="Delivery check status">
          <button type="button" className={activeList === 'pending' ? 'active' : ''} aria-current={activeList === 'pending' ? 'page' : undefined} onClick={() => setActiveList('pending')}>Waiting <b>{pending.length}</b></button>
          <button type="button" className={activeList === 'reviewed' ? 'active' : ''} aria-current={activeList === 'reviewed' ? 'page' : undefined} onClick={() => setActiveList('reviewed')}>Reviewed <b>{reviewed.length}</b></button>
        </nav>
      </header>
      {visible.length ? <div className="technical-delivery-list">{visible.map(item => <article key={item.goodsReceiptId}>
        <header>
          <div><span>{item.projectName}</span><h2>{item.materialName}</h2></div>
          <b className={`technical-decision ${item.outcome ? item.outcome.toLowerCase() : 'pending'}`}>{item.outcome ?? 'Waiting'}</b>
        </header>
        <div className="technical-delivery-facts">
          <span><small>Received for inspection</small><strong>{item.acceptedQuantity.toLocaleString()} {item.materialUnit}</strong></span>
          <span><small>Supplier</small><strong>{item.supplierName}</strong></span>
          <span><small>Received by</small><strong>{item.receivedByName}</strong><em>{when(item.receivedAt)}</em></span>
          <span><small>Condition</small><strong>{item.condition}</strong><em>Delivery note {item.deliveryNoteReference}</em></span>
        </div>
        <EvidenceFiles sourceType="GoodsReceipt" sourceId={item.goodsReceiptId} kind="DeliveryNote" label="Delivery files" canUpload={false}/>
        {item.outcome
          ? <footer><div className="technical-review-result"><span>Reviewed by <b>{item.reviewedByName}</b>{item.reviewedAt ? ` · ${when(item.reviewedAt)}` : ''}</span>{item.notes && <p>{item.notes}</p>}{item.technicalAcceptanceId && <EvidenceFiles sourceType="GoodsReceiptTechnicalAcceptance" sourceId={item.technicalAcceptanceId} kind="Inspection" label="Inspection files" canUpload={item.reviewedByUserId === currentUser.id}/>}</div>{item.outcome === 'Rejected' && <button type="button" className="lav-button secondary" onClick={() => openReview(item)}>Review again</button>}</footer>
          : <footer><span>Confirm the material and specification.</span><button type="button" className="lav-button primary" onClick={() => openReview(item)}>Review delivery</button></footer>}
      </article>)}</div> : <Empty>{activeList === 'pending' ? 'No delivery needs an Engineer decision.' : 'No delivery has been reviewed.'}</Empty>}
    </section>}
    {selected && <div className="ops-modal-wrap" role="presentation">
      <button type="button" className="ops-modal-backdrop" aria-label="Close technical acceptance" onClick={closeReview}/>
      <form className="lav-panel ops-form ops-modal technical-acceptance-modal" role="dialog" aria-modal="true" aria-labelledby="technical-acceptance-title" onSubmit={event => { event.preventDefault(); void submitReview() }}>
        <header><div><span className="lav-kicker">{selected.projectName}</span><h2 id="technical-acceptance-title">{selected.materialName}</h2><p>{selected.acceptedQuantity.toLocaleString()} {selected.materialUnit} from {selected.supplierName}</p></div><button type="button" className="ops-modal-close" aria-label="Close" disabled={busy} onClick={closeReview}>×</button></header>
        {reviewError && <Notice tone="error">{reviewError}</Notice>}
        <div className="technical-receipt-summary"><span>Received by <b>{selected.receivedByName}</b></span><span>{selected.acceptedQuantity.toLocaleString()} of {selected.deliveredQuantity.toLocaleString()} {selected.materialUnit} awaiting decision · {selected.condition}</span><span>{when(selected.receivedAt)}</span></div>
        <fieldset className="technical-outcome-options">
          <legend>Decision</legend>
          <label className={form.outcome === 'Accepted' ? 'selected accepted' : ''}><input type="radio" name="technical-outcome" value="Accepted" checked={form.outcome === 'Accepted'} onChange={() => setForm({ ...form, outcome: 'Accepted' })}/><span>Accept</span></label>
          <label className={form.outcome === 'Rejected' ? 'selected rejected' : ''}><input type="radio" name="technical-outcome" value="Rejected" checked={form.outcome === 'Rejected'} onChange={() => setForm({ ...form, outcome: 'Rejected' })}/><span>Reject</span></label>
        </fieldset>
        <label><span>Engineer finding</span><textarea autoFocus required minLength={3} maxLength={1000} rows={4} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })}/></label>
        <label><span>Evidence reference (optional)</span><input maxLength={500} value={form.evidenceReference} onChange={event => setForm({ ...form, evidenceReference: event.target.value })}/></label>
        <div className="ops-buttons"><button type="button" className="lav-button secondary" disabled={busy} onClick={closeReview}>Cancel</button><button type="submit" className="lav-button primary" disabled={busy || !form.outcome || form.notes.trim().length < 3}>{busy ? 'Saving…' : 'Submit decision'}</button></div>
      </form>
    </div>}
  </div>
}

function StockCards({ balances }: { balances: StockBalance[] }) {
  const groups = useMemo(() => [...balances].sort((a, b) => a.projectName.localeCompare(b.projectName) || a.materialName.localeCompare(b.materialName)), [balances])
  return <section className="lav-panel ops-panel"><header className="lav-panel-head"><div><span className="lav-kicker">IN STORE NOW</span><h2>Current balances</h2></div><strong>{groups.length} stocked items</strong></header>
    {groups.length ? <div className="ops-stock-grid">{groups.map(item => <article className={item.quantityOnHand <= item.reorderLevel ? 'low' : ''} key={item.id}><span>{item.projectName}</span><h3>{item.materialName}</h3><strong>{item.quantityOnHand.toLocaleString()} <small>{item.unit}</small></strong><p>{item.quantityOnHand <= item.reorderLevel ? `At or below reorder level (${item.reorderLevel})` : item.category}</p></article>)}</div> : <Empty>Stock appears after a Storekeeper records the first GRN.</Empty>}
  </section>
}

function StorekeeperActions({ currentUser, projectSummaries, orders, receipts, requisitions, balances, materials, issues, transfers, counts, onChanged }: { currentUser: CurrentUser; projectSummaries: ProjectSummary[]; orders: PurchaseOrder[]; receipts: GoodsReceipt[]; requisitions: Requisition[]; balances: StockBalance[]; materials: Material[]; issues: MaterialIssue[]; transfers: StockTransfer[]; counts: StockCount[]; onChanged: (text: string) => void }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedAction = searchParams.get('action')
  const activeAction: 'restock' | 'receive' | 'issue' | 'count' | 'transfers' = requestedAction === 'receive' || requestedAction === 'issue' || requestedAction === 'count' || requestedAction === 'transfers' ? requestedAction : 'restock'
  const [receiving, setReceiving] = useState({ purchaseOrderId: '', delivered: '', accepted: '', condition: 'Good', deliveryNote: '', evidence: '', notes: '' })
  const [issuing, setIssuing] = useState({ requisitionId: '', quantity: '', notes: '' })
  const [count, setCount] = useState({ projectId: '', materialId: '', quantity: '', notes: '' })
  const [replenishment, setReplenishment] = useState({ projectId: '', costCodeId: '', materialId: '', quantity: '', neededByDate: '', reason: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [receiptTransferId, setReceiptTransferId] = useState<number | null>(null)
  const [transferReceipt, setTransferReceipt] = useState({ quantity: '', notes: '' })
  const pendingIssueReqs = requisitions.filter(requisition => requisition.requestType === 'SiteUse' && !issues.some(issue => issue.requisitionId === requisition.id))
  const availableReqs = pendingIssueReqs.filter(requisition => {
    const balance = balances.find(item => item.projectId === requisition.projectId && item.materialId === requisition.materialId)
    return (balance?.quantityOnHand ?? 0) >= requisition.quantity
  })
  const waitingForStock = pendingIssueReqs.length - availableReqs.length
  const selectedReq = requisitions.find(item => item.id === Number(issuing.requisitionId))
  const selectedOrder = orders.find(item => item.id === Number(receiving.purchaseOrderId))
  const selectedOrderLine = selectedOrder?.lines[0]
  const selectedBalance = balances.find(item => item.projectId === Number(count.projectId) && item.materialId === Number(count.materialId))
  const receiptTransfer = transfers.find(item => item.id === receiptTransferId)
  const replenishmentProject = projectSummaries.find(item => item.project.id === Number(replenishment.projectId))
  const replenishmentMaterial = materials.find(item => item.id === Number(replenishment.materialId))
  const expectedOrders = orders.filter(order => {
    const ordered = order.lines[0]?.quantity ?? 0
    return committedReceiptQuantity(order, receipts) < ordered
  })
  const assignedProjectIds = new Set(currentUser.projects.map(project => project.id))
  const actionableTransfers = transfers.filter(transfer =>
    (transfer.status === 'PendingDispatch' && assignedProjectIds.has(transfer.fromProjectId))
    || (transfer.status === 'InTransit' && assignedProjectIds.has(transfer.toProjectId) && transfer.dispatchedByUserId !== currentUser.id))
  const countableMaterials = materials.filter(material =>
    balances.some(balance => balance.projectId === Number(count.projectId) && balance.materialId === material.id)
    && !counts.some(stockCount => stockCount.projectId === Number(count.projectId) && stockCount.materialId === material.id && stockCount.status === 'AwaitingReview'))
  const submit = async (work: () => Promise<unknown>, success: string) => { if (busyRef.current) return false; busyRef.current = true; setBusy(true); setError(null); try { await work(); onChanged(success); return true } catch (error) { setError(messageOf(error)); return false } finally { busyRef.current = false; setBusy(false) } }
  const selectAction = (action: 'restock' | 'receive' | 'issue' | 'count' | 'transfers') => {
    const next = new URLSearchParams(searchParams)
    next.delete('section')
    if (action === 'restock') next.delete('action')
    else next.set('action', action)
    setSearchParams(next, { replace: true })
    setReceiptTransferId(null)
    setError(null)
  }
  return <section className="ops-storekeeper-workspace">
    <nav className="ops-action-nav" aria-label="Storekeeper stock actions">
      <button type="button" className={activeAction === 'restock' ? 'active' : ''} aria-current={activeAction === 'restock' ? 'page' : undefined} onClick={() => selectAction('restock')}>Restock</button>
      <button type="button" className={activeAction === 'receive' ? 'active' : ''} aria-current={activeAction === 'receive' ? 'page' : undefined} onClick={() => selectAction('receive')}>Receive delivery</button>
      <button type="button" className={activeAction === 'issue' ? 'active' : ''} aria-current={activeAction === 'issue' ? 'page' : undefined} onClick={() => selectAction('issue')}>Create issue voucher</button>
      <button type="button" className={activeAction === 'count' ? 'active' : ''} aria-current={activeAction === 'count' ? 'page' : undefined} onClick={() => selectAction('count')}>Submit count</button>
      <button type="button" className={activeAction === 'transfers' ? 'active' : ''} aria-current={activeAction === 'transfers' ? 'page' : undefined} onClick={() => selectAction('transfers')}>Transfers</button>
    </nav>
    {error && !receiptTransfer && <Notice tone="error">{error}</Notice>}
    {activeAction !== 'transfers' && <div className="ops-action-panel">
    {activeAction === 'restock' && <form className="lav-panel ops-form ops-replenishment" onSubmit={event => { event.preventDefault(); void submit(() => requisitionsApi.createStockReplenishment({ projectId: Number(replenishment.projectId), materialId: Number(replenishment.materialId), costCodeId: Number(replenishment.costCodeId), quantity: Number(replenishment.quantity), neededByDate: replenishment.neededByDate, reason: replenishment.reason, notes: replenishment.notes.trim() || null }), 'Store replenishment request submitted.').then(saved => { if (saved) setReplenishment({ projectId: '', costCodeId: '', materialId: '', quantity: '', neededByDate: '', reason: '', notes: '' }) }) }}>
      <h2>Restock</h2>
      <div className="ops-fields"><label><span>Project store</span><select required value={replenishment.projectId} onChange={event => setReplenishment({ ...replenishment, projectId: event.target.value, costCodeId: '' })}><option value="">Choose project</option>{projectSummaries.map(item => <option key={item.project.id} value={item.project.id}>{item.project.name}</option>)}</select></label><label><span>Budget area</span><select required disabled={!replenishmentProject} value={replenishment.costCodeId} onChange={event => setReplenishment({ ...replenishment, costCodeId: event.target.value })}><option value="">Choose budget area</option>{replenishmentProject?.costCodes.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      <label><span>Material</span><select required value={replenishment.materialId} onChange={event => setReplenishment({ ...replenishment, materialId: event.target.value })}><option value="">Choose material</option>{materials.map(item => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></label>
      <div className="ops-fields"><label><span>Quantity</span><input type="number" min="0.001" step="0.001" required value={replenishment.quantity} onChange={event => setReplenishment({ ...replenishment, quantity: event.target.value })}/></label><label><span>Unit</span><select disabled value={replenishmentMaterial?.unit ?? ''}><option>{replenishmentMaterial?.unit || 'Choose material'}</option></select></label></div>
      <label><span>Needed in store by</span><input type="date" required value={replenishment.neededByDate} onChange={event => setReplenishment({ ...replenishment, neededByDate: event.target.value })}/></label><label><span>Why the store needs this stock</span><textarea minLength={3} maxLength={500} rows={3} required value={replenishment.reason} onChange={event => setReplenishment({ ...replenishment, reason: event.target.value })} placeholder="For example: maintain a 1,000-bag cement reserve for the next work stages"/></label><label><span>Notes (optional)</span><input maxLength={1000} value={replenishment.notes} onChange={event => setReplenishment({ ...replenishment, notes: event.target.value })}/></label><button className="lav-button primary" disabled={busy}>Request store stock</button>
    </form>}
    {activeAction === 'receive' && <form className="lav-panel ops-form" onSubmit={event => { event.preventDefault(); void submit(() => inventoryApi.receive({ purchaseOrderId: Number(receiving.purchaseOrderId), deliveredQuantity: Number(receiving.delivered), acceptedQuantity: Number(receiving.accepted), condition: receiving.condition, deliveryNoteReference: receiving.deliveryNote, evidenceReference: receiving.evidence || null, discrepancyNotes: receiving.notes || null }), Number(receiving.accepted) > 0 ? 'GRN saved and accepted stock added to the store.' : 'GRN saved with no quantity added to stock.').then(saved => { if (saved) setReceiving({ purchaseOrderId: '', delivered: '', accepted: '', condition: 'Good', deliveryNote: '', evidence: '', notes: '' }) }) }}>
      <h2>Receive delivery</h2>
      <label><span>Issued purchase order</span><select required value={receiving.purchaseOrderId} onChange={e => setReceiving({ purchaseOrderId: e.target.value, delivered: '', accepted: '', condition: 'Good', deliveryNote: '', evidence: '', notes: '' })}><option value="">Choose order</option>{expectedOrders.map(order => { const committed = committedReceiptQuantity(order, receipts); const line = order.lines[0]; return <option value={order.id} key={order.id}>{line?.materialName} · {order.supplierName} · {line ? line.quantity - committed : 0} {line?.materialUnit} outstanding</option> })}</select></label>
      <div className="ops-fields three"><label><span>Delivered</span><input type="number" min="0.001" step="0.001" required value={receiving.delivered} onChange={e => setReceiving({ ...receiving, delivered: e.target.value })}/></label><label><span>Accepted</span><input type="number" min="0" step="0.001" required value={receiving.accepted} onChange={e => setReceiving({ ...receiving, accepted: e.target.value })}/></label><label><span>Unit</span><select disabled value={selectedOrderLine?.materialUnit ?? ''}><option>{selectedOrderLine?.materialUnit || 'Choose order'}</option></select></label></div>
      <div className="ops-fields"><label><span>Condition</span><select value={receiving.condition} onChange={e => setReceiving({ ...receiving, condition: e.target.value })}><option>Good</option><option>Mixed</option><option>Damaged</option></select></label><label><span>Delivery note</span><input required value={receiving.deliveryNote} onChange={e => setReceiving({ ...receiving, deliveryNote: e.target.value })}/></label></div>
      <label><span>Evidence reference</span><input placeholder="Photo/file reference" value={receiving.evidence} onChange={e => setReceiving({ ...receiving, evidence: e.target.value })}/></label><label><span>Discrepancy notes</span><input placeholder="Required for rejected quantity" value={receiving.notes} onChange={e => setReceiving({ ...receiving, notes: e.target.value })}/></label><button className="lav-button primary" disabled={busy}>Save GRN</button>
    </form>}
    {activeAction === 'issue' && <form className="lav-panel ops-form" onSubmit={event => { event.preventDefault(); void submit(() => inventoryApi.issue({ requisitionId: Number(issuing.requisitionId), quantity: Number(issuing.quantity), notes: issuing.notes || null }), selectedReq?.requestedByUserName ? `Issue voucher created for ${selectedReq.requestedByUserName}.` : 'Material issue saved.').then(saved => { if (saved) setIssuing({ requisitionId: '', quantity: '', notes: '' }) }) }}>
      <h2>Create issue voucher</h2>
      {waitingForStock > 0 && <Notice>{waitingForStock} approved {waitingForStock === 1 ? 'request is' : 'requests are'} waiting for enough store stock.</Notice>}
      <label><span>Approved request</span><select required value={issuing.requisitionId} onChange={e => { const req = requisitions.find(item => item.id === Number(e.target.value)); setIssuing({ ...issuing, requisitionId: e.target.value, quantity: req ? String(req.quantity) : '' }) }}><option value="">Choose request</option>{availableReqs.map(req => <option value={req.id} key={req.id}>{req.materialName} · {req.projectName} · {req.quantity} {req.materialUnit} · for {req.requestedByUserName ?? 'requester'}</option>)}</select></label>
      {selectedReq && <label><span>Receiving Foreman</span><input readOnly value={selectedReq.requestedByUserName ?? 'Requester not available'}/></label>}
      <div className="ops-fields"><label><span>Approved quantity</span><input type="number" min="0.001" step="0.001" required readOnly value={issuing.quantity}/></label><label><span>Unit</span><select disabled value={selectedReq?.materialUnit ?? ''}><option>{selectedReq?.materialUnit || 'Select material'}</option></select></label></div>
      <label><span>Handover note</span><input value={issuing.notes} onChange={e => setIssuing({ ...issuing, notes: e.target.value })}/></label><button className="lav-button primary" disabled={busy}>Create issue voucher</button>
    </form>}
    {activeAction === 'count' && <form className="lav-panel ops-form" onSubmit={event => { event.preventDefault(); void submit(() => inventoryApi.createCount({ projectId: Number(count.projectId), materialId: Number(count.materialId), countedQuantity: Number(count.quantity), notes: count.notes }), 'Physical count submitted for independent Supervisor review.').then(saved => { if (saved) setCount({ projectId: '', materialId: '', quantity: '', notes: '' }) }) }}>
      <h2>Submit count</h2>
      <label><span>Project store</span><select required value={count.projectId} onChange={e => setCount({ projectId: e.target.value, materialId: '', quantity: '', notes: '' })}><option value="">Choose project</option>{[...new Map(balances.map(item => [item.projectId, item.projectName])).entries()].map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
      <label><span>Material</span><select required value={count.materialId} onChange={e => setCount({ ...count, materialId: e.target.value, quantity: '', notes: '' })}><option value="">Choose material</option>{countableMaterials.map(item => <option value={item.id} key={item.id}>{item.name} ({item.unit})</option>)}</select></label>
      {selectedBalance && <small>System shows {selectedBalance.quantityOnHand} {selectedBalance.unit}</small>}
      <label><span>Physical quantity counted</span><input type="number" min="0" step="0.001" required value={count.quantity} onChange={e => setCount({ ...count, quantity: e.target.value })}/></label><label><span>Count note</span><input minLength={3} required value={count.notes} onChange={e => setCount({ ...count, notes: e.target.value })}/></label><button className="lav-button primary" disabled={busy}>Submit count</button>
    </form>}
    </div>}
    {activeAction === 'transfers' && <div className="lav-panel ops-form"><h2>Transfers awaiting Stores</h2>{actionableTransfers.map(item => <article className="ops-action-item" key={item.id}><b>{item.materialName}</b><span>{item.quantity} {item.materialUnit} · {item.fromProjectName} → {item.toProjectName}</span>{item.status === 'PendingDispatch' ? <button type="button" className="lav-button secondary" disabled={busy} onClick={() => void submit(() => inventoryApi.dispatchTransfer(item.id), 'Transfer dispatched.')}>Dispatch</button> : <button type="button" className="lav-button secondary" disabled={busy} onClick={() => { setReceiptTransferId(item.id); setTransferReceipt({ quantity: String(item.quantity), notes: '' }) }}>Confirm receipt</button>}</article>)}{actionableTransfers.length === 0 && <Empty>No transfer handoff requires action for this account.</Empty>}</div>}
    {receiptTransfer && <div className="ops-modal-wrap" role="presentation"><button type="button" className="ops-modal-backdrop" aria-label="Close transfer form" onClick={() => setReceiptTransferId(null)}/><form className="lav-panel ops-form ops-modal" onSubmit={event => { event.preventDefault(); void submit(() => inventoryApi.receiveTransfer(receiptTransfer.id, { receivedQuantity: Number(transferReceipt.quantity), notes: transferReceipt.notes.trim() || null }), 'Destination receipt recorded and the movement trail updated.').then(saved => { if (saved) setReceiptTransferId(null) }) }}><header><div><span className="lav-kicker">DESTINATION CHECK</span><h2>Confirm transfer receipt</h2><p>{receiptTransfer.fromProjectName} → {receiptTransfer.toProjectName}</p></div><button type="button" className="ops-modal-close" disabled={busy} onClick={() => setReceiptTransferId(null)}>×</button></header>{error && <Notice tone="error">{error}</Notice>}<label><span>Material</span><input value={receiptTransfer.materialName} disabled/></label><div className="ops-fields"><label><span>Quantity received</span><input type="number" min="0" step="0.001" required value={transferReceipt.quantity} onChange={event => setTransferReceipt({ ...transferReceipt, quantity: event.target.value })}/></label><label><span>Unit</span><select disabled value={receiptTransfer.materialUnit}><option>{receiptTransfer.materialUnit}</option></select></label></div><label><span>Receipt note {Number(transferReceipt.quantity) === receiptTransfer.quantity ? '(optional)' : '(explain the difference)'}</span><textarea required={Number(transferReceipt.quantity) !== receiptTransfer.quantity} minLength={3} rows={3} value={transferReceipt.notes} onChange={event => setTransferReceipt({ ...transferReceipt, notes: event.target.value })}/></label><div className="ops-buttons"><button type="button" className="lav-button secondary" disabled={busy} onClick={() => setReceiptTransferId(null)}>Cancel</button><button className="lav-button primary" disabled={busy}>Save destination receipt</button></div></form></div>}
  </section>
}

function ForemanIssueActions({ currentUser, issues, onChanged }: { currentUser: CurrentUser; issues: MaterialIssue[]; onChanged: (text: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [active, setActive] = useState<{ issueId: number; mode: 'confirm' | 'usage' } | null>(null)
  const [confirmation, setConfirmation] = useState({ quantity: '', notes: '' })
  const [usage, setUsage] = useState<{ type: 'Used' | 'Wastage'; quantity: string; reason: string; evidence: string; idempotencyKey: string }>({ type: 'Used', quantity: '', reason: '', evidence: '', idempotencyKey: '' })
  const work = async (action: () => Promise<unknown>, text: string) => { if (busyRef.current) return false; busyRef.current = true; setBusy(true); setError(null); try { await action(); onChanged(text); return true } catch (error) { setError(messageOf(error)); return false } finally { busyRef.current = false; setBusy(false) } }
  const activeIssue = issues.find(issue => issue.id === active?.issueId)
  return <section className="lav-panel ops-panel"><header className="lav-panel-head"><div><span className="lav-kicker">{currentUser.canSwitchRoles ? 'HANDOVERS' : 'MY CUSTODY'}</span><h2>{currentUser.canSwitchRoles ? 'Material issued to Foremen' : 'Confirm and account for material'}</h2></div></header>{error && !active && <Notice tone="error">{error}</Notice>}
    <div className="ops-issue-grid">{issues.map(issue => { const assignedToCurrentUser = issue.issuedToUserId === currentUser.id; return <article key={issue.id}><div><span>{issue.projectName}</span><b>{issue.materialName}</b><strong>{issue.quantityIssued} {issue.materialUnit}</strong></div><p>Issued to {issue.issuedToName} · by {issue.issuedByName}</p>{issue.status === 'AwaitingConfirmation' && assignedToCurrentUser && <button type="button" className="lav-button primary" onClick={() => { setActive({ issueId: issue.id, mode: 'confirm' }); setConfirmation({ quantity: String(issue.quantityIssued), notes: '' }) }}>Confirm receipt</button>}{issue.status === 'AwaitingConfirmation' && !assignedToCurrentUser && <span className="ops-status awaitingconfirmation">Awaiting {issue.issuedToName}</span>}{issue.status === 'Confirmed' && <><div className="ops-account"><span>Used <b>{issue.usedQuantity}</b></span><span>Wasted <b>{issue.wastedQuantity}</b></span><span>Still with team <b>{issue.unaccountedQuantity}</b></span></div>{assignedToCurrentUser && issue.unaccountedQuantity > 0 && <button type="button" className="lav-button secondary" onClick={() => { setActive({ issueId: issue.id, mode: 'usage' }); setUsage({ type: 'Used', quantity: '', reason: '', evidence: '', idempotencyKey: crypto.randomUUID() }) }}>Record use or wastage</button>}</>}{issue.status === 'Disputed' && <Notice tone="error">Receipt difference recorded: {issue.confirmedQuantity} of {issue.quantityIssued} {issue.materialUnit}.</Notice>}</article> })}{issues.length === 0 && <Empty>No material issue has been handed to this Foreman.</Empty>}</div>
    {active && activeIssue && <div className="ops-modal-wrap" role="presentation"><button type="button" className="ops-modal-backdrop" aria-label="Close material form" disabled={busy} onClick={() => setActive(null)}/><form className="lav-panel ops-form ops-modal" onSubmit={event => { event.preventDefault(); if (active.mode === 'confirm') void work(() => inventoryApi.confirmIssue(activeIssue.id, { receivedQuantity: Number(confirmation.quantity), notes: confirmation.notes.trim() || null }), 'Receipt confirmation recorded.').then(saved => { if (saved) setActive(null) }); else void work(() => inventoryApi.recordUsage(activeIssue.id, { usageType: usage.type, quantity: Number(usage.quantity), purposeOrReason: usage.reason, evidenceReference: usage.evidence.trim() || null, idempotencyKey: usage.idempotencyKey }), `${usage.type} record saved.`).then(saved => { if (saved) setActive(null) }) }}><header><div><span className="lav-kicker">{activeIssue.projectName}</span><h2>{active.mode === 'confirm' ? 'Confirm physical receipt' : 'Account for material'}</h2><p>{activeIssue.materialName}</p></div><button type="button" className="ops-modal-close" disabled={busy} onClick={() => setActive(null)}>×</button></header>{error && <Notice tone="error">{error}</Notice>}{active.mode === 'confirm' ? <><div className="ops-fields"><label><span>Quantity physically received</span><input type="number" min="0" max={activeIssue.quantityIssued} step="0.001" required value={confirmation.quantity} onChange={event => setConfirmation({ ...confirmation, quantity: event.target.value })}/></label><label><span>Unit</span><select disabled value={activeIssue.materialUnit}><option>{activeIssue.materialUnit}</option></select></label></div><label><span>Note {Number(confirmation.quantity) === activeIssue.quantityIssued ? '(optional)' : '(explain the difference)'}</span><textarea rows={3} minLength={3} required={Number(confirmation.quantity) !== activeIssue.quantityIssued} value={confirmation.notes} onChange={event => setConfirmation({ ...confirmation, notes: event.target.value })}/></label></> : <><label><span>Record type</span><select value={usage.type} onChange={event => setUsage({ ...usage, type: event.target.value as 'Used' | 'Wastage' })}><option value="Used">Used on construction</option><option value="Wastage">Wasted or damaged</option></select></label><div className="ops-fields"><label><span>Quantity</span><input type="number" min="0.001" max={activeIssue.unaccountedQuantity} step="0.001" required value={usage.quantity} onChange={event => setUsage({ ...usage, quantity: event.target.value })}/></label><label><span>Unit</span><select disabled value={activeIssue.materialUnit}><option>{activeIssue.materialUnit}</option></select></label></div><label><span>{usage.type === 'Used' ? 'Work area or purpose' : 'Reason for wastage'}</span><textarea minLength={3} maxLength={500} rows={3} required value={usage.reason} onChange={event => setUsage({ ...usage, reason: event.target.value })}/></label><label><span>Evidence reference (optional)</span><input maxLength={500} value={usage.evidence} onChange={event => setUsage({ ...usage, evidence: event.target.value })}/></label></>}<div className="ops-buttons"><button type="button" className="lav-button secondary" disabled={busy} onClick={() => setActive(null)}>Cancel</button><button className="lav-button primary" disabled={busy}>{busy ? 'Saving…' : active.mode === 'confirm' ? 'Save receipt check' : 'Save material record'}</button></div></form></div>}
  </section>
}

function SupervisorInventoryActions({ currentUser, balances, materials, counts, onChanged }: { currentUser: CurrentUser; balances: StockBalance[]; materials: Material[]; transfers: StockTransfer[]; counts: StockCount[]; onChanged: (text: string) => void }) {
  const [form, setForm] = useState({ from: '', to: '', material: '', quantity: '', reason: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const run = async (action: () => Promise<unknown>, text: string) => { if (busyRef.current) return false; busyRef.current = true; setBusy(true); try { await action(); setError(null); onChanged(text); return true } catch (error) { setError(messageOf(error)); return false } finally { busyRef.current = false; setBusy(false) } }
  return <section className="ops-action-grid two">
    <form className="lav-panel ops-form" onSubmit={event => { event.preventDefault(); void run(() => inventoryApi.createTransfer({ fromProjectId: Number(form.from), toProjectId: Number(form.to), materialId: Number(form.material), quantity: Number(form.quantity), reason: form.reason }), 'Transfer request sent to Stores.').then(saved => { if (saved) setForm({ from: '', to: '', material: '', quantity: '', reason: '' }) }) }}><h2>Request a site transfer</h2><p>Stores dispatches and the receiving store confirms separately.</p>{error && <Notice tone="error">{error}</Notice>}<div className="ops-fields"><label><span>From</span><select required value={form.from} onChange={e => setForm({ ...form, from: e.target.value, material: '', quantity: '' })}><option value="">Choose</option>{currentUser.projects.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label><label><span>To</span><select required value={form.to} onChange={e => setForm({ ...form, to: e.target.value })}><option value="">Choose</option>{currentUser.projects.filter(p => p.id !== Number(form.from)).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label></div><label><span>Material in sending store</span><select required value={form.material} onChange={e => setForm({ ...form, material: e.target.value, quantity: '' })}><option value="">Choose material</option>{materials.filter(m => balances.some(b => b.projectId === Number(form.from) && b.materialId === m.id)).map(m => <option value={m.id} key={m.id}>{m.name} ({m.unit})</option>)}</select></label><label><span>Quantity</span><input type="number" min="0.001" step="0.001" required value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}/></label><label><span>Reason</span><input minLength={3} required value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}/></label><button className="lav-button primary" disabled={busy}>{busy ? 'Saving…' : 'Request transfer'}</button></form>
    <div className="lav-panel ops-form"><h2>Stock counts to review</h2>{counts.filter(c => c.status === 'AwaitingReview').map(count => <article className="ops-action-item" key={count.id}><b>{count.materialName} · {count.projectName}</b><span>System {count.systemQuantity} · Counted {count.countedQuantity} · Difference {count.variance}</span><div><button className="lav-button primary" disabled={busy} onClick={() => void run(() => inventoryApi.reviewCount(count.id, { approve: true, notes: 'Physical count reviewed and accepted' }), 'Count approved and ledger adjusted.')}>Approve</button><button className="lav-button secondary" disabled={busy} onClick={() => void run(() => inventoryApi.reviewCount(count.id, { approve: false, notes: 'Fresh count required' }), 'Count returned for a fresh count.')}>Reject</button></div></article>)}{!counts.some(c => c.status === 'AwaitingReview') && <Empty>No physical count awaits review.</Empty>}</div>
  </section>
}

function MovementSummary({ issues, transfers, counts }: { issues: MaterialIssue[]; transfers: StockTransfer[]; counts: StockCount[] }) {
  return <section className="ops-summary-grid"><article><span>Foreman handovers</span><strong>{issues.length}</strong><small>{issues.filter(item => item.status === 'Disputed').length} disputed</small></article><article><span>Transfers moving</span><strong>{transfers.filter(item => item.status === 'InTransit').length}</strong><small>{transfers.filter(item => item.status === 'InTransit').length} awaiting receipt</small></article><article><span>Count differences</span><strong>{counts.filter(item => item.variance !== 0).length}</strong><small>{counts.filter(item => item.status === 'AwaitingReview').length} awaiting review</small></article></section>
}

type FinanceDeskSection = 'summary' | 'invoices' | 'authorized' | 'executed'

export function LiveFinanceView({ currentUser }: { currentUser: CurrentUser }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([])
  const [authorizations, setAuthorizations] = useState<PaymentAuthorization[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([])
  const [technicalAcceptances, setTechnicalAcceptances] = useState<TechnicalAcceptanceWorkItem[]>([])
  const [cashBookRequest, setCashBookRequest] = useState<{ role: CurrentUser['role']; refresh: number; data: CashBook | null; error: string | null } | null>(null)
  const [loadedRequest, setLoadedRequest] = useState<{ role: CurrentUser['role']; refresh: number; section: FinanceDeskSection | 'all' } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadWarning, setLoadWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showAllInvoices, setShowAllInvoices] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const role = currentUser.role
  const requestedSection = searchParams.get('section')
  const procurementInvoiceSection = requestedSection === 'history' ? 'history' : 'capture'
  const financeSection: FinanceDeskSection = role === 'CEO'
    ? requestedSection === 'invoices' || requestedSection === 'executed' ? requestedSection : 'summary'
    : role === 'Finance Officer'
      ? requestedSection === 'authorized' || requestedSection === 'executed' ? requestedSection : 'invoices'
      : role === 'Supervisor'
        ? requestedSection === 'executed' ? 'executed' : 'invoices'
        : role === 'Auditor'
          ? requestedSection === 'executed' ? 'executed' : 'invoices'
        : 'invoices'
  const dataSection: FinanceDeskSection | 'all' = role === 'CEO' || role === 'Finance Officer' || role === 'Auditor' ? financeSection : 'all'
  const showInvoices = role === 'Procurement Officer'
    ? procurementInvoiceSection === 'history'
    : role === 'Finance Officer' || role === 'CEO' || role === 'Supervisor' || role === 'Auditor'
      ? financeSection === 'invoices'
      : true
  const showExecutedPayments = role === 'Finance Officer' || role === 'CEO' || role === 'Supervisor' || role === 'Auditor' ? financeSection === 'executed' : role !== 'Procurement Officer'
  const loading = loadedRequest?.role !== role || loadedRequest.refresh !== refresh || loadedRequest.section !== dataSection
  const cashBookRequestIsCurrent = cashBookRequest?.role === role && cashBookRequest.refresh === refresh
  const cashBookLoading = role === 'CEO' && financeSection === 'summary' && !cashBookRequestIsCurrent
  const cashBook = cashBookRequestIsCurrent ? cashBookRequest.data : null
  const cashBookError = cashBookRequestIsCurrent ? cashBookRequest.error : null
  const showAllInvoiceRecords = showAllInvoices || (role === 'Finance Officer' && searchParams.get('view') === 'all')
  useEffect(() => {
    const controller = new AbortController()
    async function loadSection() {
      if (role === 'CEO') {
        if (financeSection === 'summary') return null
        if (financeSection === 'invoices') {
          const invoiceItems = await everyPage<SupplierInvoice>(page => financeApi.invoices(controller.signal, { page, pageSize: 100 }))
          setInvoices(invoiceItems)
          try {
            const acceptanceItems = await everyPage<TechnicalAcceptanceWorkItem>(page => inventoryApi.technicalAcceptances({ page, pageSize: 100 }, controller.signal))
            setTechnicalAcceptances(acceptanceItems)
            return null
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error
            setTechnicalAcceptances([])
            return 'Technical inspection details are unavailable.'
          }
        }
        const paymentItems = await everyPage<Payment>(page => financeApi.payments(controller.signal, { page, pageSize: 100 }))
        setPayments(paymentItems)
        return null
      }

      if (role === 'Finance Officer') {
        if (financeSection === 'invoices') {
          setInvoices(await everyPage<SupplierInvoice>(page => financeApi.invoices(controller.signal, { page, pageSize: 100 })))
          try {
            setTechnicalAcceptances(await everyPage<TechnicalAcceptanceWorkItem>(page => inventoryApi.technicalAcceptances({ page, pageSize: 100 }, controller.signal)))
            return null
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error
            setTechnicalAcceptances([])
            return 'Technical inspection details are unavailable.'
          }
        }
        if (financeSection === 'authorized') {
          setAuthorizations(await everyPage<PaymentAuthorization>(page => financeApi.authorizations(true, controller.signal, { page, pageSize: 100 })))
          return null
        }
        setPayments(await everyPage<Payment>(page => financeApi.payments(controller.signal, { page, pageSize: 100 })))
        return null
      }

      if (role === 'Auditor') {
        if (financeSection === 'invoices') {
          setInvoices(await everyPage<SupplierInvoice>(page => financeApi.invoices(controller.signal, { page, pageSize: 100 })))
          try {
            setTechnicalAcceptances(await everyPage<TechnicalAcceptanceWorkItem>(page => inventoryApi.technicalAcceptances({ page, pageSize: 100 }, controller.signal)))
            return null
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') throw error
            setTechnicalAcceptances([])
            return 'Technical inspection details are unavailable.'
          }
        }
        setPayments(await everyPage<Payment>(page => financeApi.payments(controller.signal, { page, pageSize: 100 })))
        return null
      }

      const tasks: Promise<unknown>[] = [everyPage<SupplierInvoice>(page => financeApi.invoices(controller.signal, { page, pageSize: 100 })).then(items => ({ items }))]
      if (role !== 'Procurement Officer') tasks.push(
        everyPage<PaymentAuthorization>(page => financeApi.authorizations(false, controller.signal, { page, pageSize: 100 })).then(items => ({ items })),
        everyPage<Payment>(page => financeApi.payments(controller.signal, { page, pageSize: 100 })).then(items => ({ items })),
      )
      if (role === 'Procurement Officer') tasks.push(
        everyPage<PurchaseOrder>(page => purchaseOrdersApi.list({ page, pageSize: 100, status: 'Issued' }, controller.signal)).then(items => ({ items })),
        everyPage<GoodsReceipt>(page => inventoryApi.receipts(controller.signal, { page, pageSize: 100 })).then(items => ({ items })),
      )
      if (['Finance Officer', 'Auditor'].includes(role)) tasks.push(
        everyPage<TechnicalAcceptanceWorkItem>(page => inventoryApi.technicalAcceptances({ page, pageSize: 100 }, controller.signal)).then(items => ({ items })),
      )
      const results = await Promise.all(tasks)
      let index = 0
      setInvoices((results[index++] as { items: SupplierInvoice[] }).items)
      if (role !== 'Procurement Officer') {
        setAuthorizations((results[index++] as { items: PaymentAuthorization[] }).items)
        setPayments((results[index++] as { items: Payment[] }).items)
      } else {
        setOrders((results[index++] as { items: PurchaseOrder[] }).items)
        setReceipts((results[index++] as { items: GoodsReceipt[] }).items)
      }
      if (['Finance Officer', 'Auditor'].includes(role)) setTechnicalAcceptances((results[index] as { items: TechnicalAcceptanceWorkItem[] }).items)
      else setTechnicalAcceptances([])
      return null
    }

    void loadSection()
      .then(warning => { setLoadWarning(warning); setLoadError(null) })
      .catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setLoadWarning(null)
          setLoadError(messageOf(error))
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoadedRequest({ role, refresh, section: dataSection }) })

    if (role === 'CEO' && financeSection === 'summary') financeApi.cashBook(controller.signal)
      .then(data => { if (!controller.signal.aborted) setCashBookRequest({ role, refresh, data, error: null }) })
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setCashBookRequest({ role, refresh, data: null, error: messageOf(error) }) })
    return () => controller.abort()
  }, [dataSection, financeSection, refresh, role])
  const financeReadyInvoices = invoices.filter(invoice => invoice.status === 'PendingReview'
    && (invoice.technicalAcceptanceStatus ?? 'NotRequired') !== 'Rejected')
  const invoiceRecords = role === 'Supervisor'
    ? invoices.filter(invoice => invoice.status === 'ReadyForAuthorization')
    : role === 'Finance Officer' && !showAllInvoiceRecords
      ? financeReadyInvoices
      : invoices
  const run = async (action: () => Promise<unknown>, text: string) => { try { await action(); setNotice(text); setError(null); setRefresh(v => v + 1); return true } catch (error) { setError(messageOf(error)); return false } }
  return <div className="lav-view ops-view"><header className="lav-page-head"><div><h1>{role === 'CEO' ? 'Money' : role === 'Procurement Officer' ? 'Supplier invoices' : role === 'Auditor' ? 'Money records' : 'Invoices and payments'}</h1></div></header>{loadError && <Notice tone="error">{loadError} <button type="button" onClick={() => { setLoadError(null); setRefresh(value => value + 1) }}>Try again</button></Notice>}{error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}{!loading && loadWarning && <Notice>{loadWarning}</Notice>}
    {loading ? <Loading>Loading finance records…</Loading> : loadError ? null : <>
    {role === 'Finance Officer' && <nav className="ops-action-nav finance-section-nav" aria-label="Invoices and payments sections">
      <button type="button" className={financeSection === 'invoices' ? 'active' : ''} aria-current={financeSection === 'invoices' ? 'page' : undefined} onClick={() => setSearchParams({}, { replace: true })}>Supplier invoices</button>
      <button type="button" className={financeSection === 'authorized' ? 'active' : ''} aria-current={financeSection === 'authorized' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'authorized' }, { replace: true })}>Authorized payments</button>
      <button type="button" className={financeSection === 'executed' ? 'active' : ''} aria-current={financeSection === 'executed' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'executed' }, { replace: true })}>Executed payments</button>
    </nav>}
    {role === 'Supervisor' && <nav className="ops-action-nav finance-section-nav supervisor-finance-nav" aria-label="Supplier payment sections">
      <button type="button" className={financeSection === 'invoices' ? 'active' : ''} aria-current={financeSection === 'invoices' ? 'page' : undefined} onClick={() => setSearchParams({}, { replace: true })}>Waiting approval</button>
      <button type="button" className={financeSection === 'executed' ? 'active' : ''} aria-current={financeSection === 'executed' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'executed' }, { replace: true })}>Executed payments</button>
    </nav>}
    {role === 'Auditor' && <nav className="ops-action-nav finance-section-nav supervisor-finance-nav" aria-label="Money record sections">
      <button type="button" className={financeSection === 'invoices' ? 'active' : ''} aria-current={financeSection === 'invoices' ? 'page' : undefined} onClick={() => setSearchParams({}, { replace: true })}>Supplier invoices</button>
      <button type="button" className={financeSection === 'executed' ? 'active' : ''} aria-current={financeSection === 'executed' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'executed' }, { replace: true })}>Executed payments</button>
    </nav>}
    {role === 'Procurement Officer' && <nav className="ops-action-nav finance-section-nav supervisor-finance-nav" aria-label="Supplier invoice sections">
      <button type="button" className={procurementInvoiceSection === 'capture' ? 'active' : ''} aria-current={procurementInvoiceSection === 'capture' ? 'page' : undefined} onClick={() => setSearchParams({}, { replace: true })}>Capture invoice</button>
      <button type="button" className={procurementInvoiceSection === 'history' ? 'active' : ''} aria-current={procurementInvoiceSection === 'history' ? 'page' : undefined} onClick={() => setSearchParams({ section: 'history' }, { replace: true })}>Invoice history</button>
    </nav>}
    {role === 'Procurement Officer' && procurementInvoiceSection === 'capture' && <InvoiceCapture orders={orders} receipts={receipts} invoices={invoices} onRun={run}/>}
    {showInvoices && <section className="lav-panel ops-panel"><header className="lav-panel-head"><div><h2>{role === 'Supervisor' ? 'Waiting approval' : role === 'Finance Officer' && !showAllInvoiceRecords ? 'Invoices to match' : 'Supplier invoices'}</h2></div>{role === 'Finance Officer' ? <button type="button" className="ops-text-action" onClick={() => { if (showAllInvoiceRecords) { const next = new URLSearchParams(searchParams); next.delete('view'); setSearchParams(next, { replace: true }); setShowAllInvoices(false) } else setShowAllInvoices(true) }}>{showAllInvoiceRecords ? 'Show invoices to match' : 'View all invoices'}</button> : <strong>{invoiceRecords.length} records</strong>}</header>{invoiceRecords.length ? <div className="ops-invoice-grid">{invoiceRecords.map(invoice => <InvoiceCard key={invoice.id} invoice={invoice} technicalAcceptances={technicalAcceptances.filter(item => item.purchaseOrderId === invoice.purchaseOrderId && item.technicalAcceptanceId !== null)} currentUser={currentUser} run={run}/>)}</div> : <Empty>{role === 'Supervisor' ? 'No supplier payment needs approval.' : role === 'Finance Officer' && !showAllInvoiceRecords ? 'No invoice needs matching.' : 'No supplier invoice recorded.'}</Empty>}</section>}
    {role === 'CEO' && financeSection === 'summary' && cashBookLoading && <section className="lav-panel ops-panel"><Loading>Loading cash book…</Loading></section>}
    {role === 'CEO' && financeSection === 'summary' && cashBookError && <section className="lav-panel ops-panel"><Notice tone="error">{cashBookError}</Notice></section>}
    {role === 'CEO' && financeSection === 'summary' && cashBook && <CeoCashBook cashBook={cashBook}/>}
    {role === 'Finance Officer' && financeSection === 'authorized' && <FinancePaymentActions authorizations={authorizations} run={run}/>}
    {showExecutedPayments && <section className="lav-panel ops-panel">
      <header className="lav-panel-head"><div><span className="lav-kicker">PAYMENT PROOF</span><h2>Executed payments</h2></div></header>
      {payments.length ? <div className="ops-table ops-payment-table" role="region" aria-label="Executed payments table" tabIndex={0}>
        <div className="ops-row payment head"><span>Payment</span><span>Amount</span><span>Method</span><span>External proof</span><span>Files</span></div>
        {payments.map(payment => <div className="ops-row payment" key={payment.id}>
          <span data-label="Payment"><b>{payment.displayNumber}</b><small>{when(payment.paidAt)}</small></span>
          <span data-label="Amount">{money(payment.amount)}</span>
          <span data-label="Method">{payment.method}</span>
          <span data-label="External proof"><b>{payment.externalReference}</b><small>Recorded by {payment.paidByName}</small></span>
          <EvidenceFiles sourceType="Payment" sourceId={payment.id} kind="PaymentProof" label="Files" canUpload={role === 'Finance Officer' && payment.paidByName === currentUser.fullName}/>
        </div>)}
      </div> : <Empty>No payment has been executed.</Empty>}
    </section>}
    </>}
  </div>
}

function CeoCashBook({ cashBook }: { cashBook: CashBook }) {
  const [openProjectId, setOpenProjectId] = useState<number | null>(null)
  const openProject = cashBook.projects.find(project => project.projectId === openProjectId)
  useEffect(() => {
    if (openProjectId === null) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenProjectId(null) }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openProjectId])

  return <section className="lav-panel ops-panel cashbook-panel">
    <header className="lav-panel-head"><div><h2>Cash book</h2></div><strong>{cashBook.projects.length} projects</strong></header>
    <div className="cashbook-table">
      <div className="cashbook-row head"><span>Project</span><span>Allocated budget</span><span>Used</span><span>Committed</span><span>Waiting</span><span>Available</span></div>
      {cashBook.projects.map(project => {
        const isOpen = project.projectId === openProjectId
        return <article className={isOpen ? 'open' : ''} key={project.projectId}>
          <button type="button" className="cashbook-row" aria-expanded={isOpen} onClick={() => setOpenProjectId(isOpen ? null : project.projectId)}>
            <span className="cashbook-project" data-label="Project"><b>{project.projectName}</b><i aria-hidden="true">{isOpen ? '−' : '+'}</i></span>
            <span data-label="Allocated budget"><b>{money(project.allocatedBudget)}</b></span>
            <span data-label="Used"><b>{money(project.totalUsed)}</b><small>{money(project.supplierPayments)} suppliers · {money(project.pettyCashSpent)} petty cash</small></span>
            <span data-label="Committed"><b>{money(project.openCommitments)}</b></span>
            <span data-label="Waiting"><b>{money(project.cashAwaitingAccountability)}</b><small>Accountability</small></span>
            <span className={project.budgetAvailable < 0 ? 'over' : ''} data-label="Available"><b>{money(project.budgetAvailable)}</b></span>
          </button>
        </article>
      })}
    </div>
    {openProject && <div className="ops-modal-wrap cashbook-modal-wrap" role="presentation">
      <button type="button" className="ops-modal-backdrop" aria-label="Close money use" onClick={() => setOpenProjectId(null)}/>
      <div className="cashbook-sheet cashbook-floating-card" role="dialog" aria-modal="true" aria-labelledby="cashbook-money-use-title">
        <header><div><span>{openProject.projectName} · latest {openProject.recentEntries.length} of {openProject.entryCount}</span><h3 id="cashbook-money-use-title">Money use</h3></div><button type="button" onClick={() => setOpenProjectId(null)}>Close</button></header>
        {openProject.recentEntries.length ? <div className="cashbook-entries">{openProject.recentEntries.map((entry, index) => <div className="cashbook-entry" key={`${entry.occurredAt}-${entry.entryType}-${index}`}>
          <time dateTime={entry.occurredAt}>{new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(entry.occurredAt))}</time>
          <span><b>{entry.title}</b><small>{entry.detail}</small></span>
          <span><b>{entry.entryType}</b><small>{entry.state}</small></span>
          <strong>{money(entry.amount)}</strong>
        </div>)}</div> : <Empty>No recorded use for this project.</Empty>}
      </div>
    </div>}
  </section>
}

function InvoiceCapture({ orders, receipts, invoices, onRun }: { orders: PurchaseOrder[]; receipts: GoodsReceipt[]; invoices: SupplierInvoice[]; onRun: (action: () => Promise<unknown>, text: string) => Promise<boolean> }) {
  const [form, setForm] = useState({ order: '', number: '', quantity: '', price: '', amount: '', document: '' })
  const available = orders.filter(order => {
    const ordered = order.lines[0]?.quantity ?? 0
    const accepted = invoiceEligibleQuantity(order, receipts)
    return accepted === ordered && !invoices.some(invoice => invoice.purchaseOrderId === order.id && !['Mismatch', 'Returned', 'Rejected'].includes(invoice.status))
  })
  const selected = orders.find(order => order.id === Number(form.order)); const line = selected?.lines[0]
  return <form className="lav-panel ops-form ops-invoice-form" onSubmit={event => { event.preventDefault(); void onRun(() => financeApi.createInvoice({ purchaseOrderId: Number(form.order), invoiceNumber: form.number, quantity: Number(form.quantity), unitPrice: Number(form.price), amount: Number(form.amount), documentReference: form.document || null }), 'Invoice captured for independent Finance review.').then(saved => { if (saved) setForm({ order: '', number: '', quantity: '', price: '', amount: '', document: '' }) }) }}><h2>Capture supplier invoice</h2><div className="ops-fields four"><label><span>Issued PO ready for invoice</span><select required value={form.order} onChange={e => { const order = orders.find(item => item.id === Number(e.target.value)); const nextLine = order?.lines[0]; const accepted = order ? invoiceEligibleQuantity(order, receipts) : 0; const unitPrice = nextLine?.unitPrice ?? 0; setForm({ order: e.target.value, number: '', document: '', quantity: accepted ? String(accepted) : '', price: unitPrice ? String(unitPrice) : '', amount: accepted && unitPrice ? (accepted * unitPrice).toFixed(2) : '' }) }}><option value="">Choose order</option>{available.map(order => { const accepted = invoiceEligibleQuantity(order, receipts); return <option value={order.id} key={order.id}>{order.supplierName} · {accepted} {order.lines[0]?.materialUnit} accepted</option> })}</select></label><label><span>Invoice number</span><input required value={form.number} onChange={e => setForm({ ...form, number: e.target.value })}/></label><label><span>Quantity {line ? `(${line.materialUnit})` : ''}</span><input type="number" min="0.001" step="0.001" required value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })}/></label><label><span>Unit price</span><input type="number" min="0.01" step="0.01" required value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}/></label><label><span>Invoice amount</span><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}/></label><label><span>Document reference</span><input value={form.document} onChange={e => setForm({ ...form, document: e.target.value })}/></label></div><button className="lav-button primary">Send to Finance</button></form>
}

function InvoiceCard({ invoice, technicalAcceptances, currentUser, run }: { invoice: SupplierInvoice; technicalAcceptances: TechnicalAcceptanceWorkItem[]; currentUser: CurrentUser; run: (action: () => Promise<unknown>, text: string) => Promise<boolean> }) {
  const role = currentUser.role
  const technicalStatus = invoice.requiresTechnicalAcceptance && invoice.technicalAcceptanceStatus === 'Rejected' ? 'Rejected' : 'NotRequired'
  const action = () => {
    if (role === 'Finance Officer' && invoice.status === 'PendingReview' && technicalStatus === 'Rejected') return <span className="ops-status rejected">Delivery rejected</span>
    if (role === 'Finance Officer' && invoice.status === 'PendingReview') return <button className="lav-button primary" onClick={() => void run(() => financeApi.reviewInvoice(invoice.id), 'Three-way match completed.')}>Run match</button>
    if (role === 'Supervisor' && invoice.status === 'ReadyForAuthorization' && invoice.reviewedByUserId !== currentUser.id) return <button className="lav-button primary" onClick={() => void run(() => financeApi.authorize(invoice.id), 'Payment authorized.')}>Authorize payment</button>
    if (role === 'CEO' && invoice.status === 'AwaitingCeoApproval') return <div className="ops-buttons"><button className="lav-button primary" onClick={() => void run(() => financeApi.ceoDecision(invoice.id, true, 'High-value exception approved after reviewing the complete evidence chain'), 'Exception approved.')}>Approve exception</button><button className="lav-button secondary" onClick={() => void run(() => financeApi.ceoDecision(invoice.id, false, 'High-value exception rejected by CEO'), 'Exception rejected.')}>Reject</button></div>
    return null
  }
  const technicalState = technicalStatus !== 'NotRequired' && <div className={`invoice-technical-state ${technicalStatus.toLowerCase()}`}>
    <b>Engineer check</b>
    <span>{invoice.technicalAcceptanceRejectedCount} {invoice.technicalAcceptanceRejectedCount === 1 ? 'delivery' : 'deliveries'} rejected</span>
  </div>
  return <article>
    <header><div><span>{invoice.projectName}</span><h3>{invoice.supplierName}</h3><small>Invoice {invoice.invoiceNumber}</small></div><b className={`ops-status ${invoice.status.toLowerCase()}`}>{invoice.status.replaceAll(/([A-Z])/g, ' $1').trim()}</b></header>
    <strong>{money(invoice.amount)}</strong>
    <p>{invoice.quantity} {invoice.materialUnit} of {invoice.materialName}</p>
    {technicalState}
    {technicalAcceptances.length > 0 && <div className="invoice-acceptance-files">{technicalAcceptances.map(item => item.technicalAcceptanceId && <EvidenceFiles key={item.technicalAcceptanceId} sourceType="GoodsReceiptTechnicalAcceptance" sourceId={item.technicalAcceptanceId} kind="Inspection" label={`Inspection files · ${item.receiptNumber}`} canUpload={false}/>)}</div>}
    {invoice.reviewedAt && <div className="ops-match"><span className={invoice.quantityMatches ? 'pass' : 'fail'}>Quantity {invoice.quantityMatches ? 'matches' : 'differs'}</span><span className={invoice.priceMatches ? 'pass' : 'fail'}>Price {invoice.priceMatches ? 'matches' : 'differs'}</span><span className={invoice.amountMatches ? 'pass' : 'fail'}>Total {invoice.amountMatches ? 'matches' : 'differs'}</span></div>}
    <EvidenceFiles sourceType="SupplierInvoice" sourceId={invoice.id} kind="Invoice" label="Invoice files" canUpload={role === 'Procurement Officer' && invoice.capturedByName === currentUser.fullName}/>
    <footer><small>Captured by {invoice.capturedByName} · {when(invoice.capturedAt)}</small>{action()}</footer>
  </article>
}

function FinancePaymentActions({ authorizations, run }: { authorizations: PaymentAuthorization[]; run: (action: () => Promise<unknown>, text: string) => Promise<boolean> }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [form, setForm] = useState({ method: 'BankTransfer', reference: '', evidence: '', cashAccount: '' })
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [cashAccountLoading, setCashAccountLoading] = useState(false)
  const [cashAccountError, setCashAccountError] = useState<string | null>(null)
  const selected = authorizations.find(item => item.id === selectedId)
  const selectedProjectId = selected?.projectId ?? null
  const unpaid = authorizations.filter(item => !item.isPaid)

  useEffect(() => {
    if (selectedProjectId === null) return
    const controller = new AbortController()
    cashAccountsApi.list(selectedProjectId, controller.signal)
      .then(setCashAccounts)
      .catch(cause => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setCashAccountError(messageOf(cause)) })
      .finally(() => { if (!controller.signal.aborted) setCashAccountLoading(false) })
    return () => controller.abort()
  }, [selectedProjectId])

  return <section className="lav-panel ops-panel">
    <header className="lav-panel-head"><div><span className="lav-kicker">READY TO PAY</span><h2>Authorized payments</h2></div></header>
    <div className="ops-issue-grid">
      {unpaid.map(item => (
        <article key={item.id}>
          <div><span>{item.projectName}</span><b>{item.supplierName}</b><strong>{money(item.amount)}</strong></div>
          <p>Authorized by {item.authorizedByName}</p>
          <button type="button" className="lav-button primary" onClick={() => { setCashAccounts([]); setCashAccountError(null); setCashAccountLoading(true); setSelectedId(item.id); setForm({ method: 'BankTransfer', reference: '', evidence: '', cashAccount: '' }) }}>Record payment</button>
        </article>
      ))}
      {unpaid.length === 0 && <Empty>No authorized payment is waiting.</Empty>}
    </div>
    {selected && <div className="ops-modal-wrap" role="presentation">
      <button type="button" className="ops-modal-backdrop" aria-label="Close payment form" onClick={() => setSelectedId(null)}/>
      <form className="lav-panel ops-form ops-modal" onSubmit={event => { event.preventDefault(); void run(() => financeApi.pay(selected.id, { method: form.method, externalReference: form.reference, evidenceReference: form.evidence.trim() || null, cashAccountId: form.cashAccount ? Number(form.cashAccount) : null }), `Payment recorded with external reference ${form.reference}.`).then(saved => { if (saved) setSelectedId(null) }) }}>
        <header><div><span className="lav-kicker">PAYMENT</span><h2>Record approved payment</h2><p>{selected.supplierName} · {selected.projectName}</p></div><button type="button" className="ops-modal-close" onClick={() => setSelectedId(null)}>×</button></header>
        <div className="ops-payment-lock"><span>Authorized amount</span><strong>{money(selected.amount)}</strong></div>
        {cashAccountError && <Notice tone="error">Cash accounts could not be loaded: {cashAccountError}</Notice>}
        <label><span>Cash account</span><select required={cashAccounts.length > 0} disabled={cashAccountLoading || Boolean(cashAccountError)} value={form.cashAccount} onChange={event => setForm({ ...form, cashAccount: event.target.value })}><option value="">{cashAccountLoading ? 'Loading accounts…' : cashAccounts.length ? 'Choose cash account' : 'No approved cash account'}</option>{cashAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {money(account.balance)}</option>)}</select></label>
        <label><span>Payment method</span><select value={form.method} onChange={event => setForm({ ...form, method: event.target.value })}><option value="BankTransfer">Bank transfer</option><option value="MPesa">M-Pesa</option><option value="Cheque">Cheque</option><option value="Cash">Cash</option></select></label>
        <label><span>External transaction reference</span><input required minLength={3} maxLength={100} value={form.reference} onChange={event => setForm({ ...form, reference: event.target.value })} placeholder="Bank, M-Pesa or cheque reference"/></label>
        <label><span>Evidence reference (optional)</span><input maxLength={500} value={form.evidence} onChange={event => setForm({ ...form, evidence: event.target.value })} placeholder="Receipt or confirmation file"/></label>
        <div className="ops-buttons"><button type="button" className="lav-button secondary" onClick={() => setSelectedId(null)}>Cancel</button><button className="lav-button primary" disabled={cashAccountLoading || Boolean(cashAccountError) || (cashAccounts.length > 0 && !form.cashAccount)}>Record payment</button></div>
      </form>
    </div>}
  </section>
}

export function LivePettyCashView({ currentUser }: { currentUser: CurrentUser }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<PettyCashRequest[]>([])
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [requestOpen, setRequestOpen] = useState(searchParams.get('new') === '1')
  const role = currentUser.role
  const sectionedPettyCash = role === 'Finance Officer' || role === 'Supervisor'
  const requestedView = searchParams.get('view')
  const view = requestedView === 'waiting' || requestedView === 'closed' ? requestedView : 'action'

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      everyPage<PettyCashRequest>(page => pettyCashApi.list(controller.signal, { page, pageSize: 100 })),
      role === 'Supervisor'
        ? Promise.all(currentUser.projects.map(project => projectsApi.getSummary(project.id, controller.signal)))
        : Promise.resolve([]),
    ]).then(([result, summaries]) => {
      setItems(result)
      setProjectSummaries(summaries)
      setError(null)
    }).catch(requestError => {
      if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) setError(messageOf(requestError))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [currentUser.projects, refresh, role])

  const run = async (action: () => Promise<unknown>, text: string) => {
    try { await action(); setNotice(text); setError(null); setRefresh(value => value + 1); return true }
    catch (requestError) { setError(messageOf(requestError)); return false }
  }

  const canAct = (item: PettyCashRequest) => {
    if (role === 'Finance Officer') return item.status === 'PendingFinanceApproval' || item.status === 'Approved' || item.status === 'ReconciliationSubmitted'
    if (role !== 'Supervisor' || item.requestedByUserId !== currentUser.id || item.status !== 'Disbursed') return false
    return true
  }
  const visibleItems = sectionedPettyCash ? items.filter(item => {
    const closed = item.status === 'Rejected' || item.status === 'Reconciled'
    if (view === 'action') return canAct(item)
    if (view === 'closed') return closed
    return !closed && !canAct(item)
  }) : items

  if (loading) return <Loading>Loading petty cash records…</Loading>
  return <div className="lav-view ops-view petty-cash-view">
    <header className="lav-page-head"><div><h1>Petty cash</h1></div>{role === 'Supervisor' && <button type="button" className="lav-button secondary" onClick={() => setRequestOpen(value => !value)}>{requestOpen ? 'Close form' : 'New request'}</button>}</header>
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
    {role === 'Supervisor' && requestOpen && <PettyCashRequestForm summaries={projectSummaries} run={run} onSaved={() => setRequestOpen(false)}/>}
    {sectionedPettyCash && <nav className="ops-action-nav petty-cash-section-nav" aria-label="Petty cash sections">
      <button type="button" className={view === 'action' ? 'active' : ''} aria-current={view === 'action' ? 'page' : undefined} onClick={() => setSearchParams({}, { replace: true })}>Needs action</button>
      <button type="button" className={view === 'waiting' ? 'active' : ''} aria-current={view === 'waiting' ? 'page' : undefined} onClick={() => setSearchParams({ view: 'waiting' }, { replace: true })}>Waiting</button>
      <button type="button" className={view === 'closed' ? 'active' : ''} aria-current={view === 'closed' ? 'page' : undefined} onClick={() => setSearchParams({ view: 'closed' }, { replace: true })}>Closed</button>
    </nav>}
    <section className="lav-panel ops-panel"><header className="lav-panel-head"><div><h2>{sectionedPettyCash ? view === 'action' ? 'Needs action' : view === 'waiting' ? 'Waiting' : 'Closed records' : 'Petty cash records'}</h2></div><strong>{visibleItems.length} records</strong></header>
      {visibleItems.length ? <div className="petty-cash-list">{visibleItems.map(item => <PettyCashCard key={item.id} item={item} currentUser={currentUser} run={run}/>)}</div> : <Empty>No petty cash record in this section.</Empty>}
    </section>
  </div>
}

function PettyCashRequestForm({ summaries, run, onSaved }: { summaries: ProjectSummary[]; run: (action: () => Promise<unknown>, text: string) => Promise<boolean>; onSaved: () => void }) {
  const [form, setForm] = useState({ projectId: '', costCodeId: '', purpose: '', amount: '', neededByDate: '' })
  const selected = summaries.find(item => item.project.id === Number(form.projectId))
  return <form className="lav-panel ops-form" onSubmit={event => { event.preventDefault(); void run(() => pettyCashApi.create({ projectId: Number(form.projectId), costCodeId: Number(form.costCodeId), purpose: form.purpose, amount: Number(form.amount), neededByDate: form.neededByDate }), 'Petty-cash request submitted.').then(saved => { if (saved) { setForm({ projectId: '', costCodeId: '', purpose: '', amount: '', neededByDate: '' }); onSaved() } }) }}>
    <h2>Request petty cash</h2><p>Maximum KES 100,000</p>
    <div className="ops-fields"><label><span>Project</span><select required value={form.projectId} onChange={event => setForm({ ...form, projectId: event.target.value, costCodeId: '' })}><option value="">Choose project</option>{summaries.map(item => <option key={item.project.id} value={item.project.id}>{item.project.name}</option>)}</select></label><label><span>Budget area</span><select required disabled={!selected} value={form.costCodeId} onChange={event => setForm({ ...form, costCodeId: event.target.value })}><option value="">Choose budget area</option>{selected?.costCodes.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label></div>
    <div className="ops-fields"><label><span>Amount</span><input type="number" min="1" max="100000" step="0.01" required value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })}/></label><label><span>Needed by</span><input type="date" required value={form.neededByDate} onChange={event => setForm({ ...form, neededByDate: event.target.value })}/></label></div>
    <label><span>Purpose of the money</span><input minLength={3} maxLength={500} required value={form.purpose} onChange={event => setForm({ ...form, purpose: event.target.value })} placeholder="What will this cash pay for?"/></label><button className="lav-button primary">Send to Finance</button>
  </form>
}

function PettyCashCard({ item, currentUser, run }: { item: PettyCashRequest; currentUser: CurrentUser; run: (action: () => Promise<unknown>, text: string) => Promise<boolean> }) {
  const [open, setOpen] = useState<'decision' | 'disburse' | 'confirm' | 'reconcile' | 'review' | null>(null)
  const role = currentUser.role
  return <article className="petty-cash-card">
    <header><div><span>{item.projectName}</span><small className="petty-cash-purpose-label">Purpose</small><h3>{item.purpose}</h3><small>{item.costCode} · requested by {item.requestedByName}</small></div><b className={`ops-status ${item.status.toLowerCase()}`}>{item.status.replaceAll(/([A-Z])/g, ' $1').trim()}</b></header>
    <div className="petty-cash-facts"><span>Requested<strong>{money(item.amountRequested)}</strong></span><span>Approved<strong>{item.amountApproved ? money(item.amountApproved) : 'Waiting'}</strong></span><span>Needed<strong>{new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${item.neededByDate}T00:00:00`))}</strong></span><span>Evidence<strong>{item.latestReconciliation?.evidenceReference ?? item.disbursement?.evidenceReference ?? 'Waiting'}</strong></span></div>
    {item.disbursement && <p className="petty-cash-proof">Handed to {item.disbursement.recipientName}: {money(item.disbursement.amount)} by {item.disbursement.method} · {item.disbursement.externalReference}</p>}
    {item.receiptConfirmation && <p className="petty-cash-proof">Receipt confirmed by {item.receiptConfirmation.confirmedByName} · {when(item.receiptConfirmation.confirmedAt)}</p>}
    {item.latestReconciliation && <p className="petty-cash-proof">Accounted: {money(item.latestReconciliation.amountSpent)} spent + {money(item.latestReconciliation.amountReturned)} returned · {item.latestReconciliation.status}</p>}
    {(item.disbursement || item.latestReconciliation) && <div className="petty-cash-evidence">
      {item.disbursement && <EvidenceFiles sourceType="PettyCashDisbursement" sourceId={item.disbursement.id} kind="PaymentProof" label="Handover files" canUpload={role === 'Finance Officer' && item.disbursement.disbursedByUserId === currentUser.id}/>}
      {item.latestReconciliation && <EvidenceFiles sourceType="PettyCashReconciliation" sourceId={item.latestReconciliation.id} kind="Receipt" label="Receipt files" canUpload={role === 'Supervisor' && item.latestReconciliation.submittedByName === currentUser.fullName}/>}
    </div>}
    <div className="ops-buttons petty-cash-actions">
      {role === 'Finance Officer' && item.status === 'PendingFinanceApproval' && <button className="lav-button primary" onClick={() => setOpen('decision')}>Review request</button>}
      {role === 'Finance Officer' && item.status === 'Approved' && <button className="lav-button primary" onClick={() => setOpen('disburse')}>Record handover</button>}
      {role === 'Supervisor' && item.status === 'Disbursed' && item.requestedByUserId === currentUser.id && !item.receiptConfirmation && <button className="lav-button primary" onClick={() => setOpen('confirm')}>Confirm receipt</button>}
      {role === 'Supervisor' && item.status === 'Disbursed' && item.requestedByUserId === currentUser.id && item.receiptConfirmation && <button className="lav-button primary" onClick={() => setOpen('reconcile')}>Submit receipts</button>}
      {role === 'Finance Officer' && item.status === 'ReconciliationSubmitted' && <button className="lav-button primary" onClick={() => setOpen('review')}>Review evidence</button>}
    </div>
    {open === 'decision' && <PettyCashDecision item={item} close={() => setOpen(null)} run={run}/>}
    {open === 'disburse' && <PettyCashDisbursementForm item={item} close={() => setOpen(null)} run={run}/>}
    {open === 'confirm' && <PettyCashReceiptForm item={item} close={() => setOpen(null)} run={run}/>}
    {open === 'reconcile' && <PettyCashReconciliationForm item={item} close={() => setOpen(null)} run={run}/>}
    {open === 'review' && <PettyCashReview item={item} close={() => setOpen(null)} run={run}/>}
  </article>
}

function PettyCashPurpose({ item }: { item: PettyCashRequest }) {
  return <div className="petty-cash-purpose"><span>Purpose</span><strong>{item.purpose}</strong></div>
}

function PettyCashDecision({ item, close, run }: { item: PettyCashRequest; close: () => void; run: (action: () => Promise<unknown>, text: string) => Promise<boolean> }) {
  const [amount, setAmount] = useState(String(item.amountRequested)); const [notes, setNotes] = useState('')
  const decide = (approve: boolean) => void run(() => pettyCashApi.decide(item.id, { approve, amountApproved: approve ? Number(amount) : null, notes }), approve ? 'Petty cash approved.' : 'Petty cash rejected.').then(saved => { if (saved) close() })
  return <div className="petty-cash-inline"><PettyCashPurpose item={item}/><label><span>Approved amount</span><input type="number" min="1" max={item.amountRequested} step="0.01" value={amount} onChange={event => setAmount(event.target.value)}/></label><label><span>Decision notes</span><input required minLength={3} value={notes} onChange={event => setNotes(event.target.value)}/></label><div className="ops-buttons"><button className="lav-button secondary" disabled={notes.trim().length < 3} onClick={() => decide(false)}>Reject</button><button className="lav-button primary" disabled={notes.trim().length < 3} onClick={() => decide(true)}>Approve</button><button className="lav-button secondary" onClick={close}>Cancel</button></div></div>
}

function PettyCashDisbursementForm({ item, close, run }: { item: PettyCashRequest; close: () => void; run: (action: () => Promise<unknown>, text: string) => Promise<boolean> }) {
  const [form, setForm] = useState({ method: 'MPesa', reference: '', recipient: item.requestedByName, acknowledgement: '', evidence: '', cashAccount: '' })
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([])
  const [cashAccountLoading, setCashAccountLoading] = useState(true)
  const [cashAccountError, setCashAccountError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    cashAccountsApi.list(item.projectId, controller.signal)
      .then(setCashAccounts)
      .catch(cause => { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setCashAccountError(messageOf(cause)) })
      .finally(() => { if (!controller.signal.aborted) setCashAccountLoading(false) })
    return () => controller.abort()
  }, [item.projectId])

  return <form className="petty-cash-inline" onSubmit={event => { event.preventDefault(); void run(() => pettyCashApi.disburse(item.id, { method: form.method, externalReference: form.reference, recipientName: form.recipient, recipientAcknowledgementReference: form.acknowledgement, evidenceReference: form.evidence, cashAccountId: form.cashAccount ? Number(form.cashAccount) : null }), 'Petty-cash handover recorded.').then(saved => { if (saved) close() }) }}>
    <PettyCashPurpose item={item}/>
    {cashAccountError && <Notice tone="error">Cash accounts could not be loaded: {cashAccountError}</Notice>}
    <label><span>Cash account</span><select required={cashAccounts.length > 0} disabled={cashAccountLoading || Boolean(cashAccountError)} value={form.cashAccount} onChange={event => setForm({ ...form, cashAccount: event.target.value })}><option value="">{cashAccountLoading ? 'Loading accounts…' : cashAccounts.length ? 'Choose cash account' : 'No approved cash account'}</option>{cashAccounts.map(account => <option key={account.id} value={account.id}>{account.name} · {money(account.balance)}</option>)}</select></label>
    <div className="ops-fields"><label><span>Method</span><select value={form.method} onChange={event => setForm({ ...form, method: event.target.value })}><option>MPesa</option><option>BankTransfer</option><option>Cheque</option><option>Cash</option></select></label><label><span>Payment reference</span><input required minLength={3} value={form.reference} onChange={event => setForm({ ...form, reference: event.target.value })}/></label></div>
    <label><span>Recipient</span><input required minLength={3} value={form.recipient} onChange={event => setForm({ ...form, recipient: event.target.value })}/></label>
    <label><span>Recipient acknowledgement</span><input required minLength={3} value={form.acknowledgement} onChange={event => setForm({ ...form, acknowledgement: event.target.value })} placeholder="Signed voucher, PIN or message reference"/></label>
    <label><span>Cash-out evidence</span><input required minLength={3} value={form.evidence} onChange={event => setForm({ ...form, evidence: event.target.value })}/></label>
    <div className="ops-buttons"><button className="lav-button secondary" type="button" onClick={close}>Cancel</button><button className="lav-button primary" disabled={cashAccountLoading || Boolean(cashAccountError) || (cashAccounts.length > 0 && !form.cashAccount)}>Record handover</button></div>
  </form>
}

function PettyCashReceiptForm({ item, close, run }: { item: PettyCashRequest; close: () => void; run: (action: () => Promise<unknown>, text: string) => Promise<boolean> }) {
  const [notes, setNotes] = useState('')
  const amount = item.disbursement?.amount ?? 0
  return <form className="petty-cash-inline" onSubmit={event => { event.preventDefault(); void run(() => pettyCashApi.confirmReceipt(item.id, { amountReceived: amount, notes: notes.trim() || null }), 'Receipt confirmed.').then(saved => { if (saved) close() }) }}><PettyCashPurpose item={item}/><p>Amount received: <strong>{money(amount)}</strong></p><label><span>Note (optional)</span><input maxLength={500} value={notes} onChange={event => setNotes(event.target.value)}/></label><div className="ops-buttons"><button className="lav-button secondary" type="button" onClick={close}>Cancel</button><button className="lav-button primary">Confirm receipt</button></div></form>
}

function PettyCashReconciliationForm({ item, close, run }: { item: PettyCashRequest; close: () => void; run: (action: () => Promise<unknown>, text: string) => Promise<boolean> }) {
  const total = item.disbursement?.amount ?? 0; const [form, setForm] = useState({ spent: '', returned: '', evidence: '', returnReference: '', notes: '' })
  return <form className="petty-cash-inline" onSubmit={event => { event.preventDefault(); void run(() => pettyCashApi.reconcile(item.id, { amountSpent: Number(form.spent), amountReturned: Number(form.returned), evidenceReference: form.evidence, returnReference: form.returnReference || null, notes: form.notes }), 'Receipts and returned balance sent to Finance.').then(saved => { if (saved) close() }) }}><PettyCashPurpose item={item}/><p>Account for the complete {money(total)} disbursement.</p><div className="ops-fields"><label><span>Spent</span><input type="number" min="0" max={total} step="0.01" required value={form.spent} onChange={event => setForm({ ...form, spent: event.target.value })}/></label><label><span>Returned</span><input type="number" min="0" max={total} step="0.01" required value={form.returned} onChange={event => setForm({ ...form, returned: event.target.value })}/></label></div><label><span>Receipt bundle reference</span><input required minLength={3} value={form.evidence} onChange={event => setForm({ ...form, evidence: event.target.value })}/></label><label><span>Cash-return reference</span><input value={form.returnReference} onChange={event => setForm({ ...form, returnReference: event.target.value })}/></label><label><span>How the money was used</span><input required minLength={3} maxLength={1000} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })}/></label><div className="ops-buttons"><button className="lav-button secondary" type="button" onClick={close}>Cancel</button><button className="lav-button primary">Submit accountability</button></div></form>
}

function PettyCashReview({ item, close, run }: { item: PettyCashRequest; close: () => void; run: (action: () => Promise<unknown>, text: string) => Promise<boolean> }) {
  const [notes, setNotes] = useState(''); const decide = (approve: boolean) => void run(() => pettyCashApi.reviewReconciliation(item.id, { approve, notes }), approve ? 'Petty cash reconciled and closed.' : 'Accountability returned for correction.').then(saved => { if (saved) close() })
  return <div className="petty-cash-inline"><PettyCashPurpose item={item}/><p>{item.latestReconciliation?.evidenceReference} · {money(item.latestReconciliation?.amountSpent ?? 0)} spent · {money(item.latestReconciliation?.amountReturned ?? 0)} returned</p>{item.latestReconciliation?.notes && <div className="petty-cash-purpose"><span>Recorded use</span><strong>{item.latestReconciliation.notes}</strong></div>}<label><span>Review notes</span><input minLength={3} required value={notes} onChange={event => setNotes(event.target.value)}/></label><div className="ops-buttons"><button className="lav-button secondary" disabled={notes.trim().length < 3} onClick={() => decide(false)}>Return</button><button className="lav-button primary" disabled={notes.trim().length < 3} onClick={() => decide(true)}>Reconcile and close</button><button className="lav-button secondary" onClick={close}>Cancel</button></div></div>
}

function controlEventLabel(item: ControlEvent) {
  const labels: Record<string, string> = {
    'Requisition:Requested': 'Material request created',
    'Requisition:StockReplenishmentRequested': 'Store restock requested',
    'Requisition:Revised': 'Material request revised',
    'Requisition:TechnicalCheckVerified': 'Material request verified',
    'Requisition:TechnicalRevisionRequired': 'Material request returned by Engineer',
    'Requisition:SupervisorApproved': 'Material request approved',
    'Requisition:SupervisorRejected': 'Material request rejected',
    'Requisition:SupervisorReturnedForRevision': 'Material request returned by Supervisor',
    'SourcingRound:Created': 'Supplier sourcing opened',
    'SourcingRound:Awarded': 'Supplier quotation awarded',
    'SourcingRound:AwardCancelled': 'Supplier quotation award cancelled',
    'SourcingRound:Closed': 'Supplier sourcing closed',
    'SourcingRound:Cancelled': 'Supplier sourcing cancelled',
    'SourcingRound:Reopened': 'Supplier sourcing reopened',
    'PurchaseOrder:Created': 'Purchase order created',
    'PurchaseOrder:Submitted': 'Purchase order submitted',
    'PurchaseOrder:Approved': 'Purchase order approved',
    'PurchaseOrder:ReturnedToDraft': 'Purchase order returned for correction',
    'PurchaseOrder:Corrected': 'Purchase order corrected',
    'PurchaseOrder:Rejected': 'Purchase order rejected',
    'PurchaseOrder:Cancelled': 'Purchase order cancelled',
    'PurchaseOrder:Issued': 'Purchase order sent to supplier',
    'GoodsReceipt:GoodsReceived': 'Delivery received into store',
    'GoodsReceiptTechnicalAcceptance:DeliveryTechnicallyAccepted': 'Engineer accepted delivered material',
    'GoodsReceiptTechnicalAcceptance:DeliveryTechnicallyRejected': 'Engineer rejected delivered material',
    'MaterialIssue:MaterialIssued': 'Material issued to Foreman',
    'MaterialIssue:MaterialReceiptConfirmed': 'Foreman confirmed material received',
    'MaterialIssue:MaterialReceiptDisputed': 'Foreman disputed material received',
    'MaterialUsage:MaterialUsed': 'Material use recorded',
    'MaterialUsage:MaterialWastageRecorded': 'Material wastage recorded',
    'SupplierInvoice:InvoiceCaptured': 'Supplier invoice recorded',
    'SupplierInvoice:InvoiceMatched': 'Supplier invoice matched',
    'SupplierInvoice:InvoiceMatchedCeoException': 'Supplier invoice sent for CEO decision',
    'SupplierInvoice:InvoiceMismatch': 'Supplier invoice mismatch recorded',
    'SupplierInvoice:CeoExceptionApproved': 'Supplier invoice approved by CEO',
    'SupplierInvoice:CeoExceptionRejected': 'Supplier invoice rejected by CEO',
    'PaymentAuthorization:PaymentAuthorized': 'Supplier payment authorized',
    'Payment:PaymentExecuted': 'Supplier payment completed',
    'StockTransfer:TransferRequested': 'Store transfer requested',
    'StockTransfer:TransferDispatched': 'Store transfer dispatched',
    'StockTransfer:TransferReceived': 'Store transfer received',
    'StockTransfer:TransferDisputed': 'Store transfer disputed',
    'StockCount:StockCountSubmitted': 'Physical stock count submitted',
    'StockCount:StockCountApproved': 'Physical stock count approved',
    'StockCount:StockCountRejected': 'Physical stock count rejected',
    'PettyCashRequest:PettyCashRequested': 'Petty cash requested',
    'PettyCashRequest:PettyCashApproved': 'Petty cash approved',
    'PettyCashRequest:PettyCashRejected': 'Petty cash rejected',
    'PettyCashDisbursement:PettyCashDisbursed': 'Petty cash handed over',
    'PettyCashReceiptConfirmation:PettyCashReceiptConfirmed': 'Petty cash receipt confirmed',
    'PettyCashReconciliation:PettyCashAccountabilitySubmitted': 'Petty cash receipts submitted',
    'PettyCashReconciliation:PettyCashReconciled': 'Petty cash reconciled',
    'PettyCashReconciliation:PettyCashAccountabilityReturned': 'Petty cash receipts returned for correction',
  }
  return labels[`${item.entityType}:${item.eventType}`]
    ?? `${item.entityType.replaceAll(/([A-Z])/g, ' $1').trim()} ${item.eventType.replaceAll(/([A-Z])/g, ' $1').trim().toLowerCase()}`
}

function controlEventMaterial(item: ControlEvent) {
  const eventQuantity = item.eventQuantity ?? item.requestedQuantity
  if (!item.materialName || !item.materialUnit || eventQuantity === null) return null
  const quantity = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 3 }).format(eventQuantity)
  return `${quantity} ${item.materialUnit} of ${item.materialName}`
}

function controlRecordTitle(item: ControlEvent) {
  if (item.materialName) return item.materialName
  if (item.entityType.startsWith('PettyCash')) return 'Petty cash'
  if (item.entityType === 'StockTransfer') return 'Store transfer'
  if (item.entityType === 'StockCount') return 'Physical stock count'
  return item.entityType.replaceAll(/([A-Z])/g, ' $1').trim()
}

function controlEventEvidence(item: ControlEvent) {
  const sources: Record<string, { sourceType: string; kind: string }> = {
    GoodsReceipt: { sourceType: 'GoodsReceipt', kind: 'DeliveryNote' },
    GoodsReceiptTechnicalAcceptance: { sourceType: 'GoodsReceiptTechnicalAcceptance', kind: 'Inspection' },
    MaterialUsage: { sourceType: 'MaterialUsageRecord', kind: 'Photo' },
    SupplierInvoice: { sourceType: 'SupplierInvoice', kind: 'Invoice' },
    Payment: { sourceType: 'Payment', kind: 'PaymentProof' },
    PettyCashDisbursement: { sourceType: 'PettyCashDisbursement', kind: 'PaymentProof' },
    PettyCashReconciliation: { sourceType: 'PettyCashReconciliation', kind: 'Receipt' },
    OpeningPositionBatch: { sourceType: 'OpeningPositionBatch', kind: 'Other' },
    MaterialReturn: { sourceType: 'MaterialReturn', kind: 'Photo' },
    MaterialReturnReceipt: { sourceType: 'MaterialReturnReceipt', kind: 'Photo' },
    MaterialIssueDisputeResolution: { sourceType: 'MaterialIssueDisputeResolution', kind: 'Photo' },
    MaterialCustodyCloseout: { sourceType: 'MaterialCustodyCloseout', kind: 'Photo' },
    ControlledCorrection: { sourceType: 'ControlledCorrection', kind: 'Other' },
  }
  return sources[item.entityType] ?? null
}

function keyControlMilestones(items: ControlEvent[]) {
  const ordered = [...items].sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())
  const findFirst = (matches: (item: ControlEvent) => boolean) => ordered.find(matches)
  const findLast = (matches: (item: ControlEvent) => boolean) => [...ordered].reverse().find(matches)
  const candidates = [
    findFirst(item => item.entityType === 'Requisition' && ['Requested', 'StockReplenishmentRequested'].includes(item.eventType)),
    findLast(item => item.entityType === 'Requisition' && item.eventType === 'SupervisorApproved'),
    findLast(item => (item.entityType === 'PurchaseOrder' && ['Approved', 'Issued'].includes(item.eventType)) || (item.entityType === 'SourcingRound' && item.eventType === 'Awarded')),
    findLast(item => (item.entityType === 'GoodsReceipt' && item.eventType === 'GoodsReceived') || (item.entityType === 'MaterialIssue' && item.eventType === 'MaterialIssued')),
    findLast(item => item.entityType === 'GoodsReceiptTechnicalAcceptance' && ['DeliveryTechnicallyAccepted', 'DeliveryTechnicallyRejected'].includes(item.eventType)),
    findLast(item => item.entityType === 'MaterialUsage' && ['MaterialUsed', 'MaterialWastageRecorded'].includes(item.eventType)),
    findLast(item => (item.entityType === 'Payment' && item.eventType === 'PaymentExecuted') || (item.entityType === 'PaymentAuthorization' && item.eventType === 'PaymentAuthorized')),
  ].filter((item): item is ControlEvent => Boolean(item))

  if (candidates.length > 0) return [...new Map(candidates.map(item => [`${item.entityType}:${item.entityId}:${item.sequenceNumber}`, item])).values()]
  return ordered.slice(0, 6)
}

export function LiveAuditView() {
  const [events, setEvents] = useState<ControlEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projectFilter, setProjectFilter] = useState('')
  const [selectedChainKey, setSelectedChainKey] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    everyPage<ControlEvent>(page => financeApi.controlEvents({ page, pageSize: 100 }, controller.signal))
      .then(result => { setEvents(result); setError(null) })
      .catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setError(messageOf(error))
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (selectedChainKey === null) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedChainKey(null) }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [selectedChainKey])

  const projects = useMemo(() => {
    const options = new Map<number, string>()
    events.forEach(event => options.set(event.projectId, event.projectName))
    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [events])
  const chains = useMemo(() => {
    const grouped = new Map<string, ControlEvent[]>()
    events
      .filter(event => !projectFilter || event.projectId === Number(projectFilter))
      .forEach(event => grouped.set(event.chainKey, [...(grouped.get(event.chainKey) ?? []), event]))
    return [...grouped.entries()]
      .map(([key, items]) => {
        const ordered = [...items].sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())
        return { key, ordered, first: ordered[0], latest: ordered[ordered.length - 1] }
      })
      .sort((left, right) => new Date(right.latest.occurredAt).getTime() - new Date(left.latest.occurredAt).getTime())
  }, [events, projectFilter])
  const selectedChain = chains.find(chain => chain.key === selectedChainKey)

  return <div className="lav-view ops-view">
    <header className="lav-page-head"><div><h1>Complete chain</h1></div>{!loading && <span className="lav-count-chip">{chains.length} records</span>}</header>
    {error && <Notice tone="error">{error}</Notice>}
    {loading ? <Loading>Loading control records…</Loading> : <>
      <div className="audit-record-toolbar">
        <label><span>Project</span><select value={projectFilter} onChange={event => setProjectFilter(event.currentTarget.value)}><option value="">All projects</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      </div>
      <section className="lav-panel audit-chain-register" aria-label="Control records">
        <div className="audit-chain-row head" aria-hidden="true"><span>Record</span><span>Project</span><span>Current stage</span><span>Last activity</span></div>
        {chains.map(chain => {
          const material = chain.ordered.map(controlEventMaterial).find(Boolean)
          return <button className="audit-chain-row" type="button" key={chain.key} onClick={() => setSelectedChainKey(chain.key)}>
            <span data-label="Record"><strong>{controlRecordTitle(chain.first)}</strong><small>{material ?? `${chain.ordered.length} recorded events`}</small></span>
            <span data-label="Project"><strong>{chain.first.projectName}</strong></span>
            <span data-label="Current stage"><strong>{controlEventLabel(chain.latest)}</strong></span>
            <span data-label="Last activity"><time>{when(chain.latest.occurredAt)}</time><i aria-hidden="true">Open →</i></span>
          </button>
        })}
        {!chains.length && !error && <Empty>No records found.</Empty>}
      </section>
    </>}

    {selectedChain && (() => {
      const material = selectedChain.ordered.map(controlEventMaterial).find(Boolean)
      const milestones = keyControlMilestones(selectedChain.ordered)
      return <div className="ops-modal-wrap" role="presentation">
        <button type="button" className="ops-modal-backdrop" aria-label="Close record" onClick={() => setSelectedChainKey(null)}/>
        <section className="lav-panel ops-panel ops-record-card audit-chain-modal" role="dialog" aria-modal="true" aria-labelledby="audit-chain-title">
          <header className="ops-record-summary audit-chain-modal-head">
            <div>
              <span>{selectedChain.first.projectName}</span>
              <h2 id="audit-chain-title">{controlRecordTitle(selectedChain.first)}</h2>
              {material && <p>{material}</p>}
            </div>
            <div className="audit-chain-modal-controls">
              <div className="ops-record-status">
                <span>Current stage</span>
                <strong>{controlEventLabel(selectedChain.latest)}</strong>
                <small>{when(selectedChain.latest.occurredAt)}</small>
              </div>
              <button type="button" onClick={() => setSelectedChainKey(null)}>Close</button>
            </div>
          </header>

          <section className="ops-milestone-section">
            <h3>Key milestones</h3>
            <div className="ops-milestones">
              {milestones.map((item, index) => <article key={`${item.entityType}-${item.entityId}-${item.sequenceNumber}`}>
                <i>{index + 1}</i>
                <div>
                  <strong>{controlEventLabel(item)}</strong>
                  <span>{item.actorRole} · {when(item.occurredAt)}</span>
                </div>
              </article>)}
            </div>
          </section>

          <details className="ops-audit-details">
            <summary><span>Full audit history</span><strong>{selectedChain.ordered.length} events</strong></summary>
            <div className="ops-timeline">
              {selectedChain.ordered.map((item, index) => {
                const eventMaterial = controlEventMaterial(item)
                const evidence = controlEventEvidence(item)
                return <article key={`${item.entityType}-${item.entityId}-${item.sequenceNumber}`}>
                  <i>{index + 1}</i>
                  <div>
                    <span>{item.actorRole} · {item.actorName}</span>
                    <b>{controlEventLabel(item)}{eventMaterial ? `: ${eventMaterial}` : ''}</b>
                    {evidence && <EvidenceFiles sourceType={evidence.sourceType} sourceId={item.entityId} kind={evidence.kind} label="Files" canUpload={false}/>}
                  </div>
                  <time>{when(item.occurredAt)}</time>
                </article>
              })}
            </div>
          </details>
        </section>
      </div>
    })()}
  </div>
}
