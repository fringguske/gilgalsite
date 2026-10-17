import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  ApiError,
  dashboardApi,
  tasksApi,
  type ConstructionRole,
  type CurrentUser,
  type DashboardResponse,
  type MyTask,
  type MyTasksResponse,
} from './api'
import './operational-overview.css'

type SimplifiedRole = Exclude<ConstructionRole, 'CEO'>

type WorkspaceLink = {
  label: string
  to: string
}

type WorkspaceMetric = {
  label: string
  value: (dashboard: DashboardResponse, tasks: MyTasksResponse) => number
  attention?: (value: number) => boolean
}

type WorkspaceConfig = {
  links: readonly WorkspaceLink[]
  metrics: readonly WorkspaceMetric[]
  showWork?: boolean
  factsTitle?: string
  linksTitle?: string
  scopeText?: string
  scopeBadge?: string
}

const workspaceConfig: Record<SimplifiedRole, WorkspaceConfig> = {
  Administrator: {
    links: [
      { label: 'Join requests', to: '/access' },
      { label: 'Team accounts', to: '/access?section=accounts' },
    ],
    metrics: [
      { label: 'Join requests', value: dashboard => dashboard.pendingAccessRequestCount, attention: value => value > 0 },
      { label: 'Overdue reviews', value: (_dashboard, tasks) => tasks.overdueCount, attention: value => value > 0 },
    ],
    scopeText: 'User accounts and access',
    scopeBadge: 'Company-wide',
  },
  'Finance Officer': {
    links: [
      { label: 'Supplier approvals', to: '/suppliers' },
      { label: 'Invoices and payments', to: '/finance' },
      { label: 'Petty cash', to: '/petty-cash' },
      { label: 'Finance controls', to: '/projects' },
    ],
    metrics: [
      { label: 'Suppliers to review', value: dashboard => dashboard.pendingSupplierOnboardingCount, attention: value => value > 0 },
      { label: 'Invoices pending', value: dashboard => dashboard.pendingInvoiceReviewCount, attention: value => value > 0 },
      { label: 'Payments ready', value: dashboard => dashboard.pendingPaymentCount, attention: value => value > 0 },
      { label: 'Assigned projects', value: dashboard => dashboard.visibleProjectCount },
    ],
  },
  Foreman: {
    links: [
      { label: 'New material request', to: '/requisitions?new=1' },
      { label: 'My requests', to: '/requisitions' },
      { label: 'Materials with me', to: '/inventory' },
      { label: 'Returns and close-out', to: '/custody-close-out' },
    ],
    metrics: [
      { label: 'Work waiting', value: (_dashboard, tasks) => tasks.totalCount, attention: value => value > 0 },
      { label: 'Overdue', value: (_dashboard, tasks) => tasks.overdueCount, attention: value => value > 0 },
      { label: 'Handovers to confirm', value: dashboard => dashboard.pendingMaterialConfirmationCount, attention: value => value > 0 },
      { label: 'Assigned projects', value: dashboard => dashboard.visibleProjectCount },
    ],
  },
  Engineer: {
    links: [
      { label: 'Material checks', to: '/requisitions' },
      { label: 'Delivery checks', to: '/delivery-checks' },
      { label: 'Project progress', to: '/projects' },
    ],
    metrics: [
      { label: 'Material checks', value: (_dashboard, tasks) => tasks.items.filter(task => task.targetPath === '/requisitions').length, attention: value => value > 0 },
      { label: 'Delivery checks', value: (_dashboard, tasks) => tasks.items.filter(task => task.targetPath === '/delivery-checks').length, attention: value => value > 0 },
      { label: 'Overdue', value: (_dashboard, tasks) => tasks.overdueCount, attention: value => value > 0 },
      { label: 'Assigned projects', value: dashboard => dashboard.visibleProjectCount },
    ],
  },
  Supervisor: {
    links: [
      { label: 'Material approvals', to: '/requisitions' },
      { label: 'Stock controls', to: '/inventory' },
      { label: 'Projects', to: '/projects' },
    ],
    metrics: [
      { label: 'Work waiting', value: (_dashboard, tasks) => tasks.totalCount, attention: value => value > 0 },
      { label: 'Count reviews', value: dashboard => dashboard.pendingStockCountReviewCount, attention: value => value > 0 },
      { label: 'Assigned projects', value: dashboard => dashboard.visibleProjectCount },
    ],
  },
  Storekeeper: {
    links: [
      { label: 'Restock', to: '/inventory?action=restock' },
      { label: 'Receive delivery', to: '/inventory?action=receive' },
      { label: 'Issue materials', to: '/inventory?action=issue' },
      { label: 'Count stock', to: '/inventory?action=count' },
      { label: 'Transfers', to: '/inventory?action=transfers' },
    ],
    metrics: [
      { label: 'Work waiting', value: (_dashboard, tasks) => tasks.totalCount, attention: value => value > 0 },
      { label: 'Deliveries expected', value: dashboard => dashboard.pendingGoodsReceiptCount, attention: value => value > 0 },
      { label: 'Issues ready', value: dashboard => dashboard.pendingMaterialIssueCount, attention: value => value > 0 },
      { label: 'Assigned stores', value: dashboard => dashboard.visibleProjectCount },
    ],
  },
  'Procurement Officer': {
    links: [
      { label: 'Ready requests', to: '/sourcing' },
      { label: 'Open sourcing', to: '/sourcing?section=open' },
      { label: 'Purchase orders', to: '/purchase-orders' },
      { label: 'Suppliers', to: '/suppliers' },
      { label: 'Supplier invoices', to: '/finance' },
    ],
    metrics: [
      { label: 'Ready to source', value: (_dashboard, tasks) => tasks.items.filter(task => task.taskType === 'OpenSourcing').length, attention: value => value > 0 },
      { label: 'Sourcing open', value: (_dashboard, tasks) => tasks.items.filter(task => task.taskType === 'CompleteSourcing').length, attention: value => value > 0 },
      { label: 'Orders to finish', value: (_dashboard, tasks) => tasks.items.filter(task => task.taskType === 'SubmitPurchaseOrder' || task.taskType === 'IssuePurchaseOrder').length, attention: value => value > 0 },
      { label: 'Invoices ready', value: (_dashboard, tasks) => tasks.items.filter(task => task.taskType === 'CaptureSupplierInvoice').length, attention: value => value > 0 },
    ],
  },
  Auditor: {
    links: [
      { label: 'Complete chain', to: '/audit' },
      { label: 'Materials', to: '/inventory' },
      { label: 'Supplier payments', to: '/finance' },
      { label: 'Period records', to: '/period-close' },
    ],
    metrics: [
      { label: 'Projects visible', value: dashboard => dashboard.visibleProjectCount },
      { label: 'Requests in progress', value: dashboard => dashboard.pendingRequisitionCount, attention: value => value > 0 },
      { label: 'Count reviews waiting', value: dashboard => dashboard.pendingStockCountReviewCount, attention: value => value > 0 },
      { label: 'Payments recorded', value: dashboard => dashboard.completedPaymentCount },
    ],
    showWork: false,
    factsTitle: 'Record summary',
    linksTitle: 'Open records',
  },
}

