import type { RequisitionProgress, RequisitionProgressStep } from './api'
import './request-progress.css'

const stepStatusText: Record<RequisitionProgressStep['status'], string> = {
  Done: 'done',
  Current: 'current step',
  Upcoming: 'not reached yet',
  Stopped: 'stopped',
}

/** Shows where a material request has reached and who it is waiting on; the full journey opens below. */
export function RequestProgress({ progress }: { progress: RequisitionProgress }) {
  const reached = progress.steps.findIndex(step => step.status === 'Current' || step.status === 'Stopped')
  const current = reached === -1 ? null : progress.steps[reached]!
  const total = progress.steps.length

  return (
    <details className={`request-progress ${progress.state.toLowerCase()}`}>
      <summary>
        <span className="request-progress-now">
          <small>{progress.state === 'InProgress' ? 'Where it is now' : progress.state === 'Completed' ? 'Finished' : 'Stopped'}</small>
          <strong>{progress.headline}</strong>
          {current?.detail && <span>{current.detail}</span>}
          <em>{positionLine(progress, current)}</em>
        </span>
        <span className="request-progress-side">
          <span className="request-progress-track" aria-hidden="true">
            {progress.steps.map(step => <i key={step.key} className={step.status.toLowerCase()}/>)}
          </span>
          <b>{reached === -1 ? `All ${total} steps done` : `Step ${reached + 1} of ${total}`}</b>
        </span>
      </summary>
      <ol>
        {progress.steps.map((step, index) => (
          <li key={step.key} className={step.status.toLowerCase()}>
            <span className="request-progress-marker" aria-hidden="true">
              {step.status === 'Done' ? '✓' : step.status === 'Stopped' ? '×' : index + 1}
            </span>
            <div>
              <strong>
                {step.label}
                <span className="lav-visually-hidden">, {stepStatusText[step.status]}</span>
              </strong>
              <p>{[step.actorName, step.role, step.reference].filter(Boolean).join(' · ')}</p>
              {step.detail && step !== current && <p>{step.detail}</p>}
              {step.expectedBy && <p>{step.key === 'quotes' ? 'Quotes due' : 'Expected'} {formatWhen(step.expectedBy)}</p>}
            </div>
            <small>{step.at ? formatWhen(step.at) : step.status === 'Current' ? 'Now' : ''}</small>
          </li>
        ))}
      </ol>
    </details>
  )
}

function positionLine(progress: RequisitionProgress, current: RequisitionProgressStep | null): string {
  if (progress.state === 'Completed') return `Finished ${formatWhen(progress.since)}`
  if (progress.state === 'Stopped') return formatWhen(progress.since)
  const parts = [`Waiting on ${progress.waitingOn ?? 'the next step'}`, elapsedSince(progress.since)]
  if (current?.expectedBy) parts.push(`${current.key === 'quotes' ? 'quotes due' : 'expected'} ${formatWhen(current.expectedBy)}`)
  return parts.join(' · ')
}

function elapsedSince(value: string): string {
  const hours = Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000)
  if (!Number.isFinite(hours) || hours < 1) return 'under an hour'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

/** Dates without a time (YYYY-MM-DD) are local calendar days; everything else is an instant. */
function formatWhen(value: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(dateOnly ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-KE', dateOnly
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}
