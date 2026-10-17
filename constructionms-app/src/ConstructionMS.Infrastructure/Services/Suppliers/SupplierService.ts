import { and, asc, count, eq, ne } from 'drizzle-orm'
import { InvalidOperationError } from '@/ConstructionMS.Application/Common/Exceptions'
import { Pagination } from '@/ConstructionMS.Application/Common/Pagination'
import { createPaginatedResult, type PaginatedResult } from '@/ConstructionMS.Application/Common/PaginatedResult'
import type { SupplierResponseDto } from '@/ConstructionMS.Application/DTOs/Suppliers/SupplierResponseDto'
import type { UpdateSupplierRequestDto } from '@/ConstructionMS.Application/DTOs/Suppliers/UpdateSupplierRequestDto'
import type { ISupplierService } from '@/ConstructionMS.Application/Services/Suppliers/ISupplierService'
import { InputNormalizer } from '../../Common/InputNormalizer'
import type { AppDbContext } from '../../Data/AppDbContext'
import { suppliers } from '../../Data/schema'

type Supplier = typeof suppliers.$inferSelect

/** Drizzle implementation of ISupplierService. */
export class SupplierService implements ISupplierService {
  constructor(private readonly db: AppDbContext) {}

  async getAllAsync(page: number, pageSize: number): Promise<PaginatedResult<SupplierResponseDto>> {
    const pagination = Pagination.normalize(page, pageSize)
    const [{ value: totalCount } = { value: 0 }] = await this.db.select({ value: count() }).from(suppliers)

    const entities = await this.db
      .select()
      .from(suppliers)
      .orderBy(asc(suppliers.name), asc(suppliers.id))
      .offset(pagination.offset)
      .limit(pagination.pageSize)

    return createPaginatedResult({
      items: entities.map(toDto),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
  }

  async getByIdAsync(id: number): Promise<SupplierResponseDto | null> {
    const [supplier] = await this.db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1)
    return supplier ? toDto(supplier) : null
  }

  async updateAsync(id: number, dto: UpdateSupplierRequestDto): Promise<SupplierResponseDto | null> {
    const [supplier] = await this.db.select().from(suppliers).where(eq(suppliers.id, id)).limit(1)
    if (!supplier) return null

    const kraPin = InputNormalizer.optionalUppercase(dto.kraPin, 'KraPin', 20)
    if (kraPin !== null) {
      const [existing] = await this.db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(ne(suppliers.id, id), eq(suppliers.normalizedKraPin, kraPin)))
        .limit(1)
      if (existing) {
        throw new InvalidOperationError('A supplier with that KRA PIN already exists.')
      }
    }

    const [updated] = await this.db
      .update(suppliers)
      .set({
        name: InputNormalizer.requiredText(dto.name, 'Name', 2, 200),
        contactPerson: InputNormalizer.optionalText(dto.contactPerson, 'ContactPerson', 150),
        phoneNumber: InputNormalizer.optionalText(dto.phoneNumber, 'PhoneNumber', 30),
        email: InputNormalizer.optionalEmail(dto.email, 'Email'),
        kraPin,
        mpesaNumber: InputNormalizer.optionalText(dto.mpesaNumber, 'MpesaNumber', 30),
        category: InputNormalizer.optionalText(dto.category, 'Category', 100),
      })
      .where(eq(suppliers.id, id))
      .returning()
    return toDto(updated!)
  }

  async setBlacklistStatusAsync(id: number, isBlacklisted: boolean): Promise<boolean> {
    const [supplier] = await this.db.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, id)).limit(1)
    if (!supplier) return false

    await this.db.update(suppliers).set({ isBlacklisted }).where(eq(suppliers.id, id))
    return true
  }
}

function toDto(s: Supplier): SupplierResponseDto {
  return {
    id: s.id,
    name: s.name,
    contactPerson: s.contactPerson,
    phoneNumber: s.phoneNumber,
    email: s.email,
    kraPin: s.kraPin,
    mpesaNumber: s.mpesaNumber,
    category: s.category,
    isBlacklisted: s.isBlacklisted,
    createdAt: s.createdAt,
  }
}
