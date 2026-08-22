import { money, type Money } from './money.js';
export const orderStatuses = [
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELED',
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export const orderErrorCodes = [
  'ORDER_NOT_FOUND',
  'CHECKOUT_NOT_READY',
  'CHECKOUT_STALE',
  'ORDER_REVISION_CONFLICT',
  'INVALID_ORDER_TRANSITION',
  'ORDER_ALREADY_CANCELED',
  'ORDER_ALREADY_DELIVERED',
  'CROSS_LOCATION_REFERENCE',
] as const;
export type OrderErrorCode = (typeof orderErrorCodes)[number];
export class OrderError extends Error {
  constructor(readonly code: OrderErrorCode) {
    super(code);
  }
}
const transitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  CONFIRMED: ['PREPARING', 'CANCELED'],
  PREPARING: ['READY', 'CANCELED'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELED'],
  DELIVERED: [],
  CANCELED: [],
};
export function transitionOrder(
  current: OrderStatus,
  next: OrderStatus,
  fulfillment: 'DELIVERY' | 'PICKUP',
) {
  if (current === 'CANCELED') throw new OrderError('ORDER_ALREADY_CANCELED');
  if (current === 'DELIVERED') throw new OrderError('ORDER_ALREADY_DELIVERED');
  if (
    !transitions[current].includes(next) ||
    (fulfillment === 'PICKUP' && next === 'OUT_FOR_DELIVERY')
  )
    throw new OrderError('INVALID_ORDER_TRANSITION');
  return next;
}
export function nextOrderRevision(current: number, expected: number) {
  if (current !== expected) throw new OrderError('ORDER_REVISION_CONFLICT');
  return current + 1;
}
export function assertOrderTotals(
  items: readonly { lineTotal: Money }[],
  subtotal: Money,
  fee: Money,
  total: Money,
) {
  const sum = items.reduce((n, i) => n + i.lineTotal.minorUnits, 0n);
  if (sum !== subtotal.minorUnits || sum + fee.minorUnits !== total.minorUnits)
    throw new Error('INVALID_ORDER_TOTALS');
  return money(sum);
}
export type OrderHistoryEvent = Readonly<{
  from: OrderStatus | null;
  to: OrderStatus;
  type:
    | 'ORDER_CREATED'
    | 'ORDER_STATUS_CHANGED'
    | 'ORDER_CANCELED'
    | 'ORDER_DELIVERED';
}>;
export function historyEvent(
  from: OrderStatus | null,
  to: OrderStatus,
): OrderHistoryEvent {
  return {
    from,
    to,
    type:
      from === null
        ? 'ORDER_CREATED'
        : to === 'CANCELED'
          ? 'ORDER_CANCELED'
          : to === 'DELIVERED'
            ? 'ORDER_DELIVERED'
            : 'ORDER_STATUS_CHANGED',
  };
}
