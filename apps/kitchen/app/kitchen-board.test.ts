import { describe, expect, it } from 'vitest';
import type { KitchenOrder } from '@delivery/schemas';
import {
  elapsedMinutes,
  groupKitchenOrders,
  isOperationallyLate,
} from './kitchen-board';

const order = (status: KitchenOrder['status'], confirmedAt: string) =>
  ({
    id: crypto.randomUUID(),
    displayNumber: '0001',
    status,
    revision: 0,
    confirmedAt,
    scheduledFor: null,
    fulfillmentType: 'DELIVERY',
    items: [],
  }) satisfies KitchenOrder;

describe('Kitchen board projection', () => {
  it('groups only operational states', () => {
    const grouped = groupKitchenOrders([
      order('READY', '2026-08-23T10:00:00Z'),
      order('CONFIRMED', '2026-08-23T09:00:00Z'),
    ]);
    expect(grouped.CONFIRMED).toHaveLength(1);
    expect(grouped.PREPARING).toHaveLength(0);
    expect(grouped.READY).toHaveLength(1);
  });
  it('sorts oldest orders first', () => {
    const grouped = groupKitchenOrders([
      order('CONFIRMED', '2026-08-23T10:00:00Z'),
      order('CONFIRMED', '2026-08-23T09:00:00Z'),
    ]);
    expect(grouped.CONFIRMED[0]?.confirmedAt).toContain('09:00');
  });
  it('calculates elapsed time from an authoritative timestamp', () =>
    expect(
      elapsedMinutes(
        '2026-08-23T09:55:00Z',
        Date.parse('2026-08-23T10:00:00Z'),
      ),
    ).toBe(5));
  it('marks delay with a configurable presentation threshold', () => {
    expect(isOperationallyLate(19)).toBe(false);
    expect(isOperationallyLate(20)).toBe(true);
  });
});
