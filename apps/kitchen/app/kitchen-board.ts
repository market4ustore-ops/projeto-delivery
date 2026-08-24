import type { KitchenOrder } from '@delivery/schemas';

export const kitchenColumns = [
  { status: 'CONFIRMED', label: 'Novos' },
  { status: 'PREPARING', label: 'Em preparo' },
  { status: 'READY', label: 'Prontos' },
] as const;

export function groupKitchenOrders(orders: readonly KitchenOrder[]) {
  const oldestFirst = [...orders].sort(
    (a, b) => Date.parse(a.confirmedAt) - Date.parse(b.confirmedAt),
  );
  return Object.fromEntries(
    kitchenColumns.map(({ status }) => [
      status,
      oldestFirst.filter((order) => order.status === status),
    ]),
  ) as Record<KitchenOrder['status'], KitchenOrder[]>;
}

export function elapsedMinutes(confirmedAt: string, now = Date.now()) {
  return Math.max(0, Math.floor((now - Date.parse(confirmedAt)) / 60_000));
}

export function isOperationallyLate(minutes: number, threshold = 20) {
  return minutes >= threshold;
}
