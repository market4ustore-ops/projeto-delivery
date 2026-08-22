import { describe, expect, it, vi } from 'vitest';
import {
  createCatalogCategory,
  createCatalogProduct,
  listCatalog,
  ForbiddenError,
  type ActorContext,
  type CatalogRepository,
} from './index.js';
import type { LocationId, OrganizationId, UserId } from '@delivery/domain';
const a = '20000000-0000-0000-0000-000000000001' as LocationId,
  b = '20000000-0000-0000-0000-000000000002' as LocationId;
const owner: ActorContext = {
  userId: '00000000-0000-0000-0000-000000000001' as UserId,
  organizationId: '10000000-0000-0000-0000-000000000001' as OrganizationId,
  locationId: a,
  role: 'OWNER',
};
const createCategoryFake = vi.fn();
const createProductFake = vi.fn();
const listFake = vi.fn();
const repo: CatalogRepository = {
  createCategory: createCategoryFake,
  createProduct: createProductFake,
  list: listFake,
};
describe('catalog application', () => {
  it('uses trusted actor location for category', async () => {
    await createCatalogCategory(repo, owner, {
      name: 'Burgers',
      slug: 'burgers',
    });
    expect(createCategoryFake).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: a }),
    );
  });
  it('requires catalog.write', () =>
    expect(() =>
      createCatalogCategory(
        repo,
        { ...owner, role: 'KITCHEN' },
        { name: 'Burgers', slug: 'burgers' },
      ),
    ).toThrow(ForbiddenError));
  it('requires catalog.read and location context', async () => {
    await listCatalog(repo, owner);
    expect(listFake).toHaveBeenCalledWith(a);
    const actorWithoutLocation: ActorContext = {
      userId: owner.userId,
      organizationId: '10000000-0000-0000-0000-000000000001' as OrganizationId,
      role: 'OWNER',
    };
    expect(() => listCatalog(repo, actorWithoutLocation)).toThrow(
      ForbiddenError,
    );
  });
  it('blocks cross-location category in product', () =>
    expect(() =>
      createCatalogProduct(repo, owner, {
        categoryId: 'x',
        categoryLocationId: b,
        name: 'Burger',
        slug: 'burger',
        basePriceMinor: 100n,
      }),
    ).toThrow('same location'));
});
