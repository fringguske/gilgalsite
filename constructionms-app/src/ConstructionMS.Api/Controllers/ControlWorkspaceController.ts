import { UnauthorizedAccessError } from '@/ConstructionMS.Application/Common/Exceptions'
import {
  CorrectionDecisionRequestDto,
  CreateControlledCorrectionRequestDto,
  CreateMaterialReturnRequestDto,
  CreateOpeningPositionRequestDto,
  CreateOperationalPeriodRequestDto,
  OpeningPositionDecisionRequestDto,
  PeriodActionRequestDto,
  PeriodDecisionRequestDto,
  ReceiveMaterialReturnRequestDto,
  ResolveMaterialIssueDisputeRequestDto,
  ReviewCustodyCloseoutRequestDto,
  SubmitCustodyCloseoutRequestDto,
} from '@/ConstructionMS.Application/DTOs/Controls/ControlWorkspaceDtos'
import { ClaimTypes } from '@/ConstructionMS.Application/Security/ApplicationClaimTypes'
import type { IControlWorkspaceService } from '@/ConstructionMS.Application/Services/Controls/IControlWorkspaceService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

export class ControlWorkspaceControllerImpl extends ControllerBase {
  constructor(private readonly controls: IControlWorkspaceService) { super() }

  async getCashAccounts(): Promise<ActionResult> {
    const projectId = this.queryInt('projectId', { defaultValue: null })
    return this.ok(ApiResponse.ok(await this.controls.getCashAccountsAsync(this.actorId(), this.role(), projectId)))
  }

  async getOpeningPositions(): Promise<ActionResult> {
    const projectId = this.queryInt('projectId', { defaultValue: null })
    return this.ok(ApiResponse.ok(await this.controls.getOpeningPositionsAsync(this.actorId(), this.role(), projectId)))
  }

  async createOpeningPosition(): Promise<ActionResult> {
    const request = await this.fromBody(CreateOpeningPositionRequestDto)
    const result = await this.controls.createOpeningPositionAsync(request, this.actorId(), this.role())
    return this.created(`/api/v1/controls/opening-positions/${result.id}`, ApiResponse.ok(result))
  }

  async decideOpeningPosition(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(OpeningPositionDecisionRequestDto)
    return this.ok(ApiResponse.ok(await this.controls.decideOpeningPositionAsync(id, request, this.actorId(), this.role())))
  }

  async verifyOpeningPosition(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(OpeningPositionDecisionRequestDto)
    return this.ok(ApiResponse.ok(await this.controls.verifyOpeningPositionAsync(id, request, this.actorId(), this.role())))
  }

  async getMaterialReturns(): Promise<ActionResult> {
    const projectId = this.queryInt('projectId', { defaultValue: null })
    return this.ok(ApiResponse.ok(await this.controls.getMaterialReturnsAsync(this.actorId(), this.role(), projectId)))
  }

  async resolveMaterialIssueDispute(): Promise<ActionResult> {
    const materialIssueId = this.routeInt('materialIssueId')
    const request = await this.fromBody(ResolveMaterialIssueDisputeRequestDto)
    return this.ok(ApiResponse.ok(
      await this.controls.resolveMaterialIssueDisputeAsync(materialIssueId, request, this.actorId(), this.role())))
  }

  async createMaterialReturn(): Promise<ActionResult> {
    const request = await this.fromBody(CreateMaterialReturnRequestDto)
    const result = await this.controls.createMaterialReturnAsync(request, this.actorId(), this.role())
    return this.created(`/api/v1/controls/custody/returns/${result.id}`, ApiResponse.ok(result))
  }

