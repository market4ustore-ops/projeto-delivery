import { describe, expect, it } from 'vitest';
import {
  assertSingleActiveDefault,
  createCategory,
  createModifierGroup,
  createModifierOption,
  createProduct,
  createProductVariant,
} from './catalog.js';
import { moneyFromDecimal, moneyToDecimal } from './money.js';
import type { LocationId } from './organizations.js';

const a = '20000000-0000-0000-0000-000000000001' as LocationId;
const b = '20000000-0000-0000-0000-000000000002' as LocationId;
describe('catalog domain', () => {
  it('converts BRL without floating point', () =>
    expect(moneyToDecimal(moneyFromDecimal('29.90'))).toBe('29.90'));
  it('rejects invalid category slug', () =>
    expect(() =>
      createCategory({ locationId: a, name: 'Burgers', slug: 'Inválido!' }),
    ).toThrow());
  it('rejects cross-location product/category', () =>
    expect(() =>
      createProduct({
        locationId: a,
        categoryLocationId: b,
        name: 'Burger',
        slug: 'burger',
        basePriceMinor: 1000n,
      }),
    ).toThrow());
  it('rejects negative product and variant prices', () => {
    expect(() =>
      createProduct({
        locationId: a,
        categoryLocationId: a,
        name: 'Burger',
        slug: 'burger',
        basePriceMinor: -1n,
      }),
    ).toThrow();
    expect(() =>
      createProductVariant({ name: 'Duplo', priceMinor: -1n }),
    ).toThrow();
  });
  it('allows only one active default variant', () =>
    expect(() =>
      assertSingleActiveDefault([
        { isDefault: true, isActive: true },
        { isDefault: true, isActive: true },
      ]),
    ).toThrow());
  it('validates modifier selection limits and required semantics', () => {
    expect(() =>
      createModifierGroup({
        name: 'Extras',
        minSelections: 2,
        maxSelections: 1,
        isRequired: true,
      }),
    ).toThrow();
    expect(() =>
      createModifierGroup({
        name: 'Extras',
        minSelections: 0,
        maxSelections: 1,
        isRequired: true,
      }),
    ).toThrow();
  });
  it('rejects max above known option count', () =>
    expect(() =>
      createModifierGroup({
        name: 'Extras',
        minSelections: 0,
        maxSelections: 3,
        isRequired: false,
        optionCount: 2,
      }),
    ).toThrow());
  it('supports negative modifier price delta explicitly', () =>
    expect(
      createModifierOption({ name: 'Sem queijo', priceDeltaMinor: -100n })
        .priceDelta.minorUnits,
    ).toBe(-100n));
});
