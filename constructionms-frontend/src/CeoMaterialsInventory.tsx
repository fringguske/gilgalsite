import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ApiError,
  financeApi,
  inventoryApi,
  type ControlEvent,
  type CurrentUser,
  type GoodsReceipt,
  type MaterialIssue,
  type MaterialReturn,
  type StockBalance,
  type StockCount,
  type StockLedgerEntry,
  type StockTransfer,
} from './api'
import './ceo-materials-inventory.css'
import { EvidenceFiles } from './EvidenceReferenceField'

type InventoryTab = 'overview' | 'ledger' | 'movements' | 'exceptions'
type StockState = 'In stock' | 'Low stock' | 'Out of stock'

type MaterialPosition = {
  materialId: number
  materialName: string
  category: string
  unit: string
  inStore: number
  siteCustody: number
  inTransit: number
  reorderLevel: number
  totalControlled: number
  status: StockState
}

type MovementContext = {
  entry: StockLedgerEntry
  chainKey: string | null
  action: string
  route: string
}

type Props = {
  currentUser: CurrentUser
  balances: StockBalance[]
  ledger: StockLedgerEntry[]
  issues: MaterialIssue[]
  transfers: StockTransfer[]
  counts: StockCount[]
  receipts: GoodsReceipt[]
  returns: MaterialReturn[]
  onChanged: (message: string) => void
}

function number(value: number) {
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 3 }).format(value)
}

