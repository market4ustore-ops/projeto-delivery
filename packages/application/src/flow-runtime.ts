import {
  DeterministicFlowEngine,
  FlowRuntimeError,
  assertSessionActive,
  type FlowCatalogCategory,
  type FlowCatalogProduct,
  type FlowDefinition,
  type FlowId,
  type FlowNodeId,
  type FlowSession,
  type FlowRuntimeInput,
  type LocationId,
  type RuntimeEngineResult,
} from '@delivery/domain';

export type PublishedFlow = Readonly<{
  id: FlowId;
  locationId: LocationId;
  publishedVersionId: string | null;
}>;
export interface FlowRuntimeReader {
  findPublishedBySlug(input: {
    locationId: LocationId;
    slug: string;
  }): Promise<PublishedFlow | null>;
  getDefinition(versionId: string): Promise<FlowDefinition | null>;
}
export interface FlowCatalogReader {
  getCategories(input: {
    locationId: LocationId;
    ids: readonly string[];
  }): Promise<readonly FlowCatalogCategory[]>;
  getProducts(input: {
    locationId: LocationId;
    ids?: readonly string[];
    categoryId?: string;
  }): Promise<readonly FlowCatalogProduct[]>;
}
export type PersistedSessionResult = Readonly<{
  session: FlowSession;
  engine: RuntimeEngineResult;
}>;
export interface FlowSessionRepository {
  create(input: {
    flowId: string;
    flowVersionId: string;
    locationId: LocationId;
    currentNodeId: string;
    completed: boolean;
    selectedChoiceKeys: readonly string[];
    engine: RuntimeEngineResult;
  }): Promise<PersistedSessionResult>;
  getByPublicToken(input: {
    publicToken: string;
    locationId: LocationId;
  }): Promise<PersistedSessionResult | null>;
  getIdempotentResult(input: {
    publicToken: string;
    locationId: LocationId;
    idempotencyKey: string;
  }): Promise<PersistedSessionResult | null>;
  advanceAtomically(input: {
    publicToken: string;
    locationId: LocationId;
    expectedRevision: number;
    idempotencyKey: string;
    currentNodeId: string;
    completed: boolean;
    selectedChoiceKeys: readonly string[];
    engine: RuntimeEngineResult;
  }): Promise<PersistedSessionResult>;
  abandonAtomically(input: {
    publicToken: string;
    locationId: LocationId;
    expectedRevision: number;
    idempotencyKey: string;
  }): Promise<PersistedSessionResult>;
}

const catalogIds = (definition: FlowDefinition) => {
  const categoryIds = new Set<string>(),
    productIds = new Set<string>();
  for (const node of definition.nodes) {
    const config = node.config;
    if (config.type === 'CATEGORY')
      config.categoryIds.forEach((id) => categoryIds.add(id));
    if (config.type === 'PRODUCT_LIST') {
      if (config.categoryId) categoryIds.add(config.categoryId);
      config.productIds?.forEach((id) => productIds.add(id));
    }
    if (config.type === 'PRODUCT') productIds.add(config.productId);
    if (config.type === 'UPSELL')
      config.productIds.forEach((id) => productIds.add(id));
  }
  return { categoryIds: [...categoryIds], productIds: [...productIds] };
};
const loadCatalog = async (
  reader: FlowCatalogReader,
  definition: FlowDefinition,
) => {
  const ids = catalogIds(definition);
  const [categories, directProducts, categoryProducts] = await Promise.all([
    reader.getCategories({
      locationId: definition.locationId,
      ids: ids.categoryIds,
    }),
    reader.getProducts({
      locationId: definition.locationId,
      ids: ids.productIds,
    }),
    Promise.all(
      ids.categoryIds.map((categoryId) =>
        reader.getProducts({ locationId: definition.locationId, categoryId }),
      ),
    ),
  ]);
  const products = new Map(
    [...directProducts, ...categoryProducts.flat()].map((product) => [
      product.id,
      product,
    ]),
  );
  return { categories, products: [...products.values()] };
};
const requireDefinition = async (
  reader: FlowRuntimeReader,
  versionId: string,
) => {
  const definition = await reader.getDefinition(versionId);
  if (!definition) throw new FlowRuntimeError('FLOW_VERSION_NOT_FOUND');
  return definition;
};
const engine = new DeterministicFlowEngine();