function messageOf(error: unknown) {
  return error instanceof ApiError || error instanceof Error ? error.message : 'The workspace could not be loaded.'
}

function taskTarget(task: MyTask, role: SimplifiedRole) {
  if (!task.targetPath.startsWith('/') || task.targetPath.startsWith('//')) return '/tasks'
  if (role === 'Finance Officer' && task.taskType === 'PaymentExecution' && task.targetPath === '/finance') {
    return '/finance?section=authorized'
  }
  if (role === 'Finance Officer' && task.taskType === 'InvoiceMatch' && task.targetPath === '/finance') {
    return '/finance?view=all'
  }
  if (role === 'Foreman' && task.taskType === 'RequisitionRevision' && task.targetPath === '/requisitions') {
    return '/requisitions?view=action'
  }
  if (role === 'Procurement Officer') {
    if (task.taskType === 'CompleteSourcing' && task.targetPath === '/sourcing') return '/sourcing?section=open'
    if ((task.taskType === 'SubmitPurchaseOrder' || task.taskType === 'IssuePurchaseOrder') && task.targetPath === '/purchase-orders') {
      return '/purchase-orders'
    }
  }
  if (role === 'Storekeeper' && task.targetPath === '/inventory') {
    if (task.taskType.includes('GoodsReceipt') || task.taskType.includes('Delivery')) return '/inventory?action=receive'
    if (task.taskType.includes('MaterialIssue')) return '/inventory?action=issue'
    if (task.taskType === 'StockTransferDispatch' || task.taskType === 'StockTransferReceipt') return '/inventory?action=transfers'
  }
  return task.targetPath
}

