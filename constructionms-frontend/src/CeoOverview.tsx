import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  ApiError,
  financeApi,
  inventoryApi,
  projectsApi,
  tasksApi,
  type CashBook,
  type CurrentUser,
  type MaterialIssue,
  type MyTask,
  type MyTasksResponse,
  type Project,
  type ProjectSummary,
  type StockBalance,
  type StockCount,
  type StockTransfer,
} from './api'

type ProjectRecord = {
  project: Project
  summary: ProjectSummary | null
}

type InventorySnapshot = {
  balances: StockBalance[]
  issues: MaterialIssue[]
  transfers: StockTransfer[]
  counts: StockCount[]
}

function messageOf(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : 'The records could not be loaded.'
}

function money(value: number) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(value)
}

function number(value: number) {
  return new Intl.NumberFormat('en-KE', { maximumFractionDigits: 0 }).format(value)
}

function due(value: string) {
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function decisionTarget(path: string) {
  if (!path.startsWith('/') || path.startsWith('//')) return '/tasks'
  return path === '/finance' ? '/finance?section=invoices' : path
}

function decisionDetail(task: MyTask) {
  if (task.taskType === 'OpeningPositionDecision' || task.taskType === 'ControlledCorrectionDecision') {
    return task.detail.split(' · ')[0]
  }
  return task.detail
}

async function allPages<T>(load: (page: number) => Promise<{ items: T[]; totalPages: number }>) {
  const first = await load(1)
  const items = [...first.items]
  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await load(page)
    items.push(...next.items)
  }
  return items
}

function projectState(project: Project, decisions: number, overdue: number) {
  if (overdue > 0) return { label: 'Overdue decision', tone: 'overdue' }
  if (decisions > 0) return { label: 'Needs your decision', tone: 'waiting' }
  if (project.status === 'Completed') return { label: 'Completed', tone: 'complete' }
  if (project.status === 'On Hold') return { label: 'On hold', tone: 'hold' }
  if (project.status === 'Cancelled') return { label: 'Cancelled', tone: 'hold' }
  return { label: 'No CEO action', tone: 'clear' }
}

function projectMaterials(projectId: number, snapshot: InventorySnapshot | null, fallback: string) {
  if (!snapshot) return fallback
  const balances = snapshot.balances.filter(item => item.projectId === projectId)
  const outOfStock = balances.filter(item => item.quantityOnHand <= 0).length
  const countDifferences = snapshot.counts.filter(item => item.projectId === projectId && item.status === 'AwaitingReview' && item.variance !== 0).length
  const handovers = snapshot.issues.filter(item => item.projectId === projectId && item.status === 'AwaitingConfirmation').length
  const inTransit = snapshot.transfers.filter(item => item.status === 'InTransit' && (item.fromProjectId === projectId || item.toProjectId === projectId)).length

  if (outOfStock > 0) return `${number(outOfStock)} out of stock`
  if (countDifferences > 0) return `${number(countDifferences)} count difference${countDifferences === 1 ? '' : 's'}`
  if (handovers > 0) return `${number(handovers)} handover${handovers === 1 ? '' : 's'} waiting`
  if (inTransit > 0) return `${number(inTransit)} in transit`
  return `${number(balances.length)} tracked`
}

