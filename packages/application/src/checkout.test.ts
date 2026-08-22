import { describe, expect, it, vi } from 'vitest';
import { money } from '@delivery/domain';
import { prepareCheckout, type CheckoutPort } from './checkout';
const address = {
  postalCode: '01001000',
  street: 'Sé',
  number: '1',
  neighborhood: 'Sé',
  city: 'São Paulo',
  state: 'SP',
};
const port = (): CheckoutPort => ({
  current: vi.fn().mockResolvedValue({
    status: 'IN_PROGRESS',
    revision: 2,
    locationId: 'l',
    customerName: 'Ana',
    customerPhone: '119',
    fulfillmentType: 'DELIVERY',
    address,
    cartRevision: 1,
    subtotal: money(1000n),
  }),
  save: vi.fn((x) => Promise.resolve(x)),
});
describe('Checkout application', () => {
  it('prepares delivery using the fee boundary', async () =>
    expect(
      await prepareCheckout(
        port(),
        { calculate: vi.fn().mockResolvedValue(money(500n)) },
        { expectedRevision: 2, idempotencyKey: 'k' },
      ),
    ).toMatchObject({
      nextRevision: 3,
      deliveryFee: money(500n),
      total: money(1500n),
    }));
  it('prepares pickup without a delivery fee', async () => {
    const p = port();
    p.current = vi.fn().mockResolvedValue({
      status: 'IN_PROGRESS',
      revision: 0,
      locationId: 'l',
      customerName: 'Ana',
      customerPhone: '1',
      fulfillmentType: 'PICKUP',
      cartRevision: 1,
      subtotal: money(100n),
    });
    expect(
      await prepareCheckout(
        p,
        { calculate: vi.fn() },
        { expectedRevision: 0, idempotencyKey: 'k' },
      ),
    ).toMatchObject({ deliveryFee: money(0n), total: money(100n) });
  });
  it('rejects missing information', async () => {
    const p = port();
    p.current = vi.fn().mockResolvedValue({
      status: 'IN_PROGRESS',
      revision: 0,
      locationId: 'l',
      cartRevision: 1,
      subtotal: money(0n),
    });
    await expect(
      prepareCheckout(
        p,
        { calculate: vi.fn() },
        { expectedRevision: 0, idempotencyKey: 'k' },
      ),
    ).rejects.toThrow('CUSTOMER_INFO_REQUIRED');
  });
  it('rejects revision conflict', async () =>
    await expect(
      prepareCheckout(
        port(),
        { calculate: vi.fn().mockResolvedValue(money(0n)) },
        { expectedRevision: 1, idempotencyKey: 'k' },
      ),
    ).rejects.toThrow('CHECKOUT_REVISION_CONFLICT'));
});
