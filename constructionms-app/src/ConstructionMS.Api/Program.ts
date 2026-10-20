import { ItVerificationOptions } from '@/ConstructionMS.Application/Configuration/ItVerificationOptions'
import { TaskInboxOptions } from '@/ConstructionMS.Application/Configuration/TaskInboxOptions'
import { EvidenceStorageOptions } from '@/ConstructionMS.Application/Configuration/EvidenceStorageOptions'
import { EmailVerificationOptions } from '@/ConstructionMS.Application/Configuration/EmailVerificationOptions'
import { createLogger } from '@/ConstructionMS.Application/Common/Logger'
import { getAppDbContext, type AppDbContext } from '@/ConstructionMS.Infrastructure/Data/AppDbContext'
import { ActorRoleResolver } from '@/ConstructionMS.Infrastructure/Services/Auth/ActorRoleResolver'
import { AuthenticationService } from '@/ConstructionMS.Infrastructure/Services/Auth/AuthenticationService'
import { AccessRequestService } from '@/ConstructionMS.Infrastructure/Services/Auth/AccessRequestService'
import { CredentialService } from '@/ConstructionMS.Infrastructure/Services/Auth/CredentialService'
import { EmailVerificationService } from '@/ConstructionMS.Infrastructure/Services/Auth/EmailVerificationService'
import { UserProjectAssignmentService } from '@/ConstructionMS.Infrastructure/Services/Auth/UserProjectAssignmentService'
import { DashboardService } from '@/ConstructionMS.Infrastructure/Services/Dashboard/DashboardService'
import { UserService } from '@/ConstructionMS.Infrastructure/Services/Users/UserService'
import { RoleService } from '@/ConstructionMS.Infrastructure/Services/Roles/RoleService'
import { ProjectService } from '@/ConstructionMS.Infrastructure/Services/Projects/ProjectService'
import { MaterialService } from '@/ConstructionMS.Infrastructure/Services/Materials/MaterialService'
import { MaterialCatalogRequestService } from '@/ConstructionMS.Infrastructure/Services/Materials/MaterialCatalogRequestService'
import { SupplierService } from '@/ConstructionMS.Infrastructure/Services/Suppliers/SupplierService'
import { SupplierOnboardingService } from '@/ConstructionMS.Infrastructure/Services/Suppliers/SupplierOnboardingService'
import { RequisitionWorkflowService } from '@/ConstructionMS.Infrastructure/Services/Requisitions/RequisitionWorkflowService'
import { SourcingService } from '@/ConstructionMS.Infrastructure/Services/PurchaseOrders/SourcingService'
import { PurchaseOrderService } from '@/ConstructionMS.Infrastructure/Services/PurchaseOrders/PurchaseOrderService'
import { InventoryWorkflowService } from '@/ConstructionMS.Infrastructure/Services/Inventory/InventoryWorkflowService'
import { FinanceWorkflowService } from '@/ConstructionMS.Infrastructure/Services/Finance/FinanceWorkflowService'
import { PettyCashService } from '@/ConstructionMS.Infrastructure/Services/Finance/PettyCashService'
import { ControlWorkspaceService } from '@/ConstructionMS.Infrastructure/Services/Controls/ControlWorkspaceService'
import { MyTasksService } from '@/ConstructionMS.Infrastructure/Services/Tasks/MyTasksService'
import { InAppNotificationService } from '@/ConstructionMS.Infrastructure/Services/Tasks/InAppNotificationService'
import { SupabasePrivateEvidenceStorage } from '@/ConstructionMS.Infrastructure/Services/Evidence/SupabasePrivateEvidenceStorage'
import { EvidenceService } from '@/ConstructionMS.Infrastructure/Services/Evidence/EvidenceService'
import { ResendEmailSender } from '@/ConstructionMS.Infrastructure/Services/Email/ResendEmailSender'
import { HttpCurrentActorContext } from './Common/HttpCurrentActorContext'
import type { HttpContext } from './Common/HttpContext'

/** Options are validated once per server instance (ValidateOnStart equivalent). */
const itVerificationOptions = lazy(() => ItVerificationOptions.fromEnvironment())
const taskInboxOptions = lazy(() => TaskInboxOptions.fromEnvironment())
const evidenceStorageOptions = lazy(() => EvidenceStorageOptions.fromEnvironment())
const emailVerificationOptions = lazy(() => EmailVerificationOptions.fromEnvironment())