export function CeoOverview({ currentUser }: { currentUser: CurrentUser }) {
  const [tasks, setTasks] = useState<MyTasksResponse | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [taskRefresh, setTaskRefresh] = useState(0)
  const [projects, setProjects] = useState<ProjectRecord[] | null>(null)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [projectWarning, setProjectWarning] = useState<string | null>(null)
  const [projectRefresh, setProjectRefresh] = useState(0)
  const [cashBook, setCashBook] = useState<CashBook | null>(null)
  const [moneyError, setMoneyError] = useState<string | null>(null)
  const [moneyRefresh, setMoneyRefresh] = useState(0)
  const [inventory, setInventory] = useState<InventorySnapshot | null>(null)
  const [inventoryError, setInventoryError] = useState<string | null>(null)
  const [inventoryRefresh, setInventoryRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    tasksApi.list({}, controller.signal)
      .then(result => { setTasks(result); setTaskError(null) })
      .catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setTaskError(messageOf(error))
      })
    return () => controller.abort()
  }, [currentUser.id, taskRefresh])

  useEffect(() => {
    const controller = new AbortController()
    allPages<Project>(page => projectsApi.list({ page, pageSize: 100 }, controller.signal))
      .then(async projectItems => {
        const loaded: ProjectRecord[] = []
        for (let start = 0; start < projectItems.length; start += 6) {
          const batch = await Promise.all(projectItems.slice(start, start + 6).map(async project => {
            try {
              return { project, summary: await projectsApi.getSummary(project.id, controller.signal) }
            } catch (error) {
              if (error instanceof DOMException && error.name === 'AbortError') throw error
              return { project, summary: null }
            }
          }))
          loaded.push(...batch)
        }
        setProjects(loaded)
        const unavailable = loaded.filter(item => item.summary === null).length
        setProjectWarning(unavailable ? `${unavailable} project detail${unavailable === 1 ? '' : 's'} unavailable` : null)
        setProjectError(null)
      })
      .catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setProjectError(messageOf(error))
      })
    return () => controller.abort()
  }, [currentUser.id, projectRefresh])

  useEffect(() => {
    const controller = new AbortController()
    financeApi.cashBook(controller.signal)
      .then(result => { setCashBook(result); setMoneyError(null) })
      .catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setMoneyError(messageOf(error))
      })
    return () => controller.abort()
  }, [currentUser.id, moneyRefresh])

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      allPages<StockBalance>(page => inventoryApi.balances(controller.signal, { page, pageSize: 100 })),
      allPages<MaterialIssue>(page => inventoryApi.issues(controller.signal, { page, pageSize: 100 })),
      allPages<StockTransfer>(page => inventoryApi.transfers(controller.signal, { page, pageSize: 100 })),
      allPages<StockCount>(page => inventoryApi.counts(controller.signal, { page, pageSize: 100 })),
    ]).then(([balances, issues, transfers, counts]) => {
      setInventory({
        balances,
        issues,
        transfers,
        counts,
      })
      setInventoryError(null)
    }).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setInventoryError(messageOf(error))
    })
    return () => controller.abort()
  }, [currentUser.id, inventoryRefresh])

  const orderedTasks = useMemo(() => [...(tasks?.items ?? [])].sort((left, right) => {
    if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1
    return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
  }), [tasks])

  const cashByProject = useMemo(
    () => new Map((cashBook?.projects ?? []).map(project => [project.projectId, project])),
    [cashBook],
  )

  const moneyTotals = useMemo(() => (cashBook?.projects ?? []).reduce((total, project) => ({
    allocated: total.allocated + project.allocatedBudget,
    used: total.used + project.totalUsed,
    committed: total.committed + project.openCommitments,
    waiting: total.waiting + project.cashAwaitingAccountability,
    available: total.available + project.budgetAvailable,
  }), { allocated: 0, used: 0, committed: 0, waiting: 0, available: 0 }), [cashBook])

  const materialTotals = useMemo(() => {
    if (!inventory) return null
    const materialIds = [...new Set(inventory.balances.map(item => item.materialId))]
    return {
      tracked: materialIds.length,
      outOfStock: materialIds.filter(materialId => inventory.balances
        .filter(item => item.materialId === materialId)
        .reduce((total, item) => total + item.quantityOnHand, 0) <= 0).length,
      handovers: inventory.issues.filter(item => item.status === 'AwaitingConfirmation').length,
      differences: inventory.counts.filter(item => item.status === 'AwaitingReview' && item.variance !== 0).length,
    }
  }, [inventory])

  return <div className="lav-view ceo-overview">
    <header className="lav-page-head ceo-overview-head">
      <div><h1>Overview</h1></div>
      {projects && <span className="lav-count-chip">{projects.length} projects</span>}
    </header>

    <section className="ceo-overview-panel ceo-attention">
      <header className="ceo-overview-section-head">
        <h2>Decisions waiting</h2>
        {tasks && <Link to="/tasks">View all decisions</Link>}
      </header>
      {taskError ? <div className="ceo-overview-state error"><span>{taskError}</span><button onClick={() => { setTaskError(null); setTasks(null); setTaskRefresh(value => value + 1) }}>Try again</button></div>
        : !tasks ? <div className="ceo-overview-state">Loading decisions…</div>
          : orderedTasks.length ? <div className="ceo-decision-list">{orderedTasks.slice(0, 5).map(task => <Link to={decisionTarget(task.targetPath)} key={task.taskKey}>
            <span><strong>{task.title}</strong><small>{task.projectName ?? 'Company-wide'} · {decisionDetail(task)}</small></span>
            <time>Due {due(task.dueAt)}</time>
            <b className={task.isOverdue ? 'overdue' : ''}>{task.isOverdue ? 'Overdue' : 'Needs your decision'}</b>
          </Link>)}</div>
            : <div className="ceo-overview-state clear"><strong>No decisions waiting</strong></div>}
    </section>

    <section className="ceo-overview-panel">
      <header className="ceo-overview-section-head"><h2>Projects</h2><Link to="/projects">Open projects</Link></header>
      {projectError ? <div className="ceo-overview-state error"><span>{projectError}</span><button onClick={() => { setProjectError(null); setProjects(null); setProjectRefresh(value => value + 1) }}>Try again</button></div>
        : !projects ? <div className="ceo-overview-state">Loading projects…</div>
          : projects.length ? <>{projectWarning && <div className="ceo-overview-warning"><span>{projectWarning}</span><button onClick={() => { setProjectWarning(null); setProjectRefresh(value => value + 1) }}>Retry</button></div>}
          <div className="ceo-project-table" role="region" aria-label="Project position" tabIndex={0}>
            <div className="ceo-project-row head"><span>Project</span><span>Progress</span><span>Paid / used</span><span>Committed</span><span>Materials</span><span>Decisions</span><span>CEO action</span></div>
            {projects.map(({ project, summary }) => {
              const projectTasks = orderedTasks.filter(task => task.projectId === project.id)
              const projectCash = cashByProject.get(project.id)
              const state = tasks
                ? projectState(project, projectTasks.length, projectTasks.filter(task => task.isOverdue).length)
                : { label: 'Loading', tone: 'neutral' }
              return <div className="ceo-project-row" key={project.id}>
                <span><Link to={`/projects?projectId=${project.id}`}>{project.name}</Link><small>{project.location || project.status}</small></span>
                <span>{summary === null ? 'Unavailable' : summary.latestProgress ? `${number(summary.latestProgress.percentageComplete)}%` : 'Not recorded'}</span>
                <span>{projectCash ? money(projectCash.totalUsed) : cashBook ? 'Not recorded' : moneyError ? 'Unavailable' : 'Loading'}</span>
                <span>{projectCash ? money(projectCash.openCommitments) : cashBook ? 'Not recorded' : moneyError ? 'Unavailable' : 'Loading'}</span>
                <span>{projectMaterials(project.id, inventory, inventoryError ? 'Unavailable' : 'Loading')}</span>
                <span>{tasks ? number(projectTasks.length) : 'Loading'}</span>
                <span><b className={`ceo-project-state ${state.tone}`}>{state.label}</b></span>
              </div>
            })}
          </div></> : <div className="ceo-overview-state clear"><strong>No projects recorded</strong></div>}
    </section>

    <div className="ceo-overview-pair">
      <section className="ceo-overview-panel">
        <header className="ceo-overview-section-head"><h2>Money</h2><Link to="/finance">Open money</Link></header>
        {moneyError ? <div className="ceo-overview-state error"><span>{moneyError}</span><button onClick={() => { setMoneyError(null); setCashBook(null); setMoneyRefresh(value => value + 1) }}>Try again</button></div>
          : !cashBook ? <div className="ceo-overview-state">Loading money…</div>
            : <dl className="ceo-overview-facts money"><div><dt>Allocated</dt><dd>{money(moneyTotals.allocated)}</dd></div><div><dt>Used</dt><dd>{money(moneyTotals.used)}</dd></div><div><dt>Committed</dt><dd>{money(moneyTotals.committed)}</dd></div><div><dt>Waiting</dt><dd>{money(moneyTotals.waiting)}</dd></div><div><dt>Available</dt><dd>{money(moneyTotals.available)}</dd></div></dl>}
      </section>

      <section className="ceo-overview-panel">
        <header className="ceo-overview-section-head"><h2>Materials</h2><Link to="/inventory">Open materials</Link></header>
        {inventoryError ? <div className="ceo-overview-state error"><span>{inventoryError}</span><button onClick={() => { setInventoryError(null); setInventory(null); setInventoryRefresh(value => value + 1) }}>Try again</button></div>
          : !materialTotals ? <div className="ceo-overview-state">Loading materials…</div>
            : <dl className="ceo-overview-facts"><div><dt>Tracked</dt><dd>{number(materialTotals.tracked)}</dd></div><div className={materialTotals.outOfStock ? 'attention' : ''}><dt>Out of stock</dt><dd>{number(materialTotals.outOfStock)}</dd></div><div className={materialTotals.handovers ? 'attention' : ''}><dt>Handovers waiting</dt><dd>{number(materialTotals.handovers)}</dd></div><div className={materialTotals.differences ? 'attention' : ''}><dt>Count differences</dt><dd>{number(materialTotals.differences)}</dd></div></dl>}
      </section>
    </div>
  </div>
}
