import { describe, expect, it, vi } from 'vitest';
import { money } from '@delivery/domain';
import { configureCartItem, type CartCommandPort } from './cart';
const port = (): CartCommandPort => ({
  currentRevision: vi.fn().mockResolvedValue(2),
  loadPricing: vi.fn().mockResolvedValue({
    basePrice: money(1000n),
    available: true,
    variants: [],
    groups: [],
    modifiers: [],
  }),
  mutate: vi.fn((input: Parameters<CartCommandPort['mutate']>[0]) =>
    Promise.resolve(input),
  ),
});
describe('Cart application', () => {
  it('recalculates an add/update command from authoritative catalog data', async () =>
    expect(
      await configureCartItem(port(), {
        productId: 'p',
        modifierOptionIds: [],
        quantity: 2,
        expectedRevision: 2,
        idempotencyKey: 'key-12345',
      }),
    ).toMatchObject({
      unitPrice: money(1000n),
      total: money(2000n),
      nextRevision: 3,
    }));
  it('rejects revision conflict before persistence', async () =>
    await expect(
      configureCartItem(port(), {
        productId: 'p',
        modifierOptionIds: [],
        quantity: 1,
        expectedRevision: 1,
        idempotencyKey: 'key-12345',
      }),
    ).rejects.toThrow('CART_REVISION_CONFLICT'));
  it('rejects unavailable catalog products', async () => {
    const p = port();
    p.loadPricing = vi.fn().mockResolvedValue({
      basePrice: money(100n),
      available: false,
      variants: [],
      groups: [],
      modifiers: [],
    });
    await expect(
      configureCartItem(p, {
        productId: 'p',
        modifierOptionIds: [],
        quantity: 1,
        expectedRevision: 2,
        idempotencyKey: 'key-12345',
      }),
    ).rejects.toThrow('PRODUCT_NOT_AVAILABLE');
  });
});
