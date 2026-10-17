import { and, asc, count, eq, ne, sql } from 'drizzle-orm'
import { InvalidOperationError } from '@/ConstructionMS.Application/Common/Exceptions'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { CreateMaterialRequestDto } from '@/ConstructionMS.Application/DTOs/Materials/CreateMaterialRequestDto'
import type { MaterialResponseDto } from '@/ConstructionMS.Application/DTOs/Materials/MaterialResponseDto'
import type { UpdateMaterialRequestDto } from '@/ConstructionMS.Application/DTOs/Materials/UpdateMaterialRequestDto'
import type { IMaterialService } from '@/ConstructionMS.Application/Services/Materials/IMaterialService'
import { InputNormalizer } from '../../Common/InputNormalizer'
import { IsolationLevel, type AppDbContext, type DbExecutor } from '../../Data/AppDbContext'
import {
  materials,
  openingInventoryLines,
  materialTechnicalAcceptancePolicyEvents,
  requisitions,
  stockBalances,
  stockLedgerEntries,
  stockTransfers,
} from '../../Data/schema'

type Material = typeof materials.$inferSelect

/** Drizzle implementation of IMaterialService. */
export class MaterialService implements IMaterialService {
  constructor(private readonly db: AppDbContext) {}

  async getAllAsync(page: number, pageSize: number): Promise<PaginatedResult<MaterialResponseDto>> {
    const pagination = Pagination.normalize(page, pageSize)
    const [{ value: totalCount } = { value: 0 }] = await this.db.select({ value: count() }).from(materials)

    const entities = await this.db
      .select()
      .from(materials)
      .orderBy(asc(materials.name), asc(materials.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize)

    return createPaginatedResult({
      items: entities.map(toDto),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  async getByIdAsync(id: number): Promise<MaterialResponseDto | null> {
    const [material] = await this.db.select().from(materials).where(eq(materials.id, id)).limit(1)
    return material ? toDto(material) : null
  }

  async createAsync(dto: CreateMaterialRequestDto): Promise<MaterialResponseDto> {
    const name = InputNormalizer.requiredText(dto.name, 'Name', 2, 150)
    const unit = InputNormalizer.requiredText(dto.unit, 'Unit', 1, 30)
    return await this.db.transaction(async (tx) => {
      if (await this.hasEquivalentAsync(tx, name, unit)) {
        throw new InvalidOperationError('That material and unit already exist in the catalog.')
      }

      const [material] = await tx
        .insert(materials)
        .values({
          name,
          category: InputNormalizer.optionalText(dto.category, 'Category', 100),
          unit,
          standardPrice: InputNormalizer.nonNegative(dto.standardPrice, 'StandardPrice', 18, 2),
          reorderLevel: InputNormalizer.nonNegative(dto.reorderLevel, 'ReorderLevel', 18, 3),
          requiresTechnicalAcceptance: true,
          createdAt: new Date(),
        })
        .returning()
      return toDto(material!)
    }, { isolationLevel: IsolationLevel.Serializable })
  }

  async updateAsync(id: number, dto: UpdateMaterialRequestDto): Promise<MaterialResponseDto | null> {
    const name = InputNormalizer.requiredText(dto.name, 'Name', 2, 150)
    const category = InputNormalizer.optionalText(dto.category, 'Category', 100)
    const unit = InputNormalizer.requiredText(dto.unit, 'Unit', 1, 30)
    const standardPrice = InputNormalizer.nonNegative(dto.standardPrice, 'StandardPrice', 18, 2)
    const reorderLevel = InputNormalizer.nonNegative(dto.reorderLevel, 'ReorderLevel', 18, 3)
    return await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM "Materials" WHERE "Id" = ${id} FOR UPDATE`)
      const [material] = await tx.select().from(materials).where(eq(materials.id, id)).limit(1)
      if (!material) {
        return null
      }

      if (await this.hasEquivalentAsync(tx, name, unit, id)) {
        throw new InvalidOperationError('That material and unit already exist in the catalog.')
      }

      if (material.unit !== unit
        && (await anyAsync(tx, requisitions, eq(requisitions.materialId, id))
          || await anyAsync(tx, stockBalances, eq(stockBalances.materialId, id))
          || await anyAsync(tx, stockLedgerEntries, eq(stockLedgerEntries.materialId, id))
          || await anyAsync(tx, stockTransfers, eq(stockTransfers.materialId, id))
          || await anyAsync(tx, openingInventoryLines, eq(openingInventoryLines.materialId, id)))) {
        throw new InvalidOperationError('The material unit cannot change after the material has transaction history.')
      }

      const [updated] = await tx
        .update(materials)
        .set({ name, category, unit, standardPrice, reorderLevel })
        .where(eq(materials.id, id))
        .returning()
      return toDto(updated!)
    }, { isolationLevel: IsolationLevel.Serializable })
  }

  private async hasEquivalentAsync(tx: DbExecutor, name: string, unit: string, excludingId: number | null = null): Promise<boolean> {
    const nameKey = name.trim().toLowerCase()
    const unitKey = unit.trim().toLowerCase()
    const [row] = await tx
      .select({ id: materials.id })
      .from(materials)
      .where(and(
        excludingId === null ? undefined : ne(materials.id, excludingId),
        eq(materials.normalizedName, nameKey),
        eq(materials.normalizedUnit, unitKey)))
      .limit(1)
    return row !== undefined
  }

  async setTechnicalAcceptancePolicyAsync(
    id: number,
    required: boolean,
    actorUserId: number,
  ): Promise<MaterialResponseDto | null> {
    return await this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM "Materials" WHERE "Id" = ${id} FOR UPDATE`)
      const [material] = await tx.select().from(materials).where(eq(materials.id, id)).limit(1)
      if (!material) return null

      if (material.requiresTechnicalAcceptance === required) {
        return toDto(material)
      }
      const previous = material.requiresTechnicalAcceptance
      await tx.insert(materialTechnicalAcceptancePolicyEvents).values({
        materialId: material.id,
        previousRequired: previous,
        required,
        changedByUserId: actorUserId,
        changedAt: new Date(),
      })
      const [updated] = await tx
        .update(materials)
        .set({ requiresTechnicalAcceptance: required })
        .where(eq(materials.id, id))
        .returning()
      return toDto(updated!)
    }, { isolationLevel: IsolationLevel.Serializable })
  }
}

async function anyAsync(
  tx: DbExecutor,
  table: typeof requisitions | typeof stockBalances | typeof stockLedgerEntries | typeof stockTransfers | typeof openingInventoryLines,
  condition: ReturnType<typeof eq>,
): Promise<boolean> {
  const rows = await tx.select({ one: sql<number>`1` }).from(table as typeof requisitions).where(condition).limit(1)
  return rows.length > 0
}

function toDto(m: Material): MaterialResponseDto {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    unit: m.unit,
    standardPrice: m.standardPrice,
    reorderLevel: m.reorderLevel,
    requiresTechnicalAcceptance: m.requiresTechnicalAcceptance,
    createdAt: m.createdAt,
  }
}
