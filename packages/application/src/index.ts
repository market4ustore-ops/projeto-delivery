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
  validateFlowDefinition,
  assertDraftEditable,
  type FlowDefinition,
  type FlowVersionStatus,
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

export interface FlowRepository {
  create(input: {
    locationId: LocationId;
    name: string;
    slug: string;
    actorId: UserId;
  }): Promise<unknown>;
  ensureDraft(input: {
    flowId: string;
    locationId: LocationId;
    actorId: UserId;
  }): Promise<unknown>;
  mutateGraph(input: {
    operation:
      | 'ADD_NODE'
      | 'UPDATE_NODE'
      | 'REMOVE_NODE'
      | 'ADD_EDGE'
      | 'UPDATE_EDGE'
      | 'REMOVE_EDGE';
    locationId: LocationId;
    versionStatus: FlowVersionStatus;
    payload: unknown;
    actorId: UserId;
  }): Promise<unknown>;
  publish(input: {
    definition: FlowDefinition;
    actorId: UserId;
  }): Promise<unknown>;
  get(input: { flowId: string; locationId: LocationId }): Promise<unknown>;
  getVersion(input: {
    versionId: string;
    locationId: LocationId;
  }): Promise<FlowDefinition>;
  list(locationId: LocationId): Promise<unknown>;
}
const requireFlowLocation = (
  actor: ActorContext,
  permission: 'flow.read' | 'flow.write' | 'flow.publish',
): LocationId => {
  authorize(actor, permission);
  if (!actor.locationId)
    throw new ForbiddenError('Location context is required');
  return actor.locationId;
};
export const createFlow = (
  repo: FlowRepository,
  actor: ActorContext,
  input: { name: string; slug: string },
) =>
  repo.create({
    locationId: requireFlowLocation(actor, 'flow.write'),
    name: normalizeName(input.name),
    slug: input.slug,
    actorId: actor.userId,
  });
export const ensureDraftVersion = (
  repo: FlowRepository,
  actor: ActorContext,
  flowId: string,
) =>
  repo.ensureDraft({
    flowId,
    locationId: requireFlowLocation(actor, 'flow.write'),
    actorId: actor.userId,
  });
export const mutateFlowGraph = (
  repo: FlowRepository,
  actor: ActorContext,
  input: {
    operation:
      | 'ADD_NODE'
      | 'UPDATE_NODE'
      | 'REMOVE_NODE'
      | 'ADD_EDGE'
      | 'UPDATE_EDGE'
      | 'REMOVE_EDGE';
    versionStatus: FlowVersionStatus;
    payload: unknown;
  },
) => {
  assertDraftEditable(input.versionStatus);
  return repo.mutateGraph({
    ...input,
    locationId: requireFlowLocation(actor, 'flow.write'),
    actorId: actor.userId,
  });
};
export const publishFlowVersion = (
  repo: FlowRepository,
  actor: ActorContext,
  definition: FlowDefinition,
) => {
  const locationId = requireFlowLocation(actor, 'flow.publish');
  if (definition.locationId !== locationId)
    throw new ForbiddenError('Flow belongs to another location');
  const validation = validateFlowDefinition(definition);
  if (!validation.valid)
    throw new Error(
      `Invalid flow: ${validation.errors.map((e) => e.code).join(',')}`,
    );
  return repo.publish({ definition, actorId: actor.userId });
};
export const listFlows = (repo: FlowRepository, actor: ActorContext) =>
  repo.list(requireFlowLocation(actor, 'flow.read'));
export const getFlow = (
  repo: FlowRepository,
  actor: ActorContext,
  flowId: string,
) => repo.get({ flowId, locationId: requireFlowLocation(actor, 'flow.read') });
export const getFlowVersion = (
  repo: FlowRepository,
  actor: ActorContext,
  versionId: string,
) =>
  repo.getVersion({
    versionId,
    locationId: requireFlowLocation(actor, 'flow.read'),
  });

export * from './flow-runtime.js';
export * from './cart.js';
export * from './checkout.js';
