import { asc, count, eq } from 'drizzle-orm'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { RoleResponseDto } from '@/ConstructionMS.Application/DTOs/Roles/RoleResponseDto'
import type { IRoleService } from '@/ConstructionMS.Application/Services/Roles/IRoleService'
import type { AppDbContext } from '../../Data/AppDbContext'
import { roles } from '../../Data/schema'

type Role = typeof roles.$inferSelect

/** Drizzle read service for fixed system roles. */
export class RoleService implements IRoleService {
  constructor(private readonly db: AppDbContext) {}

  async getAllAsync(page: number, pageSize: number): Promise<PaginatedResult<RoleResponseDto>> {
    const pagination = Pagination.normalize(page, pageSize)
    const [{ value: totalCount } = { value: 0 }] = await this.db.select({ value: count() }).from(roles)
    const entities = await this.db
      .select()
      .from(roles)
      .orderBy(asc(roles.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize)

    return createPaginatedResult({
      items: entities.map(toDto),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  async getByIdAsync(id: number): Promise<RoleResponseDto | null> {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1)
    return role ? toDto(role) : null
  }
}

function toDto(r: Role): RoleResponseDto {
  return { id: r.id, roleName: r.roleName, description: r.description, createdAt: r.createdAt }
}