export const startFlowSession = async (
  deps: {
    flows: FlowRuntimeReader;
    catalog: FlowCatalogReader;
    sessions: FlowSessionRepository;
  },
  input: { locationId: LocationId; flowSlug: string },
): Promise<PersistedSessionResult> => {
  const flow = await deps.flows.findPublishedBySlug({
    locationId: input.locationId,
    slug: input.flowSlug,
  });
  if (!flow?.publishedVersionId)
    throw new FlowRuntimeError('FLOW_NOT_PUBLISHED');
  const definition = await requireDefinition(
    deps.flows,
    flow.publishedVersionId,
  );
  if (
    definition.locationId !== input.locationId ||
    definition.flowId !== flow.id
  )
    throw new FlowRuntimeError('INVALID_RUNTIME_STATE');
  const catalog = await loadCatalog(deps.catalog, definition),
    start = definition.nodes.find((node) => node.type === 'START');
  if (!start) throw new FlowRuntimeError('NODE_NOT_FOUND');
  const result = engine.resolve({
    definition,
    currentNodeId: start.id,
    context: {
      locationId: input.locationId,
      flowId: flow.id,
      flowVersionId: definition.versionId,
      catalog,
    },
  });
  return deps.sessions.create({
    flowId: flow.id,
    flowVersionId: definition.versionId,
    locationId: input.locationId,
    currentNodeId: result.node.id,
    completed: result.completed,
    selectedChoiceKeys: [],
    engine: result,
  });
};
export const getFlowSession = (
  sessions: FlowSessionRepository,
  input: { locationId: LocationId; publicToken: string },
) => sessions.getByPublicToken(input);
export const advanceFlowSession = async (
  deps: {
    flows: FlowRuntimeReader;
    catalog: FlowCatalogReader;
    sessions: FlowSessionRepository;
  },
  input: {
    locationId: LocationId;
    publicToken: string;
    expectedRevision: number;
    idempotencyKey: string;
    action: FlowRuntimeInput;
  },
): Promise<PersistedSessionResult> => {
  const cached = await deps.sessions.getIdempotentResult(input);
  if (cached) return cached;
  const current = await deps.sessions.getByPublicToken(input);
  if (!current) throw new FlowRuntimeError('INVALID_RUNTIME_STATE');
  assertSessionActive(current.session.status);
  if (current.session.revision !== input.expectedRevision)
    throw new FlowRuntimeError('REVISION_CONFLICT');
  const definition = await requireDefinition(
      deps.flows,
      current.session.flowVersionId,
    ),
    catalog = await loadCatalog(deps.catalog, definition);
  const result = engine.resolve({
    definition,
    currentNodeId: current.session.currentNodeId as FlowNodeId,
    input: input.action,
    context: {
      locationId: input.locationId,
      flowId: definition.flowId,
      flowVersionId: definition.versionId,
      sessionId: current.session.id,
      selectedChoiceKeys: current.session.selectedChoiceKeys,
      catalog,
    },
  });
  const selected = result.selectedChoiceKey
    ? [...current.session.selectedChoiceKeys, result.selectedChoiceKey]
    : current.session.selectedChoiceKeys;
  return deps.sessions.advanceAtomically({
    ...input,
    currentNodeId: result.node.id,
    completed: result.completed,
    selectedChoiceKeys: selected,
    engine: result,
  });
};
export const abandonFlowSession = (
  sessions: FlowSessionRepository,
  input: {
    locationId: LocationId;
    publicToken: string;
    expectedRevision: number;
    idempotencyKey: string;
  },
) => sessions.abandonAtomically(input);
