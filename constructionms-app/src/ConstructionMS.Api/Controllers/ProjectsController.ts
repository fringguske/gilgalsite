import { INT_MAX, Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { CreateCostCodeRequestDto } from '@/ConstructionMS.Application/DTOs/Projects/CreateCostCodeRequestDto'
import { CreateProjectProgressVerificationRequestDto } from '@/ConstructionMS.Application/DTOs/Projects/CreateProjectProgressVerificationRequestDto'
import { CreateProjectRequestDto } from '@/ConstructionMS.Application/DTOs/Projects/CreateProjectRequestDto'
import { SetProjectBudgetRequestDto } from '@/ConstructionMS.Application/DTOs/Projects/SetProjectBudgetRequestDto'
import { UpdateProjectRequestDto } from '@/ConstructionMS.Application/DTOs/Projects/UpdateProjectRequestDto'
import type { IProjectService } from '@/ConstructionMS.Application/Services/Projects/IProjectService'
import { ApiResponse } from '../Common/ApiResponse'
import { ControllerBase, type ActionResult, type ControllerMetadata } from '../Common/ControllerBase'

/**
 * Project records, executive summaries, versioned budgets and independent
 * engineer progress verifications.
 */
export class ProjectsControllerImpl extends ControllerBase {
  constructor(private readonly projectService: IProjectService) { super() }

  /** Returns all projects for CEO/auditor users and only active project assignments for operational users. */
  async getAll(): Promise<ActionResult> {
    const page = this.queryInt('page', { defaultValue: 1, range: [1, INT_MAX] })
    const pageSize = this.queryInt('pageSize', { defaultValue: Pagination.DefaultPageSize, range: [1, Pagination.MaxPageSize] })
    const result = await this.projectService.getAllAsync(this.currentUserId(), page, pageSize)
    return this.ok(ApiResponse.ok(result))
  }

  /** Returns a project only when it is inside the current user's scope. */
  async getById(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const project = await this.projectService.getByIdAsync(this.currentUserId(), id)
    if (project === null) {
      return this.notFound(ApiResponse.fail(`Project with ID ${id} was not found.`))
    }

    return this.ok(ApiResponse.ok(project))
  }

  /** Returns the current budget allocation and latest engineer-verified physical progress. */
  async getSummary(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const summary = await this.projectService.getSummaryAsync(this.currentUserId(), id)
    if (summary === null) {
      return this.notFound(ApiResponse.fail(`Project with ID ${id} was not found.`))
    }

    return this.ok(ApiResponse.ok(summary))
  }

  /** Creates a new site and its first immutable budget revision. */
  async create(): Promise<ActionResult> {
    const request = await this.fromBody(CreateProjectRequestDto)
    const project = await this.projectService.createAsync(this.currentUserId(), request)
    return this.created(`/api/v1/projects/${project.id}`, ApiResponse.ok(project))
  }

  /** Updates site master data. A budget change creates a new budget revision. */
  async update(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(UpdateProjectRequestDto)
    const { dto: project, error } = await this.projectService.updateAsync(this.currentUserId(), id, request)
    if (error !== null) {
      return this.badRequest(ApiResponse.fail(error))
    }

    if (project === null) {
      return this.notFound(ApiResponse.fail(`Project with ID ${id} was not found.`))
    }

    return this.ok(ApiResponse.ok(project))
  }

  /** Adds a stable cost code that future budget revisions can allocate. */
  async createCostCode(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(CreateCostCodeRequestDto)
    const costCode = await this.projectService.createCostCodeAsync(this.currentUserId(), id, request)
    return this.statusCode(201, ApiResponse.ok(costCode))
  }

  /** Appends a complete approved budget revision and cost-code split. */
  async setBudget(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(SetProjectBudgetRequestDto)
    const budget = await this.projectService.setBudgetAsync(this.currentUserId(), id, request)
    return this.statusCode(201, ApiResponse.ok(budget))
  }

  /** Appends an engineer's physical-progress verification (no update or delete route by design). */
  async verifyProgress(): Promise<ActionResult> {
    const id = this.routeInt('id')
    const request = await this.fromBody(CreateProjectProgressVerificationRequestDto)
    const verification = await this.projectService.addProgressVerificationAsync(this.currentUserId(), id, request)
    return this.statusCode(201, ApiResponse.ok(verification))
  }
}

/** [Authorize] [Route("api/v1/projects")] */
export const ProjectsController: ControllerMetadata<ProjectsControllerImpl> = {
  route: 'projects',
  create: services => new ProjectsControllerImpl(services.projectService),
  actions: [
    { method: 'GET', template: '', handler: c => c.getAll() },
    { method: 'GET', template: '{id:int}', handler: c => c.getById() },
    { method: 'GET', template: '{id:int}/summary', handler: c => c.getSummary() },
    { method: 'POST', template: '', roles: ['CEO'], handler: c => c.create() },
    { method: 'PUT', template: '{id:int}', roles: ['CEO'], handler: c => c.update() },
    { method: 'POST', template: '{id:int}/cost-codes', roles: ['CEO'], handler: c => c.createCostCode() },
    { method: 'POST', template: '{id:int}/budgets', roles: ['CEO'], handler: c => c.setBudget() },
    { method: 'POST', template: '{id:int}/progress-verifications', roles: ['Engineer'], handler: c => c.verifyProgress() },
  ],
}
