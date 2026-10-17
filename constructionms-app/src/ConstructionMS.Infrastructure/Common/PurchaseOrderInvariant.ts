import { InvalidOperationError } from '@/ConstructionMS.Application/Common/Exceptions'

export const PurchaseOrderInvariant = Object.freeze({
  requireSingleLine<TLine>(order: { lines: TLine[] }): TLine {
    if (order.lines.length !== 1) {
      throw new InvalidOperationError('The purchase order must contain exactly one line for this workflow.')
    }

    return order.lines[0]!
  },
})