function quantity(value: number, unit: string) {
  return `${number(value)} ${unit}`
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

function documentReference(entry: StockLedgerEntry) {
  const prefix = {
    MaterialIssue: 'MIV',
    GoodsReceipt: 'GRN',
    StockTransfer: 'TRF',
    StockCount: 'CNT',
    MaterialReturn: 'MRT',
  }[entry.referenceType] ?? entry.referenceNumber.split('-')[0] ?? 'MOV'
  return `${prefix}-${String(entry.referenceId).padStart(4, '0')}`
}

function inputDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function custodyAmount(issue: MaterialIssue) {
  return issue.status === 'AwaitingConfirmation'
    ? issue.quantityIssued
    : issue.unaccountedQuantity
}

function materialPositions(
  balances: StockBalance[],
  issues: MaterialIssue[],
  transfers: StockTransfer[],
  ledger: StockLedgerEntry[],
) {
  const ids = new Set<number>()
  balances.forEach(item => ids.add(item.materialId))
  issues.forEach(item => ids.add(item.materialId))
  transfers.forEach(item => ids.add(item.materialId))
  ledger.forEach(item => ids.add(item.materialId))

  return [...ids].map(materialId => {
    const balance = balances.find(item => item.materialId === materialId)
    const issue = issues.find(item => item.materialId === materialId)
    const transfer = transfers.find(item => item.materialId === materialId)
    const movement = ledger.find(item => item.materialId === materialId)
    const materialName = balance?.materialName ?? issue?.materialName ?? transfer?.materialName ?? movement?.materialName ?? 'Material'
    const unit = balance?.unit ?? issue?.materialUnit ?? transfer?.materialUnit ?? movement?.unit ?? 'units'
    const inStore = balances.filter(item => item.materialId === materialId).reduce((sum, item) => sum + item.quantityOnHand, 0)
    const siteCustody = issues.filter(item => item.materialId === materialId).reduce((sum, item) => sum + custodyAmount(item), 0)
    const inTransit = transfers.filter(item => item.materialId === materialId && item.status === 'InTransit').reduce((sum, item) => sum + item.quantity, 0)
    const reorderLevel = Math.max(0, ...balances.filter(item => item.materialId === materialId).map(item => item.reorderLevel))
    const status: StockState = inStore <= 0 ? 'Out of stock' : inStore <= reorderLevel ? 'Low stock' : 'In stock'
    return {
      materialId,
      materialName,
      category: balance?.category ?? 'Other',
      unit,
      inStore,
      siteCustody,
      inTransit,
      reorderLevel,
      totalControlled: inStore + siteCustody + inTransit,
      status,
    }
  }).sort((a, b) => a.materialName.localeCompare(b.materialName))
}

function movementContext(
  entry: StockLedgerEntry,
  issues: MaterialIssue[],
  transfers: StockTransfer[],
  counts: StockCount[],
  receipts: GoodsReceipt[],
  returns: MaterialReturn[],
): MovementContext {
  const issue = entry.referenceType === 'MaterialIssue'
    ? issues.find(item => item.id === entry.referenceId)
    : undefined
  const transfer = entry.referenceType === 'StockTransfer'
    ? transfers.find(item => item.id === entry.referenceId)
    : undefined
  const count = entry.referenceType === 'StockCount'
    ? counts.find(item => item.id === entry.referenceId)
    : undefined
  const receipt = entry.referenceType === 'GoodsReceipt'
    ? receipts.find(item => item.id === entry.referenceId)
    : undefined
  const materialReturn = entry.referenceType === 'MaterialReturn'
    ? returns.find(item => item.id === entry.referenceId)
    : undefined
  const returnedIssue = materialReturn
    ? issues.find(item => item.id === materialReturn.materialIssueId)
    : undefined
  if (issue) return {
    entry,
    chainKey: `REQ-${issue.requisitionId}`,
    action: `Issued to ${issue.issuedToName}`,
    route: `${entry.projectName} Store → ${issue.issuedToName}`,
  }
  if (receipt) return {
    entry,
    chainKey: `REQ-${receipt.requisitionId}`,
    action: entry.movementType === 'TechnicalAcceptance'
      ? `Accepted by Engineer ${entry.actorName}`
      : `Received by ${receipt.receivedByName}`,
    route: `${receipt.supplierName} → ${entry.projectName} Store`,
  }
  if (transfer) return {
    entry,
    chainKey: `TRF-${transfer.id}`,
    action: entry.movementType === 'TransferOut'
      ? 'Transfer dispatched'
      : `Transfer received by ${transfer.receivedByName ?? 'receiving Storekeeper'}`,
    route: `${transfer.fromProjectName} Store → ${transfer.toProjectName} Store`,
  }
  if (count) return {
    entry,
    chainKey: `CNT-${count.id}`,
    action: 'Count adjusted',
    route: `${entry.projectName} Store`,
  }
  if (materialReturn) return {
    entry,
    chainKey: returnedIssue ? `REQ-${returnedIssue.requisitionId}` : null,
    action: `Returned by ${materialReturn.returnedByName}`,
    route: `${materialReturn.returnedByName} → ${entry.projectName} Store`,
  }
  return {
    entry,
    chainKey: null,
    action: entry.movementType.replaceAll(/([A-Z])/g, ' $1').trim(),
    route: `${entry.projectName} Store`,
  }
}

export function CeoMaterialsInventory(props: Props) {
  const { currentUser, balances, ledger, issues, transfers, counts, receipts, returns, onChanged } = props
  const [tab, setTab] = useState<InventoryTab>('overview')
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null)
  const [auditMovement, setAuditMovement] = useState<MovementContext | null>(null)
  const [resolveTransfer, setResolveTransfer] = useState<StockTransfer | null>(null)
  const now = useMemo(() => new Date(), [])
  const [fromDate, setFromDate] = useState(inputDate(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [toDate, setToDate] = useState(inputDate(now))
  const [projectId, setProjectId] = useState('all')
  const [category, setCategory] = useState('all')
  const [stockStatus, setStockStatus] = useState('all')

  const positions = useMemo(
    () => materialPositions(balances, issues, transfers, ledger),
    [balances, issues, transfers, ledger],
  )
  const contexts = useMemo(
    () => [...ledger]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.id - a.id)
      .map(entry => movementContext(entry, issues, transfers, counts, receipts, returns)),
    [ledger, issues, transfers, counts, receipts, returns],
  )
  const selected = positions.find(item => item.materialId === selectedMaterialId) ?? null

  useEffect(() => {
    if (!selectedMaterialId && !auditMovement && !resolveTransfer) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (auditMovement) setAuditMovement(null)
      else if (resolveTransfer) setResolveTransfer(null)
      else setSelectedMaterialId(null)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [auditMovement, resolveTransfer, selectedMaterialId])

  const pendingHandovers = issues.filter(item => item.status === 'AwaitingConfirmation')
  const countDifferences = counts.filter(item => item.status === 'AwaitingReview' && item.variance !== 0)
  const disputedTransfers = transfers.filter(item => item.status === 'Disputed')
  const categories = [...new Set(positions.map(item => item.category))].sort()

  const safeFromDate = fromDate || inputDate(new Date(now.getFullYear(), now.getMonth(), 1))
  const safeToDate = toDate || inputDate(now)
  const from = new Date(`${safeFromDate}T00:00:00`)
  const toExclusive = new Date(`${safeToDate}T00:00:00`)
  toExclusive.setDate(toExclusive.getDate() + 1)
  const scopedLedger = ledger.filter(item => projectId === 'all' || item.projectId === Number(projectId))
  const scopedIssues = issues.filter(item => projectId === 'all' || item.projectId === Number(projectId))
  const scopedMaterialIds = new Set([
    ...scopedLedger.map(item => item.materialId),
    ...scopedIssues.map(item => item.materialId),
    ...balances.filter(item => projectId === 'all' || item.projectId === Number(projectId)).map(item => item.materialId),
  ])
  const ledgerRows = positions.map(position => {
    const materialEntries = scopedLedger.filter(item => item.materialId === position.materialId)
    const opening = materialEntries.filter(item => new Date(item.occurredAt) < from).reduce((sum, item) => sum + item.quantityDelta, 0)
    const periodEntries = materialEntries.filter(item => {
      const occurred = new Date(item.occurredAt)
      return occurred >= from && occurred < toExclusive
    })
    const received = periodEntries.filter(item => ['Receipt', 'TechnicalAcceptance', 'TransferIn'].includes(item.movementType)).reduce((sum, item) => sum + Math.max(0, item.quantityDelta), 0)
    const issued = Math.abs(periodEntries.filter(item => item.movementType === 'Issue' || item.movementType === 'TransferOut').reduce((sum, item) => sum + Math.min(0, item.quantityDelta), 0))
    const returned = periodEntries.filter(item => item.movementType === 'ReturnToStore').reduce((sum, item) => sum + Math.max(0, item.quantityDelta), 0)
    const other = periodEntries.filter(item => !['Receipt', 'TechnicalAcceptance', 'TransferIn', 'Issue', 'TransferOut', 'ReturnToStore'].includes(item.movementType)).reduce((sum, item) => sum + item.quantityDelta, 0)
    const closing = opening + periodEntries.reduce((sum, item) => sum + item.quantityDelta, 0)
    const usage = scopedIssues.flatMap(item => item.materialId === position.materialId ? item.usage : []).filter(item => {
      const occurred = new Date(item.recordedAt)
      return occurred >= from && occurred < toExclusive
    })
    const consumed = usage.filter(item => item.usageType === 'Used').reduce((sum, item) => sum + item.quantity, 0)
    const wasted = usage.filter(item => item.usageType === 'Wastage').reduce((sum, item) => sum + item.quantity, 0)
    const status: StockState = closing <= 0 ? 'Out of stock' : closing <= position.reorderLevel ? 'Low stock' : 'In stock'
    return { ...position, opening, received, issued, returned, other, closing, consumed, wasted, status }
  }).filter(item => projectId === 'all' || scopedMaterialIds.has(item.materialId))
    .filter(item => category === 'all' || item.category === category)
    .filter(item => stockStatus === 'all' || item.status === stockStatus)
  const showOther = ledgerRows.some(item => item.other !== 0)
  const showUsage = ledgerRows.some(item => item.consumed !== 0 || item.wasted !== 0)

  return <section className="ceo-inventory">
    <nav className="ceo-inventory-tabs" aria-label="Materials inventory sections">
      {([
        ['overview', 'Overview'],
        ['ledger', 'Materials ledger'],
        ['movements', 'Movement history'],
        ['exceptions', 'Counts & exceptions'],
      ] as [InventoryTab, string][]).map(([value, label]) => <button
        type="button"
        key={value}
        className={tab === value ? 'active' : ''}
        aria-current={tab === value ? 'page' : undefined}
        onClick={() => setTab(value)}
      >{label}</button>)}
    </nav>

    {tab === 'overview' && <>
      <div className="ceo-inventory-summary">
        <article><strong>{positions.length}</strong><span>materials tracked</span></article>
        <article className={positions.some(item => item.status === 'Out of stock') ? 'attention' : ''}><strong>{positions.filter(item => item.status === 'Out of stock').length}</strong><span>out of stock</span></article>
        <article className={pendingHandovers.length ? 'attention' : ''}><strong>{pendingHandovers.length}</strong><span>handovers awaiting confirmation</span></article>
        <article className={countDifferences.length ? 'attention' : ''}><strong>{countDifferences.length}</strong><span>count differences</span></article>
      </div>

      <section className="ceo-inventory-panel">
        <header><h2>Current material position</h2></header>
        {positions.length ? <div className="ceo-inventory-table position-table">
          <div className="ceo-inventory-row table-head"><span>Material</span><span>In store</span><span>Site custody</span><span>In transit</span><span>Status</span></div>
          {positions.map(item => <button type="button" className="ceo-inventory-row" key={item.materialId} onClick={() => setSelectedMaterialId(item.materialId)}>
            <span data-label="Material"><strong>{item.materialName}</strong><small>{item.category}</small></span>
            <span data-label="In store">{quantity(item.inStore, item.unit)}</span>
            <span data-label="Site custody">{quantity(item.siteCustody, item.unit)}</span>
            <span data-label="In transit">{quantity(item.inTransit, item.unit)}</span>
            <span data-label="Status"><b className={`inventory-state ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</b></span>
          </button>)}
        </div> : <InventoryEmpty>No materials have entered a project store.</InventoryEmpty>}
      </section>

      <section className="ceo-inventory-panel recent-movements">
        <header><h2>Recent movements</h2></header>
        {contexts.length ? <div className="recent-movement-list">{contexts.slice(0, 5).map(item => <button type="button" key={item.entry.id} onClick={() => setAuditMovement(item)}>
          <strong>{quantity(Math.abs(item.entry.quantityDelta), item.entry.unit)} {item.action.toLowerCase()}</strong>
          <span>{item.entry.materialName} · {dateTime(item.entry.occurredAt)}</span>
        </button>)}</div> : <InventoryEmpty>No material movement has been recorded.</InventoryEmpty>}
        {contexts.length > 0 && <button type="button" className="inventory-text-button" onClick={() => setTab('movements')}>View complete movement history</button>}
      </section>
    </>}

    {tab === 'ledger' && <section className="ceo-inventory-panel">
      <header className="ledger-heading"><div><h2>Materials ledger</h2><p>{new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }).format(from)} to {new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${safeToDate}T00:00:00`))}</p></div></header>
      <div className="inventory-filters">
        <label><span>From</span><input type="date" required value={fromDate} max={safeToDate} onChange={event => setFromDate(event.target.value || safeFromDate)}/></label>
        <label><span>To</span><input type="date" required value={toDate} min={safeFromDate} onChange={event => setToDate(event.target.value || safeToDate)}/></label>
        <label><span>Project</span><select value={projectId} onChange={event => setProjectId(event.target.value)}><option value="all">All projects</option>{currentUser.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label><span>Category</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
        <label><span>Stock status</span><select value={stockStatus} onChange={event => setStockStatus(event.target.value)}><option value="all">All statuses</option><option>In stock</option><option>Low stock</option><option>Out of stock</option></select></label>
      </div>
      <div className={`ceo-inventory-table ledger-table${showOther ? ' show-other' : ''}${showUsage ? ' show-usage' : ''}`}>
        <div className="ceo-inventory-row table-head"><span>Material</span><span>Opening</span><span>Received</span><span>Issued</span><span>Returned</span>{showOther && <span>Other changes</span>}{showUsage && <><span>Consumed</span><span>Wasted</span></>}<span>Closing</span><span>Status</span></div>
        {ledgerRows.map(item => <button type="button" className="ceo-inventory-row" key={item.materialId} onClick={() => setSelectedMaterialId(item.materialId)}>
          <span data-label="Material"><strong>{item.materialName}</strong><small>{item.unit}</small></span>
          <span data-label="Opening">{number(item.opening)}</span>
          <span data-label="Received" className="positive">+{number(item.received)}</span>
          <span data-label="Issued" className="negative">−{number(item.issued)}</span>
          <span data-label="Returned">{number(item.returned)}</span>
          {showOther && <span data-label="Other changes">{item.other > 0 ? '+' : ''}{number(item.other)}</span>}
          {showUsage && <><span data-label="Consumed">{number(item.consumed)}</span><span data-label="Wasted">{number(item.wasted)}</span></>}
          <span data-label="Closing"><strong>{quantity(item.closing, item.unit)}</strong></span>
          <span data-label="Status"><b className={`inventory-state ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</b></span>
        </button>)}
      </div>
      {!ledgerRows.length && <InventoryEmpty>No materials match these filters.</InventoryEmpty>}
    </section>}

    {tab === 'movements' && <section className="ceo-inventory-panel">
      <header><h2>Movement history</h2></header>
      <MovementHistory
        movements={contexts}
        onMovementClick={setAuditMovement}
      />
    </section>}

    {tab === 'exceptions' && <section className="ceo-inventory-panel exception-panel">
      <header><h2>Counts & exceptions</h2></header>
      <div className="exception-summary"><span><strong>{pendingHandovers.length}</strong> handovers waiting</span><span><strong>{countDifferences.length}</strong> count differences</span><span><strong>{disputedTransfers.length}</strong> disputed transfers</span></div>
      <ExceptionList title="Handovers awaiting confirmation" empty="No handovers are waiting.">
        {pendingHandovers.map(item => <article key={item.id}><div><strong>{item.materialName}</strong><span>{item.projectName} · issued to {item.issuedToName}</span></div><b>{quantity(item.quantityIssued, item.materialUnit)}</b></article>)}
      </ExceptionList>
      <ExceptionList title="Count differences" empty="No count difference is awaiting review.">
        {countDifferences.map(item => <article key={item.id}><div><strong>{item.materialName}</strong><span>{item.projectName} · counted by {item.countedByName}</span></div><b>{item.variance > 0 ? '+' : ''}{quantity(item.variance, item.materialUnit)}</b></article>)}
      </ExceptionList>
      <ExceptionList title="Transfer differences" empty="No transfer is disputed.">
        {disputedTransfers.map(item => <article key={item.id}><div><strong>{item.materialName}</strong><span>{item.fromProjectName} to {item.toProjectName}</span></div><div className="exception-action"><b>{quantity(item.quantity, item.materialUnit)}</b><button type="button" className="inventory-text-button" onClick={() => setResolveTransfer(item)}>Resolve variance</button></div></article>)}
      </ExceptionList>
    </section>}

    {selected && <div className="inventory-modal-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) setSelectedMaterialId(null)
    }}>
      <div className="inventory-modal-card" role="dialog" aria-modal="true" aria-labelledby="material-stock-title">
        <MaterialStockCard
          position={selected}
          movements={contexts.filter(item => item.entry.materialId === selected.materialId)}
          issues={issues.filter(item => item.materialId === selected.materialId)}
          onMovementClick={setAuditMovement}
          onBack={() => setSelectedMaterialId(null)}
        />
      </div>
    </div>}

    {auditMovement && <AuditHistoryModal key={`${auditMovement.entry.id}-${auditMovement.chainKey ?? 'unlinked'}`} movement={auditMovement} onClose={() => setAuditMovement(null)}/>}
    {resolveTransfer && <ResolveTransferModal transfer={resolveTransfer} onClose={() => setResolveTransfer(null)} onResolved={() => { setResolveTransfer(null); onChanged('Transfer variance resolved.') }}/>}
  </section>
}

function ResolveTransferModal({ transfer, onClose, onResolved }: { transfer: StockTransfer; onClose: () => void; onResolved: () => void }) {
  const variance = Math.max(0, transfer.quantity - (transfer.receivedQuantity ?? 0))
  const [disposition, setDisposition] = useState<'AcceptedLoss' | 'RecoveredAtDestination' | 'ReturnedToSource'>('AcceptedLoss')
  const [notes, setNotes] = useState('')
  const [evidenceReference, setEvidenceReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const submit = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await inventoryApi.resolveTransfer(transfer.id, { disposition, notes: notes.trim(), evidenceReference: evidenceReference.trim() || null })
      onResolved()
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'Transfer variance could not be resolved.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return <div className="inventory-audit-backdrop" onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose() }}>
    <form className="inventory-audit-card transfer-resolution-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-resolution-title" onSubmit={event => { event.preventDefault(); void submit() }}>
      <header><div><span>{transfer.fromProjectName} → {transfer.toProjectName}</span><h2 id="transfer-resolution-title">Resolve transfer variance</h2><p>{transfer.materialName} · {quantity(variance, transfer.materialUnit)}</p></div><div className="inventory-audit-heading-actions"><button type="button" aria-label="Close" disabled={busy} onClick={onClose}>×</button></div></header>
      <div className="transfer-resolution-fields">{error && <p className="inventory-audit-error">{error}</p>}<label><span>Decision</span><select required value={disposition} onChange={event => setDisposition(event.target.value as typeof disposition)}><option value="AcceptedLoss">Accept as loss</option><option value="RecoveredAtDestination">Recovered at destination</option><option value="ReturnedToSource">Returned to source store</option></select></label><label><span>Notes</span><textarea autoFocus required minLength={3} maxLength={1000} rows={4} value={notes} onChange={event => setNotes(event.target.value)}/></label><label><span>Evidence reference (optional)</span><input maxLength={500} value={evidenceReference} onChange={event => setEvidenceReference(event.target.value)}/></label><div><button type="button" className="lav-button secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="lav-button primary" disabled={busy || notes.trim().length < 3 || variance <= 0}>{busy ? 'Saving…' : 'Resolve variance'}</button></div></div>
    </form>
  </div>
}

function MaterialStockCard({ position, movements, issues, onMovementClick, onBack }: {
  position: MaterialPosition
  movements: MovementContext[]
  issues: MaterialIssue[]
  onMovementClick: (movement: MovementContext) => void
  onBack: () => void
}) {
  const custody = issues.filter(item => custodyAmount(item) > 0)
  return <section className="ceo-inventory material-stock-card">
    <button type="button" className="inventory-back" onClick={onBack}><span aria-hidden="true">←</span> Back to Materials Inventory</button>
    <header className="material-stock-heading"><div><h1 id="material-stock-title">{position.materialName}</h1><span>{position.category}</span></div><b className={`inventory-state ${position.status.toLowerCase().replaceAll(' ', '-')}`}>{position.status}</b></header>
    <div className="material-stock-facts">
      <span>In store<strong>{quantity(position.inStore, position.unit)}</strong></span>
      <span>Site custody<strong>{quantity(position.siteCustody, position.unit)}</strong></span>
      <span>In transit<strong>{quantity(position.inTransit, position.unit)}</strong></span>
      <span className="total">Total company-controlled quantity<strong>{quantity(position.totalControlled, position.unit)}</strong></span>
    </div>
    {custody.length > 0 && <section className="ceo-inventory-panel"><header><h2>Site custody</h2></header><div className="custody-list">{custody.map(item => <article key={item.id}><div><strong>{item.issuedToName}</strong><span>{item.projectName}</span></div><b>{quantity(custodyAmount(item), item.materialUnit)}</b><span>{item.status === 'AwaitingConfirmation' ? 'Awaiting confirmation' : 'Confirmed'}</span></article>)}</div></section>}
    <section className="ceo-inventory-panel"><header><h2>Material history</h2></header><MovementHistory movements={movements} onMovementClick={onMovementClick}/></section>
  </section>
}

function MovementHistory({ movements, onMovementClick }: {
  movements: MovementContext[]
  onMovementClick: (movement: MovementContext) => void
}) {
  if (!movements.length) return <InventoryEmpty>No movement has been recorded.</InventoryEmpty>
  return <div className="movement-history">
    <div className="movement-history-row table-head"><span>Date</span><span>Reference</span><span>Material</span><span>Movement</span><span>From → To</span><span>Quantity</span><span>Balance</span></div>
    {movements.map(item => <div className="movement-history-item" key={item.entry.id}>
      <button type="button" className="movement-history-row" aria-label={`Open full audit history for ${item.entry.materialName}`} onClick={() => onMovementClick(item)}>
        <span data-label="Date">{dateTime(item.entry.occurredAt)}</span>
        <span data-label="Reference"><strong>{documentReference(item.entry)}</strong></span>
        <span data-label="Material"><strong>{item.entry.materialName}</strong><small>{item.entry.projectName}</small></span>
        <span data-label="Movement">{item.action}</span>
        <span data-label="From to">{item.route}</span>
        <span data-label="Quantity" className={item.entry.quantityDelta < 0 ? 'negative' : 'positive'}>{item.entry.quantityDelta > 0 ? '+' : ''}{quantity(item.entry.quantityDelta, item.entry.unit)}</span>
        <span data-label="Balance">{quantity(item.entry.balanceAfter, item.entry.unit)}</span>
      </button>
    </div>)}
  </div>
}

function auditEventLabel(item: ControlEvent) {
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
  }
  return labels[`${item.entityType}:${item.eventType}`]
    ?? `${item.entityType.replaceAll(/([A-Z])/g, ' $1').trim()} ${item.eventType.replaceAll(/([A-Z])/g, ' $1').trim().toLowerCase()}`
}

function auditEventMaterial(item: ControlEvent) {
  const eventQuantity = item.eventQuantity ?? item.requestedQuantity
  if (!item.materialName || !item.materialUnit || eventQuantity === null) return null
  return `${quantity(eventQuantity, item.materialUnit)} of ${item.materialName}`
}

function auditDate(value: string) {
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value))
}

function auditEventEvidence(item: ControlEvent) {
  const sources: Record<string, { sourceType: string; kind: string }> = {
    GoodsReceipt: { sourceType: 'GoodsReceipt', kind: 'DeliveryNote' },
    GoodsReceiptTechnicalAcceptance: { sourceType: 'GoodsReceiptTechnicalAcceptance', kind: 'Inspection' },
    MaterialUsage: { sourceType: 'MaterialUsageRecord', kind: 'Photo' },
    SupplierInvoice: { sourceType: 'SupplierInvoice', kind: 'Invoice' },
    Payment: { sourceType: 'Payment', kind: 'PaymentProof' },
  }
  return sources[item.entityType] ?? null
}

function AuditHistoryModal({ movement, onClose }: { movement: MovementContext; onClose: () => void }) {
  const [events, setEvents] = useState<ControlEvent[]>([])
  const [loading, setLoading] = useState(Boolean(movement.chainKey))
  const [error, setError] = useState<string | null>(movement.chainKey ? null : 'No audit chain is linked to this movement.')

  useEffect(() => {
    if (!movement.chainKey) return
    const controller = new AbortController()
    financeApi.controlEvents({ chainKey: movement.chainKey }, controller.signal)
      .then(result => {
        setEvents([...result.items].sort((left, right) =>
          new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
            || left.sequenceNumber - right.sequenceNumber))
        setError(null)
      })
      .catch(cause => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'The audit history could not be loaded.')
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [movement.chainKey])

  return <div className="inventory-audit-backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose()
  }}>
    <section className="inventory-audit-card" role="dialog" aria-modal="true" aria-labelledby="inventory-audit-title">
      <header>
        <div><span>{documentReference(movement.entry)}</span><h2 id="inventory-audit-title">Full audit history</h2><p>{movement.entry.materialName} · {movement.entry.projectName}</p></div>
        <div className="inventory-audit-heading-actions"><strong>{loading ? '…' : events.length}<small> events</small></strong><button type="button" onClick={onClose} aria-label="Close audit history">×</button></div>
      </header>
      {loading && <div className="inventory-audit-loading" role="status"><i/><span>Loading audit history…</span></div>}
      {!loading && error && <p className="inventory-audit-error">{error}</p>}
      {!loading && !error && events.length > 0 && <div className="inventory-audit-timeline">
        {events.map((item, index) => {
          const material = auditEventMaterial(item)
          const evidence = auditEventEvidence(item)
          return <article key={`${item.entityType}-${item.entityId}-${item.sequenceNumber}`}>
            <i>{index + 1}</i>
            <div><span>{item.actorRole} · {item.actorName}</span><strong>{auditEventLabel(item)}{material ? `: ${material}` : ''}</strong>{evidence && <EvidenceFiles sourceType={evidence.sourceType} sourceId={item.entityId} kind={evidence.kind} label="Files" canUpload={false}/>}</div>
            <time>{auditDate(item.occurredAt)}</time>
          </article>
        })}
      </div>}
      {!loading && !error && events.length === 0 && <p className="inventory-audit-error">No audit event has been recorded for this movement.</p>}
    </section>
  </div>
}

function ExceptionList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children : [children]
  return <section className="exception-list"><h3>{title}</h3>{items.length && items.some(Boolean) ? items : <p>{empty}</p>}</section>
}

function InventoryEmpty({ children }: { children: ReactNode }) {
  return <p className="inventory-empty">{children}</p>
}
