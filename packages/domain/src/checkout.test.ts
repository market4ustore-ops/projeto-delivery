import { describe, expect, it } from 'vitest';
import {
  assertValidatedCartRevision,
  checkoutTotal,
  nextCheckoutRevision,
  validateCheckoutDraft,
  CheckoutError,
} from './checkout';
import { money } from './money';
const address = {
  postalCode: '01001000',
  street: 'Praça da Sé',
  number: '1',
  neighborhood: 'Sé',
  city: 'São Paulo',
  state: 'SP',
};
describe('Checkout', () => {
  it('validates delivery and pickup requirements', () => {
    expect(() =>
      validateCheckoutDraft({
        status: 'IN_PROGRESS',
        customerName: 'Ana',
        customerPhone: '11999999999',
        fulfillmentType: 'DELIVERY',
        address,
        cartRevision: 1,
      }),
    ).not.toThrow();
    expect(() =>
      validateCheckoutDraft({
        status: 'IN_PROGRESS',
        customerName: 'Ana',
        customerPhone: '1',
        fulfillmentType: 'PICKUP',
        cartRevision: 1,
      }),
    ).not.toThrow();
  });
  it('requires customer, fulfillment and delivery address', () => {
    expect(() =>
      validateCheckoutDraft({ status: 'IN_PROGRESS', cartRevision: 1 }),
    ).toThrow('CUSTOMER_INFO_REQUIRED');
    expect(() =>
      validateCheckoutDraft({
        status: 'IN_PROGRESS',
        customerName: 'Ana',
        customerPhone: '1',
        cartRevision: 1,
      }),
    ).toThrow('FULFILLMENT_REQUIRED');
    expect(() =>
      validateCheckoutDraft({
        status: 'IN_PROGRESS',
        customerName: 'Ana',
        customerPhone: '1',
        fulfillmentType: 'DELIVERY',
        cartRevision: 1,
      }),
    ).toThrow('ADDRESS_REQUIRED');
  });
  it('rejects invalid address and expiration', () => {
    expect(() =>
      validateCheckoutDraft({
        status: 'IN_PROGRESS',
        customerName: 'Ana',
        customerPhone: '1',
        fulfillmentType: 'DELIVERY',
        address: { ...address, state: 'X' },
        cartRevision: 1,
      }),
    ).toThrow('INVALID_ADDRESS');
    expect(() =>
      validateCheckoutDraft({ status: 'EXPIRED', cartRevision: 1 }),
    ).toThrow('CHECKOUT_EXPIRED');
  });
  it('protects revisions and invalidates changed carts', () => {
    expect(nextCheckoutRevision(2, 2)).toBe(3);
    expect(() => nextCheckoutRevision(2, 1)).toThrow(
      'CHECKOUT_REVISION_CONFLICT',
    );
    expect(() => assertValidatedCartRevision(7, 4)).toThrow('CART_CHANGED');
  });
  it('calculates totals exactly', () =>
    expect(checkoutTotal(money(2990n), money(500n))).toEqual(money(3490n)));
  it('uses typed errors', () =>
    expect(new CheckoutError('PRICE_CHANGED').code).toBe('PRICE_CHANGED'));
});