  async receiveMaterialReturn(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ReceiveMaterialReturnRequestDto)
    return this.ok(ApiResponse.ok(await this.controls.receiveMaterialReturnAsync(id, request, this.actorId(), this.role())))
  }

  async getCustodyCloseouts(): Promise<ActionResult> {
    const projectId = this.queryInt('projectId', { defaultValue: null })
    return this.ok(ApiResponse.ok(await this.controls.getCustodyCloseoutsAsync(this.actorId(), this.role(), projectId)))
  }

  async submitCustodyCloseout(): Promise<ActionResult> {
    const request = await this.fromBody(SubmitCustodyCloseoutRequestDto)
    const result = await this.controls.submitCustodyCloseoutAsync(request, this.actorId(), this.role())
    return this.created(`/api/v1/controls/custody/closeouts/${result.id}`, ApiResponse.ok(result))
  }

  async reviewCustodyCloseout(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(ReviewCustodyCloseoutRequestDto)
    return this.ok(ApiResponse.ok(await this.controls.reviewCustodyCloseoutAsync(id, request, this.actorId(), this.role())))
  }

  async getPeriods(): Promise<ActionResult> {
    const projectId = this.queryInt('projectId', { defaultValue: null })
    return this.ok(ApiResponse.ok(await this.controls.getPeriodsAsync(this.actorId(), this.role(), projectId)))
  }

  async createPeriod(): Promise<ActionResult> {
    const request = await this.fromBody(CreateOperationalPeriodRequestDto)
    const result = await this.controls.createPeriodAsync(request, this.actorId(), this.role())
    return this.created(`/api/v1/controls/periods/${result.id}`, ApiResponse.ok(result))
  }

  async submitPeriodClose(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(PeriodActionRequestDto)
    return this.ok(ApiResponse.ok(await this.controls.submitPeriodCloseAsync(id, request, this.actorId(), this.role())))
  }

  async decidePeriodClose(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(PeriodDecisionRequestDto)
    return this.ok(ApiResponse.ok(await this.controls.decidePeriodCloseAsync(id, request, this.actorId(), this.role())))
  }

  async getCorrections(): Promise<ActionResult> {
    const projectId = this.queryInt('projectId', { defaultValue: null })
    return this.ok(ApiResponse.ok(await this.controls.getCorrectionsAsync(this.actorId(), this.role(), projectId)))
  }

  async createCorrection(): Promise<ActionResult> {
    const request = await this.fromBody(CreateControlledCorrectionRequestDto)
    const result = await this.controls.createCorrectionAsync(request, this.actorId(), this.role())
    return this.created(`/api/v1/controls/corrections/${result.id}`, ApiResponse.ok(result))
  }

  async decideCorrection(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(CorrectionDecisionRequestDto)
    return this.ok(ApiResponse.ok(await this.controls.decideCorrectionAsync(id, request, this.actorId(), this.role())))
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
}

/** [Authorize(Roles = "Storekeeper,Foreman,Supervisor,Finance Officer,CEO,Auditor")] [Route("api/v1/controls")] */
export const ControlWorkspaceController: ControllerMetadata<ControlWorkspaceControllerImpl> = {
  route: 'controls',
  create: services => new ControlWorkspaceControllerImpl(services.controlWorkspaceService),
  roles: ['Storekeeper', 'Foreman', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor'],
  actions: [
    { method: 'GET', template: 'cash-accounts', roles: ['Finance Officer', 'CEO', 'Auditor'], handler: c => c.getCashAccounts() },
    {
      method: 'GET',
      template: 'opening-positions',
      roles: ['Storekeeper', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor'],
      handler: c => c.getOpeningPositions(),
    },
    { method: 'POST', template: 'opening-positions', roles: ['Storekeeper', 'Finance Officer'], handler: c => c.createOpeningPosition() },
    { method: 'POST', template: 'opening-positions/{id:long}/decision', roles: ['CEO'], handler: c => c.decideOpeningPosition() },
    { method: 'POST', template: 'opening-positions/{id:long}/verify', roles: ['Supervisor'], handler: c => c.verifyOpeningPosition() },
    { method: 'GET', template: 'custody/returns', handler: c => c.getMaterialReturns() },
    {
      method: 'POST',
      template: 'custody/disputes/{materialIssueId:long}/resolve',
      roles: ['Supervisor'],
      handler: c => c.resolveMaterialIssueDispute(),
    },
    { method: 'POST', template: 'custody/returns', roles: ['Foreman'], handler: c => c.createMaterialReturn() },
    { method: 'POST', template: 'custody/returns/{id:long}/receive', roles: ['Storekeeper'], handler: c => c.receiveMaterialReturn() },
    { method: 'GET', template: 'custody/closeouts', handler: c => c.getCustodyCloseouts() },
    { method: 'POST', template: 'custody/closeouts', roles: ['Foreman'], handler: c => c.submitCustodyCloseout() },
    { method: 'POST', template: 'custody/closeouts/{id:long}/review', roles: ['Supervisor'], handler: c => c.reviewCustodyCloseout() },
    {
      method: 'GET',
      template: 'periods',
      roles: ['Storekeeper', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor'],
      handler: c => c.getPeriods(),
    },
    { method: 'POST', template: 'periods', roles: ['Supervisor', 'Finance Officer'], handler: c => c.createPeriod() },
    { method: 'POST', template: 'periods/{id:long}/submit-close', roles: ['Supervisor', 'Finance Officer'], handler: c => c.submitPeriodClose() },
    { method: 'POST', template: 'periods/{id:long}/decision', roles: ['CEO'], handler: c => c.decidePeriodClose() },
    {
      method: 'GET',
      template: 'corrections',
      roles: ['Storekeeper', 'Supervisor', 'Finance Officer', 'CEO', 'Auditor'],
      handler: c => c.getCorrections(),
    },
    { method: 'POST', template: 'corrections', roles: ['Storekeeper', 'Finance Officer'], handler: c => c.createCorrection() },
    { method: 'POST', template: 'corrections/{id:long}/decision', roles: ['CEO'], handler: c => c.decideCorrection() },
  ],
}
