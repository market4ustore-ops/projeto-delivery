import {
  hasPermission,
  normalizeName,
  type Location,
  type LocationId,
  type Organization,
  type OrganizationId,
  type Permission,
  type Role,
  type UserId,
  createCategory as buildCategory,
  createProduct as buildProduct,
} from '@delivery/domain';

export type ActorContext = Readonly<{
  userId: UserId;
  organizationId?: OrganizationId;
  locationId?: LocationId;
  role?: Role;
}>;
export interface OrganizationRepository {
  createWithOwner(input: {
    name: string;
    ownerId: UserId;
  }): Promise<Organization>;
  findAccessibleById(
    id: OrganizationId,
    actorId: UserId,
  ): Promise<Organization | null>;
  listForUser(userId: UserId): Promise<readonly Organization[]>;
}
export interface LocationRepository {
  create(input: {
    organizationId: OrganizationId;
    name: string;
    actorId: UserId;
  }): Promise<Location>;
  listForUser(input: {
    organizationId: OrganizationId;
    userId: UserId;
  }): Promise<readonly Location[]>;
}

export class ForbiddenError extends Error {}
export const authorize = (
  actor: ActorContext,
  permission: Permission,
): void => {
  if (!actor.role || !hasPermission(actor.role, permission))
    throw new ForbiddenError(`Missing permission: ${permission}`);
};

export const createOrganization = async (
  repo: OrganizationRepository,
  actor: ActorContext,
  rawName: string,
): Promise<Organization> =>
  repo.createWithOwner({ name: normalizeName(rawName), ownerId: actor.userId });

export const createLocation = async (
  repo: LocationRepository,
  actor: ActorContext,
  rawName: string,
): Promise<Location> => {
  authorize(actor, 'location.update');
  if (!actor.organizationId)
    throw new ForbiddenError('Organization context is required');
  return repo.create({
    organizationId: actor.organizationId,
    name: normalizeName(rawName),
    actorId: actor.userId,
  });
};

export const listLocations = async (
  repo: LocationRepository,
  actor: ActorContext,
): Promise<readonly Location[]> => {
  authorize(actor, 'location.read');
  if (!actor.organizationId)
    throw new ForbiddenError('Organization context is required');
  return repo.listForUser({
    organizationId: actor.organizationId,
    userId: actor.userId,
  });
};

export interface CatalogRepository {
  createCategory(input: ReturnType<typeof buildCategory>): Promise<unknown>;
  createProduct(
    input: ReturnType<typeof buildProduct> & { categoryId: string },
  ): Promise<unknown>;
  list(locationId: LocationId): Promise<unknown>;
}

const requireCatalogLocation = (
  actor: ActorContext,
  permission: 'catalog.read' | 'catalog.write',
): LocationId => {
  authorize(actor, permission);
  if (!actor.locationId)
    throw new ForbiddenError('Location context is required');
  return actor.locationId;
};

export const createCatalogCategory = (
  repo: CatalogRepository,
  actor: ActorContext,
  input: { name: string; slug: string },
) =>
  repo.createCategory(
    buildCategory({
      locationId: requireCatalogLocation(actor, 'catalog.write'),
      ...input,
    }),
  );

export const createCatalogProduct = (
  repo: CatalogRepository,
  actor: ActorContext,
  input: {
    categoryId: string;
    categoryLocationId: LocationId;
    name: string;
    slug: string;
    basePriceMinor: bigint;
  },
) => {
  const locationId = requireCatalogLocation(actor, 'catalog.write');
  return repo.createProduct({
    ...buildProduct({
      locationId,
      categoryLocationId: input.categoryLocationId,
      name: input.name,
      slug: input.slug,
      basePriceMinor: input.basePriceMinor,
    }),
    categoryId: input.categoryId,
  });
};

export const listCatalog = (repo: CatalogRepository, actor: ActorContext) =>
  repo.list(requireCatalogLocation(actor, 'catalog.read'));