function lazy<T>(factory: () => T): () => T {
  let value: T | undefined
  let created = false
  return () => {
    if (!created) {
      value = factory()
      created = true
    }
    return value as T
  }
}

/** Evidence storage is a singleton, like AddSingleton<IEvidenceStorage>. */
const evidenceStorage = lazy(() => new SupabasePrivateEvidenceStorage(evidenceStorageOptions()))

/** Null while Resend is not configured, which turns emailed verification codes off. */
const emailSender = lazy(() => emailVerificationOptions().enabled
  ? new ResendEmailSender(emailVerificationOptions(), createLogger('ResendEmailSender'))
  : null)

/**
 * The dependency-injection container. One ServiceScope is created per HTTP request (or per
 * cron invocation), like an ASP.NET scope; every service is created lazily and shared within
 * the scope. This is the Program.cs `builder.Services.AddScoped<...>()` list.
 */
export class ServiceScope {
  readonly db: AppDbContext = getAppDbContext()
  private readonly cache = new Map<string, unknown>()

  constructor(readonly httpContext: HttpContext | null = null) {}

  private once<T>(key: string, factory: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, factory())
    return this.cache.get(key) as T
  }

  get currentActorContext() { return this.once('actor', () => new HttpCurrentActorContext(this.httpContext)) }
  get actorRoleResolver() {
    return this.once('roles', () => new ActorRoleResolver(this.db, this.currentActorContext, itVerificationOptions()))
  }
  get authenticationService() {
    return this.once('auth', () => new AuthenticationService(
      this.db, createLogger('AuthenticationService'), this.actorRoleResolver, emailVerificationOptions().enabled))
  }
  get accessRequestService() { return this.once('accessRequests', () => new AccessRequestService(this.db)) }
  get emailVerificationService() { return this.once('emailVerification', () => new EmailVerificationService(this.db, emailSender())) }
  get credentialService() {
    return this.once('credentials', () => new CredentialService(this.db, createLogger('CredentialService'), this.emailVerificationService))
  }
  get userProjectAssignmentService() { return this.once('assignments', () => new UserProjectAssignmentService(this.db)) }
  get dashboardService() { return this.once('dashboard', () => new DashboardService(this.db, this.authenticationService)) }
  get userService() { return this.once('users', () => new UserService(this.db)) }
  get roleService() { return this.once('roleService', () => new RoleService(this.db)) }
  get projectService() { return this.once('projects', () => new ProjectService(this.db, this.actorRoleResolver)) }
  get materialService() { return this.once('materials', () => new MaterialService(this.db)) }
  get materialCatalogRequestService() {
    return this.once('materialCatalogRequests', () => new MaterialCatalogRequestService(this.db, this.actorRoleResolver))
  }
  get supplierService() { return this.once('suppliers', () => new SupplierService(this.db)) }
  get supplierOnboardingService() {
    return this.once('supplierOnboarding', () => new SupplierOnboardingService(this.db, this.actorRoleResolver))
  }
  get requisitionWorkflowService() {
    return this.once('requisitions', () => new RequisitionWorkflowService(this.db, this.actorRoleResolver))
  }
  get sourcingService() { return this.once('sourcing', () => new SourcingService(this.db, this.actorRoleResolver)) }
  get purchaseOrderService() { return this.once('purchaseOrders', () => new PurchaseOrderService(this.db, this.actorRoleResolver)) }
  get inventoryWorkflowService() { return this.once('inventory', () => new InventoryWorkflowService(this.db, this.actorRoleResolver)) }
  get financeWorkflowService() { return this.once('finance', () => new FinanceWorkflowService(this.db, this.actorRoleResolver)) }
  get pettyCashService() { return this.once('pettyCash', () => new PettyCashService(this.db, this.actorRoleResolver)) }
  get controlWorkspaceService() { return this.once('controls', () => new ControlWorkspaceService(this.db, this.actorRoleResolver)) }
  get myTasksService() { return this.once('tasks', () => new MyTasksService(this.db, this.actorRoleResolver, taskInboxOptions())) }
  get inAppNotificationService() { return this.once('notifications', () => new InAppNotificationService(this.db, this.myTasksService)) }
  get evidenceStorage() { return evidenceStorage() }
  get evidenceService() { return this.once('evidence', () => new EvidenceService(this.db, this.actorRoleResolver, this.evidenceStorage)) }
}
