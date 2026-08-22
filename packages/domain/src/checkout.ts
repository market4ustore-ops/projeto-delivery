import { money, type Money } from './money.js';

export const checkoutStatuses = [
  'IN_PROGRESS',
  'READY',
  'EXPIRED',
  'CANCELED',
] as const;
export type CheckoutStatus = (typeof checkoutStatuses)[number];
export type FulfillmentType = 'DELIVERY' | 'PICKUP';
export const checkoutErrorCodes = [
  'CHECKOUT_NOT_FOUND',
  'CHECKOUT_NOT_ACTIVE',
  'CHECKOUT_EXPIRED',
  'CHECKOUT_REVISION_CONFLICT',
  'CART_NOT_ACTIVE',
  'CART_CHANGED',
  'PRICE_CHANGED',
  'PRODUCT_NOT_AVAILABLE',
  'VARIANT_NOT_AVAILABLE',
  'MODIFIER_NOT_AVAILABLE',
  'CUSTOMER_INFO_REQUIRED',
  'FULFILLMENT_REQUIRED',
  'ADDRESS_REQUIRED',
  'DELIVERY_NOT_AVAILABLE',
  'INVALID_ADDRESS',
] as const;
export type CheckoutErrorCode = (typeof checkoutErrorCodes)[number];
export class CheckoutError extends Error {
  constructor(readonly code: CheckoutErrorCode) {
    super(code);
  }
}

export type CheckoutAddress = Readonly<{
  postalCode: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  reference?: string;
}>;
export type CheckoutDraft = Readonly<{
  status: CheckoutStatus;
  customerName?: string;
  customerPhone?: string;
  fulfillmentType?: FulfillmentType;
  address?: CheckoutAddress;
  cartRevision: number;
  cartRevisionValidated?: number;
}>;

export function validateCheckoutDraft(checkout: CheckoutDraft) {
  if (checkout.status === 'EXPIRED')
    throw new CheckoutError('CHECKOUT_EXPIRED');
  if (checkout.status !== 'IN_PROGRESS' && checkout.status !== 'READY')
    throw new CheckoutError('CHECKOUT_NOT_ACTIVE');
  if (!checkout.customerName?.trim() || !checkout.customerPhone?.trim())
    throw new CheckoutError('CUSTOMER_INFO_REQUIRED');
  if (!checkout.fulfillmentType)
    throw new CheckoutError('FULFILLMENT_REQUIRED');
  if (checkout.fulfillmentType === 'DELIVERY')
    validateAddress(checkout.address);
}
export function validateAddress(address?: CheckoutAddress) {
  if (!address) throw new CheckoutError('ADDRESS_REQUIRED');
  if (
    ![
      address.postalCode,
      address.street,
      address.number,
      address.neighborhood,
      address.city,
      address.state,
    ].every((v) => v.trim())
  )
    throw new CheckoutError('INVALID_ADDRESS');
  if (
    !/^\d{8}$/.test(address.postalCode.replace(/\D/g, '')) ||
    !/^[A-Za-z]{2}$/.test(address.state)
  )
    throw new CheckoutError('INVALID_ADDRESS');
}
export function assertValidatedCartRevision(
  cartRevision: number,
  validated?: number,
) {
  if (validated !== cartRevision) throw new CheckoutError('CART_CHANGED');
}
export function nextCheckoutRevision(current: number, expected: number) {
  if (current !== expected)
    throw new CheckoutError('CHECKOUT_REVISION_CONFLICT');
  return current + 1;
}
export function checkoutTotal(subtotal: Money, deliveryFee: Money) {
  return money(subtotal.minorUnits + deliveryFee.minorUnits);
}
export interface DeliveryFeeCalculator {
  calculate(input: {
    locationId: string;
    address: CheckoutAddress;
  }): Promise<Money>;
}
