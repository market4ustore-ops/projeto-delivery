import { money, type Money } from './money.js';

export const cartStatuses = [
  'ACTIVE',
  'CONVERTED',
  'ABANDONED',
  'EXPIRED',
] as const;
export type CartStatus = (typeof cartStatuses)[number];
export const cartErrorCodes = [
  'CART_NOT_FOUND',
  'CART_NOT_ACTIVE',
  'CART_EXPIRED',
  'CART_REVISION_CONFLICT',
  'PRODUCT_NOT_AVAILABLE',
  'INVALID_VARIANT',
  'INVALID_MODIFIER_GROUP',
  'INVALID_MODIFIER_OPTION',
  'MODIFIER_MIN_NOT_MET',
  'MODIFIER_MAX_EXCEEDED',
  'INVALID_QUANTITY',
  'CROSS_LOCATION_REFERENCE',
  'NEGATIVE_ITEM_TOTAL',
] as const;
export type CartErrorCode = (typeof cartErrorCodes)[number];
export class CartError extends Error {
  constructor(readonly code: CartErrorCode) {
    super(code);
  }
}
export type PricingVariant = Readonly<{
  id: string;
  productId: string;
  price: Money;
  active: boolean;
  isDefault: boolean;
}>;
export type PricingModifier = Readonly<{
  id: string;
  groupId: string;
  productId: string;
  priceDelta: Money;
  available: boolean;
}>;
export type PricingGroup = Readonly<{
  id: string;
  productId: string;
  minSelections: number;
  maxSelections: number;
}>;
export type ProductConfiguration = Readonly<{
  productId: string;
  basePrice: Money;
  available: boolean;
  variantId?: string;
  modifierOptionIds: readonly string[];
  quantity: number;
}>;

export function priceProductConfiguration(
  input: ProductConfiguration,
  catalog: {
    variants: readonly PricingVariant[];
    groups: readonly PricingGroup[];
    modifiers: readonly PricingModifier[];
  },
): { unitPrice: Money; total: Money } {
  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 99
  )
    throw new CartError('INVALID_QUANTITY');
  if (!input.available) throw new CartError('PRODUCT_NOT_AVAILABLE');
  const productVariants = catalog.variants.filter(
    (v) => v.productId === input.productId && v.active,
  );
  let unit = input.basePrice.minorUnits;
  if (productVariants.length) {
    const variant = input.variantId
      ? productVariants.find((v) => v.id === input.variantId)
      : productVariants.find((v) => v.isDefault);
    if (!variant) throw new CartError('INVALID_VARIANT');
    unit = variant.price.minorUnits;
  } else if (input.variantId) throw new CartError('INVALID_VARIANT');
  const selected = input.modifierOptionIds.map((id) => {
    const option = catalog.modifiers.find(
      (o) => o.id === id && o.productId === input.productId && o.available,
    );
    if (!option) throw new CartError('INVALID_MODIFIER_OPTION');
    return option;
  });
  if (new Set(selected.map((o) => o.id)).size !== selected.length)
    throw new CartError('INVALID_MODIFIER_OPTION');
  for (const group of catalog.groups.filter(
    (g) => g.productId === input.productId,
  )) {
    const count = selected.filter((o) => o.groupId === group.id).length;
    if (count < group.minSelections)
      throw new CartError('MODIFIER_MIN_NOT_MET');
    if (count > group.maxSelections)
      throw new CartError('MODIFIER_MAX_EXCEEDED');
  }
  unit += selected.reduce(
    (sum, option) => sum + option.priceDelta.minorUnits,
    0n,
  );
  if (unit < 0n) throw new CartError('NEGATIVE_ITEM_TOTAL');
  return {
    unitPrice: money(unit),
    total: money(unit * BigInt(input.quantity)),
  };
}

export const cartSubtotal = (items: readonly { total: Money }[]) =>
  money(items.reduce((sum, item) => sum + item.total.minorUnits, 0n));
export const assertCartMutable = (status: CartStatus) => {
  if (status === 'EXPIRED') throw new CartError('CART_EXPIRED');
  if (status !== 'ACTIVE') throw new CartError('CART_NOT_ACTIVE');
};
export const nextCartRevision = (current: number, expected: number) => {
  if (current !== expected) throw new CartError('CART_REVISION_CONFLICT');
  return current + 1;
};
