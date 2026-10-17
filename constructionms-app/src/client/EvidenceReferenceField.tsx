import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { ApiError, documentsApi, type EvidenceDocument } from './api'
import './evidence-reference.css'

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  context?: string
  sourceType?: string
  sourceId?: number
  evidenceKind?: string
  allowUpload?: boolean
  showReferenceInput?: boolean
  required?: boolean
  disabled?: boolean
  placeholder?: string
  accept?: string
}

export function EvidenceReferenceField({
  label,
  value,
  onChange,
  sourceType,
  sourceId,
  evidenceKind = 'Other',
  allowUpload = true,
  showReferenceInput = true,
  required = false,
  disabled = false,
  placeholder = 'Reference number or uploaded file',
  accept = 'image/jpeg,image/png,image/webp,application/pdf',
}: Props) {
  const inputId = useId()
  const fileId = useId()
  const controller = useRef<AbortController | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [documents, setDocuments] = useState<EvidenceDocument[]>([])
  const [loadedSource, setLoadedSource] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sourceKey = sourceType && sourceId ? `${sourceType}:${sourceId}` : null
  const visibleDocuments = sourceKey === loadedSource ? documents : []
  const loadingDocuments = Boolean(sourceKey && sourceKey !== loadedSource)

  useEffect(() => {
    if (!sourceType || !sourceId) return
    const nextController = new AbortController()
    documentsApi.forSource(sourceType, sourceId, nextController.signal)
      .then(result => { setDocuments(result); setLoadedSource(`${sourceType}:${sourceId}`); setError(null) })
      .catch(cause => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setLoadedSource(`${sourceType}:${sourceId}`)
          setError(cause instanceof Error ? cause.message : 'Evidence could not be loaded.')
        }
      })
    return () => nextController.abort()
  }, [sourceId, sourceType])

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('Choose a file smaller than 10 MB.')
      return
    }

    controller.current?.abort()
    const nextController = new AbortController()
    controller.current = nextController
    setUploading(true)
    setError(null)
    try {
      if (!sourceType || !sourceId) return
      const uploaded = await documentsApi.uploadEvidence(file, sourceType, sourceId, evidenceKind, nextController.signal)
      setFileName(uploaded.originalFileName)
      setLoadedSource(`${sourceType}:${sourceId}`)
      setDocuments(current => [uploaded, ...current])
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'The file could not be uploaded.')
      }
    } finally {
      if (!nextController.signal.aborted) setUploading(false)
    }
  }

  async function openDocument(document: EvidenceDocument, download: boolean) {
    setError(null)
    try {
      const blob = await documentsApi.content(document.id)
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.target = download ? '_self' : '_blank'
      anchor.rel = 'noopener'
      if (download) anchor.download = document.originalFileName
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : 'The evidence file could not be opened.')
    }
  }

  return <div className="evidence-field">
    {showReferenceInput ? <label htmlFor={inputId}>{label}{required ? '' : ' (optional)'}</label> : <span className="evidence-file-heading">{label}</span>}
    <div className="evidence-field-controls">
      {showReferenceInput && <input
        id={inputId}
        required={required}
        disabled={disabled || uploading}
        maxLength={500}
        value={value}
        onChange={event => { onChange(event.currentTarget.value); setFileName(null); setError(null) }}
        placeholder={placeholder}
      />}
      {sourceType && sourceId && allowUpload ? <><label className="evidence-upload-button" htmlFor={fileId} aria-disabled={disabled || uploading}>
          {uploading ? 'Uploading…' : 'Upload file'}
        </label>
        <input
          className="evidence-file-input"
          id={fileId}
          type="file"
          accept={accept}
          disabled={disabled || uploading}
          onChange={event => void upload(event)}
        /></> : null}
    </div>
    {fileName && <small className="evidence-file-name">{fileName}</small>}
    {sourceType && sourceId && loadingDocuments && <small className="evidence-file-name">Loading files…</small>}
    {visibleDocuments.length > 0 && <div className="evidence-document-list">{visibleDocuments.map(document => <div key={document.id}><span>{document.originalFileName}</span><button type="button" onClick={() => void openDocument(document, false)}>Open</button><button type="button" onClick={() => void openDocument(document, true)}>Download</button></div>)}</div>}
    {sourceType && sourceId && !loadingDocuments && visibleDocuments.length === 0 && !error && <small className="evidence-file-name">No files attached.</small>}
    {error && <small className="evidence-upload-error" role="alert">{error}</small>}
  </div>
}

export function EvidenceFiles({
  sourceType,
  sourceId,
  canUpload,
  kind = 'Other',
  label = 'Evidence',
}: {
  sourceType: string
  sourceId: number
  canUpload: boolean
  kind?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  return <div className="record-evidence">
    <button type="button" className="lav-button secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? `Hide ${label.toLowerCase()}` : label}</button>
    {open && <EvidenceReferenceField label={label} value="" onChange={() => undefined} sourceType={sourceType} sourceId={sourceId} evidenceKind={kind} allowUpload={canUpload} showReferenceInput={false}/>}
  </div>
}
