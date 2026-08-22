import { describe, expect, it } from 'vitest';
import { money, moneyDelta } from './money';
import {
  CartError,
  assertCartMutable,
  cartSubtotal,
  nextCartRevision,
  priceProductConfiguration,
} from './cart';
const catalog = {
  variants: [
    {
      id: 'v',
      productId: 'p',
      price: money(1200n),
      active: true,
      isDefault: true,
    },
  ],
  groups: [{ id: 'g', productId: 'p', minSelections: 1, maxSelections: 2 }],
  modifiers: [
    {
      id: 'm+',
      groupId: 'g',
      productId: 'p',
      priceDelta: moneyDelta(250n),
      available: true,
    },
    {
      id: 'm-',
      groupId: 'g',
      productId: 'p',
      priceDelta: moneyDelta(-100n),
      available: true,
    },
  ],
};
describe('Cart', () => {
  it('prices variant, positive/negative modifiers and quantity exactly', () =>
    expect(
      priceProductConfiguration(
        {
          productId: 'p',
          basePrice: money(1000n),
          available: true,
          modifierOptionIds: ['m+', 'm-'],
          quantity: 2,
        },
        catalog,
      ),
    ).toEqual({ unitPrice: money(1350n), total: money(2700n) }));
  it('uses the default variant and rejects missing required selections', () =>
    expect(() =>
      priceProductConfiguration(
        {
          productId: 'p',
          basePrice: money(1000n),
          available: true,
          modifierOptionIds: [],
          quantity: 1,
        },
        catalog,
      ),
    ).toThrowError(new CartError('MODIFIER_MIN_NOT_MET')));
  it('rejects invalid quantity and negative totals', () => {
    expect(() =>
      priceProductConfiguration(
        {
          productId: 'p',
          basePrice: money(1n),
          available: true,
          modifierOptionIds: ['m-'],
          quantity: 100,
        },
        { ...catalog, variants: [] },
      ),
    ).toThrowError(new CartError('INVALID_QUANTITY'));
    expect(() =>
      priceProductConfiguration(
        {
          productId: 'p',
          basePrice: money(1n),
          available: true,
          modifierOptionIds: ['m-'],
          quantity: 1,
        },
        { ...catalog, variants: [] },
      ),
    ).toThrowError(new CartError('NEGATIVE_ITEM_TOTAL'));
  });
  it('calculates subtotal and optimistic revision', () => {
    expect(
      cartSubtotal([{ total: money(100n) }, { total: money(250n) }]),
    ).toEqual(money(350n));
    expect(nextCartRevision(5, 5)).toBe(6);
    expect(() => nextCartRevision(5, 4)).toThrowError(
      new CartError('CART_REVISION_CONFLICT'),
    );
  });
  it('allows only active lifecycle mutations', () => {
    expect(() => assertCartMutable('ACTIVE')).not.toThrow();
    expect(() => assertCartMutable('EXPIRED')).toThrowError(
      new CartError('CART_EXPIRED'),
    );
    expect(() => assertCartMutable('CONVERTED')).toThrowError(
      new CartError('CART_NOT_ACTIVE'),
    );
  });
});