function taskDue(value: string) {
  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function taskDetail(task: MyTask) {
  if (task.taskType === 'OpeningPositionDecision' || task.taskType === 'ControlledCorrectionDecision') {
    return task.detail.split(' · ')[0]
  }
  return task.detail
}

export function OperationalOverview({ currentUser }: { currentUser: CurrentUser }) {
  const role = currentUser.role as SimplifiedRole
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [tasks, setTasks] = useState<MyTasksResponse | null>(null)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const config = workspaceConfig[role]

  useEffect(() => {
    const controller = new AbortController()
    const taskRequest = role === 'Auditor'
      ? Promise.resolve<MyTasksResponse>({ generatedAt: new Date().toISOString(), actualRole: role, totalCount: 0, overdueCount: 0, items: [] })
      : tasksApi.list({}, controller.signal)
    Promise.allSettled([dashboardApi.get(controller.signal), taskRequest])
      .then(([dashboardResult, taskResult]) => {
        if (dashboardResult.status === 'fulfilled') {
          setDashboard(dashboardResult.value)
          setDashboardError(null)
        } else if (!(dashboardResult.reason instanceof DOMException && dashboardResult.reason.name === 'AbortError')) {
          setDashboard(null)
          setDashboardError(messageOf(dashboardResult.reason))
        }
        if (taskResult.status === 'fulfilled') {
          setTasks(taskResult.value)
          setTaskError(null)
        } else if (!(taskResult.reason instanceof DOMException && taskResult.reason.name === 'AbortError')) {
          setTasks(null)
          setTaskError(messageOf(taskResult.reason))
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [currentUser.id, currentUser.role, refresh, role])

  const orderedTasks = useMemo(() => [...(tasks?.items ?? [])].sort((left, right) => {
    if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1
    return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()
  }), [tasks])

  const projectNames = currentUser.projects.map(project => project.name).join(', ')
  const scopeText = config.scopeText ?? (projectNames || 'No project assigned')
  const scopeBadge = config.scopeBadge ?? `${currentUser.projects.length} assigned`

  return <div className="lav-view operational-overview">
    <header className="lav-page-head operational-overview-head">
      <div>
        <h1>Overview</h1>
        <p>{scopeText}</p>
      </div>
      <span className="lav-count-chip">{scopeBadge}</span>
    </header>

    {loading ? <div className="operational-overview-state" role="status">Loading workspace…</div> : <>
      {config.showWork !== false && <section className="operational-overview-panel operational-work-list">
        <header>
          <h2>Work waiting</h2>
          {tasks && <Link to="/tasks">View all</Link>}
        </header>
        {taskError ? <div className="operational-overview-state error" role="alert"><span>{taskError}</span><button type="button" onClick={() => { setTaskError(null); setLoading(true); setRefresh(value => value + 1) }}>Try again</button></div>
          : orderedTasks.length ? <div>
          {orderedTasks.slice(0, 5).map(task => <Link key={task.taskKey} to={taskTarget(task, role)}>
            <span>
              <strong>{task.title}</strong>
              <small>{task.projectName ?? 'Company-wide'} · {taskDetail(task)}</small>
            </span>
            <time>Due {taskDue(task.dueAt)}</time>
            <b className={task.isOverdue ? 'overdue' : ''}>{task.isOverdue ? 'Overdue' : 'Open'}</b>
          </Link>)}
        </div> : <div className="operational-overview-state clear">No work waiting</div>}
      </section>}

      <section className="operational-overview-panel">
        <header><h2>{config.factsTitle ?? 'At a glance'}</h2></header>
        {dashboardError || taskError || !dashboard || !tasks
          ? <div className="operational-overview-state error"><span>{dashboardError ?? taskError ?? 'Summary unavailable'}</span><button type="button" onClick={() => { setDashboardError(null); setTaskError(null); setLoading(true); setRefresh(value => value + 1) }}>Try again</button></div>
          : <dl className="operational-facts">
          {config.metrics.map(metric => {
            const value = metric.value(dashboard, tasks)
            return <div className={metric.attention?.(value) ? 'attention' : ''} key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{value.toLocaleString('en-KE')}</dd>
            </div>
          })}
        </dl>}
      </section>

      <section className="operational-overview-panel">
        <header><h2>{config.linksTitle ?? 'Open workspace'}</h2></header>
        <nav className="operational-shortcuts" aria-label={`${currentUser.role} work areas`}>
          {config.links.map(link => <Link key={link.to} to={link.to}><span>{link.label}</span><b aria-hidden="true">→</b></Link>)}
        </nav>
      </section>
    </>}
  </div>
}
