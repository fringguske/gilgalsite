import { ArgumentError, UnauthorizedAccessError } from '@/ConstructionMS.Application/Common/Exceptions'
import { ClaimTypes } from '@/ConstructionMS.Application/Security/ApplicationClaimTypes'
import { ModelValidationError, type ValidationErrors } from '@/ConstructionMS.Application/Common/Validation'
import type { IEvidenceService } from '@/ConstructionMS.Application/Services/Evidence/IEvidenceService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

const LongMaxValue = '9223372036854775807'

interface UploadEvidenceForm {
  sourceType: string
  sourceId: number
  evidenceKind: string
  file: File | null
}

export class EvidenceControllerImpl extends ControllerBase {
  constructor(private readonly evidence: IEvidenceService) { super() }

  async upload(): Promise<ActionResult> {
    const request = await this.bindUploadForm()
    if (request.file === null || request.file.size <= 0) {
      throw new ArgumentError('A non-empty evidence file is required.', 'File')
    }

    const content = new Uint8Array(await request.file.arrayBuffer())
    const result = await this.evidence.uploadAsync(
      {
        sourceType: request.sourceType,
        sourceId: request.sourceId,
        evidenceKind: request.evidenceKind,
        originalFileName: request.file.name,
        claimedContentType: request.file.type || null,
        declaredLength: request.file.size,
        content,
      },
      this.actorId(),
      this.role())
    return this.created(`/api/v1/evidence/${result.id}/content`, ApiResponse.ok(result))
  }

  async getForSource(): Promise<ActionResult> {
    const sourceType = this.routeString('sourceType')
    const sourceId = this.routeInt('sourceId')
    return this.ok(ApiResponse.ok(
      await this.evidence.getForSourceAsync(sourceType, sourceId, this.actorId(), this.role())))
  }

  async download(): Promise<ActionResult> {
    const documentId = this.routeGuid('documentId')
    const result = await this.evidence.openDownloadAsync(documentId, this.actorId(), this.role())
    return this.file(result.content, result.contentType, result.fileName, {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    })
  }

  private actorId(): number {
    return this.currentUserId()
  }

  private role(): string {
    const role = this.user?.findFirstValue(ClaimTypes.Role) ?? null
    if (role === null) {
      throw new UnauthorizedAccessError('The authenticated role claim is missing.')
    }

    return role
  }

  /** [FromForm] UploadEvidenceForm with its DataAnnotations. */
  private async bindUploadForm(): Promise<UploadEvidenceForm> {
    let form: FormData
    try {
      form = await this.httpContext.readFormAsync()
    } catch {
      throw new ModelValidationError({ '': ['Failed to read the request form. Missing content-type boundary.'] })
    }

    const errors: ValidationErrors = {}
    const add = (key: string, message: string) => { (errors[key] ??= []).push(message) }
    const text = (name: string): string | null => {
      const value = form.get(name) ?? form.get(name.charAt(0).toUpperCase() + name.slice(1))
      return typeof value === 'string' ? value : null
    }

    const sourceType = text('sourceType') ?? ''
    if (sourceType.trim() === '') add('SourceType', 'The SourceType field is required.')
    else if (sourceType.length > 60) add('SourceType', 'The field SourceType must be a string with a maximum length of 60.')

    const evidenceKind = text('evidenceKind') ?? ''
    if (evidenceKind.trim() === '') add('EvidenceKind', 'The EvidenceKind field is required.')
    else if (evidenceKind.length > 30) add('EvidenceKind', 'The field EvidenceKind must be a string with a maximum length of 30.')

    let sourceId = 0
    const rawSourceId = text('sourceId')
    if (rawSourceId !== null && rawSourceId !== '') {
      const trimmed = rawSourceId.trim()
      if (/^-?\d+$/.test(trimmed) && BigInt(trimmed) <= BigInt(LongMaxValue) && BigInt(trimmed) >= -BigInt(LongMaxValue) - 1n) {
        sourceId = Number(trimmed)
      } else {
        add('SourceId', `The value '${rawSourceId}' is not valid for SourceId.`)
      }
    }
    if (errors.SourceId === undefined && sourceId < 1) {
      add('SourceId', 'The field SourceId must be between 1 and 9.223372036854776E+18.')
    }

    const fileValue = form.get('file') ?? form.get('File')
    const file = fileValue !== null && typeof fileValue !== 'string' ? fileValue : null
    if (file === null) add('File', 'The File field is required.')

    if (Object.keys(errors).length > 0) {
      throw new ModelValidationError(errors)
    }

    return { sourceType, sourceId, evidenceKind, file }
  }
}

/** [Authorize(Roles = "CEO,Supervisor,Engineer,Foreman,Storekeeper,Procurement Officer,Finance Officer,Auditor")] [Route("api/v1/evidence")] */
export const EvidenceController: ControllerMetadata<EvidenceControllerImpl> = {
  route: 'evidence',
  create: services => new EvidenceControllerImpl(services.evidenceService),
  roles: ['CEO', 'Supervisor', 'Engineer', 'Foreman', 'Storekeeper', 'Procurement Officer', 'Finance Officer', 'Auditor'],
  actions: [
    {
      method: 'POST',
      template: '',
      roles: ['Supervisor', 'Engineer', 'Foreman', 'Storekeeper', 'Procurement Officer', 'Finance Officer'],
      rateLimit: 'evidence-upload',
      handler: c => c.upload(),
    },
    { method: 'GET', template: 'source/{sourceType}/{sourceId:long}', handler: c => c.getForSource() },
    { method: 'GET', template: '{documentId:guid}/content', handler: c => c.download() },
  ],
}
