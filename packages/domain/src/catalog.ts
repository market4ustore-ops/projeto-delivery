import { normalizeName, type LocationId } from './organizations.js';
import { money, moneyDelta, type Money } from './money.js';

export type CategoryId = string & { readonly __brand: 'CategoryId' };
export type ProductId = string & { readonly __brand: 'ProductId' };

export const normalizeSlug = (value: string): string => {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 120)
    throw new Error('Invalid slug');
  return slug;
};

export const createCategory = (input: {
  locationId: LocationId;
  name: string;
  slug: string;
  sortOrder?: number;
  isActive?: boolean;
}) => ({
  locationId: input.locationId,
  name: normalizeName(input.name),
  slug: normalizeSlug(input.slug),
  sortOrder: input.sortOrder ?? 0,
  isActive: input.isActive ?? true,
});

export const createProduct = (input: {
  locationId: LocationId;
  categoryLocationId: LocationId;
  name: string;
  slug: string;
  basePriceMinor: bigint;
}) => {
  if (input.locationId !== input.categoryLocationId)
    throw new Error('Product and category must belong to the same location');
  return {
    locationId: input.locationId,
    name: normalizeName(input.name),
    slug: normalizeSlug(input.slug),
    basePrice: money(input.basePriceMinor),
  };
};

export const createProductVariant = (input: {
  name: string;
  priceMinor: bigint;
  isDefault?: boolean;
  isActive?: boolean;
}) => ({
  name: normalizeName(input.name),
  price: money(input.priceMinor),
  isDefault: input.isDefault ?? false,
  isActive: input.isActive ?? true,
});

export const assertSingleActiveDefault = (
  variants: readonly { isDefault: boolean; isActive: boolean }[],
): void => {
  if (
    variants.filter((variant) => variant.isDefault && variant.isActive).length >
    1
  )
    throw new Error('Only one active default variant is allowed');
};

export const createModifierGroup = (input: {
  name: string;
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  optionCount?: number;
}) => {
  if (
    !Number.isInteger(input.minSelections) ||
    !Number.isInteger(input.maxSelections) ||
    input.minSelections < 0 ||
    input.maxSelections < input.minSelections
  )
    throw new Error('Invalid selection limits');
  if (input.isRequired !== input.minSelections > 0)
    throw new Error('Required must match minimum selections');
  if (
    input.optionCount !== undefined &&
    input.maxSelections > input.optionCount
  )
    throw new Error('Maximum exceeds option count');
  return {
    name: normalizeName(input.name),
    minSelections: input.minSelections,
    maxSelections: input.maxSelections,
    isRequired: input.isRequired,
    ...(input.optionCount === undefined
      ? {}
      : { optionCount: input.optionCount }),
  };
};

export const createModifierOption = (input: {
  name: string;
  priceDeltaMinor: bigint;
}) => ({
  name: normalizeName(input.name),
  priceDelta: moneyDelta(input.priceDeltaMinor),
});
export type CatalogMoney = Money;
