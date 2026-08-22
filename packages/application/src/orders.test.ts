import { describe, expect, it, vi } from 'vitest';
import {
  createOrderFromCheckout,
  updateOrderStatus,
  type OrderCommandPort,
} from './orders';
import type { ActorContext } from './index';
const actor = { userId: 'u', locationId: 'l', role: 'OWNER' } as ActorContext;
const port = (): OrderCommandPort => ({
  createFromCheckout: vi.fn().mockResolvedValue({ id: 'o' }),
  current: vi.fn().mockResolvedValue({
    status: 'CONFIRMED',
    revision: 0,
    fulfillment: 'DELIVERY',
    locationId: 'l',
  }),
  updateStatus: vi.fn((x) => Promise.resolve(x)),
});
describe('Order application', () => {
  it('delegates idempotent checkout conversion', async () =>
    expect(
      await createOrderFromCheckout(port(), {
        checkoutToken: 't',
        idempotencyKey: 'k',
      }),
    ).toEqual({ id: 'o' }));
  it('updates status with permission and revision', async () =>
    expect(
      await updateOrderStatus(port(), actor, {
        orderId: 'o',
        status: 'PREPARING',
        expectedRevision: 0,
      }),
    ).toMatchObject({ status: 'PREPARING', nextRevision: 1 }));
  it('rejects revision conflicts', async () =>
    await expect(
      updateOrderStatus(port(), actor, {
        orderId: 'o',
        status: 'PREPARING',
        expectedRevision: 2,
      }),
    ).rejects.toThrow('ORDER_REVISION_CONFLICT'));
  it('rejects invalid transitions', async () =>
    await expect(
      updateOrderStatus(port(), actor, {
        orderId: 'o',
        status: 'DELIVERED',
        expectedRevision: 0,
      }),
    ).rejects.toThrow('INVALID_ORDER_TRANSITION'));
  it('rejects cross-location access', async () =>
    await expect(
      updateOrderStatus(
        port(),
        {
          ...actor,
          locationId: 'other' as NonNullable<typeof actor.locationId>,
        },
        { orderId: 'o', status: 'PREPARING', expectedRevision: 0 },
      ),
    ).rejects.toThrow('CROSS_LOCATION_REFERENCE'));
});
