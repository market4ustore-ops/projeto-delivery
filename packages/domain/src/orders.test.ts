import { describe, expect, it } from 'vitest';
import {
  assertOrderTotals,
  historyEvent,
  nextOrderRevision,
  transitionOrder,
} from './orders';
import { money } from './money';
describe('Order', () => {
  it('supports delivery lifecycle', () => {
    expect(transitionOrder('CONFIRMED', 'PREPARING', 'DELIVERY')).toBe(
      'PREPARING',
    );
    expect(transitionOrder('READY', 'OUT_FOR_DELIVERY', 'DELIVERY')).toBe(
      'OUT_FOR_DELIVERY',
    );
    expect(transitionOrder('OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY')).toBe(
      'DELIVERED',
    );
  });
  it('supports pickup without dispatch', () => {
    expect(transitionOrder('READY', 'DELIVERED', 'PICKUP')).toBe('DELIVERED');
    expect(() =>
      transitionOrder('READY', 'OUT_FOR_DELIVERY', 'PICKUP'),
    ).toThrow('INVALID_ORDER_TRANSITION');
  });
  it('rejects invalid and terminal transitions', () => {
    expect(() => transitionOrder('CONFIRMED', 'READY', 'DELIVERY')).toThrow(
      'INVALID_ORDER_TRANSITION',
    );
    expect(() => transitionOrder('CANCELED', 'PREPARING', 'DELIVERY')).toThrow(
      'ORDER_ALREADY_CANCELED',
    );
    expect(() => transitionOrder('DELIVERED', 'CANCELED', 'DELIVERY')).toThrow(
      'ORDER_ALREADY_DELIVERED',
    );
  });
  it('allows explicit cancellation', () =>
    expect(transitionOrder('PREPARING', 'CANCELED', 'DELIVERY')).toBe(
      'CANCELED',
    ));
  it('protects revision', () => {
    expect(nextOrderRevision(1, 1)).toBe(2);
    expect(() => nextOrderRevision(2, 1)).toThrow('ORDER_REVISION_CONFLICT');
  });
  it('validates money totals', () =>
    expect(
      assertOrderTotals(
        [{ lineTotal: money(1000n) }, { lineTotal: money(500n) }],
        money(1500n),
        money(300n),
        money(1800n),
      ),
    ).toEqual(money(1500n)));
  it('creates typed history events', () => {
    expect(historyEvent(null, 'CONFIRMED').type).toBe('ORDER_CREATED');
    expect(historyEvent('READY', 'DELIVERED').type).toBe('ORDER_DELIVERED');
  });
});
