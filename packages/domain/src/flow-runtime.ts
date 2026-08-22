import type {
  FlowDefinition,
  FlowEngine,
  FlowEngineResult,
  FlowExecutionContext,
  FlowNodeId,
  FlowRuntimeEdge,
  FlowRuntimeNode,
} from './flows.js';

export const flowRuntimeErrorCodes = [
  'FLOW_NOT_PUBLISHED',
  'FLOW_VERSION_NOT_FOUND',
  'SESSION_NOT_ACTIVE',
  'NODE_NOT_FOUND',
  'INVALID_CHOICE',
  'NO_VALID_TRANSITION',
  'INVALID_RUNTIME_STATE',
  'CATALOG_REFERENCE_NOT_FOUND',
  'AUTOMATIC_TRANSITION_LIMIT',
  'REVISION_CONFLICT',
] as const;
export type FlowRuntimeErrorCode = (typeof flowRuntimeErrorCodes)[number];
export class FlowRuntimeError extends Error {
  constructor(readonly code: FlowRuntimeErrorCode) {
    super(code);
  }
}
export type FlowSessionStatus =
  'ACTIVE' | 'COMPLETED' | 'ABANDONED' | 'EXPIRED';
export type FlowSession = Readonly<{
  id: string;
  publicToken: string;
  flowId: string;
  flowVersionId: string;
  locationId: string;
  status: FlowSessionStatus;
  currentNodeId: string;
  revision: number;
  selectedChoiceKeys: readonly string[];
}>;
export const assertSessionActive = (status: FlowSessionStatus): void => {
  if (status !== 'ACTIVE') throw new FlowRuntimeError('SESSION_NOT_ACTIVE');
};
export const canTransitionSession = (
  from: FlowSessionStatus,
  to: FlowSessionStatus,
): boolean =>
  from === 'ACTIVE' &&
  (to === 'COMPLETED' || to === 'ABANDONED' || to === 'EXPIRED');

export type FlowCatalogCategory = Readonly<{ id: string; name: string }>;
export type FlowCatalogProduct = Readonly<{
  id: string;
  name: string;
  price: string;
  categoryId: string;
  available: boolean;
}>;
export type FlowCatalogReadModel = Readonly<{
  categories: readonly FlowCatalogCategory[];
  products: readonly FlowCatalogProduct[];
}>;
export type FlowRuntimeInput =
  | Readonly<{ type: 'CONTINUE' }>
  | Readonly<{ type: 'SELECT_CHOICE'; choiceKey: string }>;
export type FlowRenderPayload =
  | Readonly<{ type: 'TEXT'; title: string; body?: string }>
  | Readonly<{
      type: 'CHOICE';
      title: string;
      options: readonly Readonly<{ key: string; label: string }>[];
    }>
  | Readonly<{ type: 'CATEGORY'; categories: readonly FlowCatalogCategory[] }>
  | Readonly<{
      type: 'PRODUCT_LIST' | 'UPSELL';
      products: readonly FlowCatalogProduct[];
    }>
  | Readonly<{ type: 'PRODUCT'; product: FlowCatalogProduct }>
  | Readonly<{ type: 'BOUNDARY'; boundary: 'CART' | 'DELIVERY' | 'CHECKOUT' }>
  | Readonly<{ type: 'END'; title?: string }>;
export type RuntimeEngineResult = FlowEngineResult &
  Readonly<{
    render: FlowRenderPayload;
    completed: boolean;
    selectedChoiceKey?: string;
  }>;

const byOrder = (a: FlowRuntimeEdge, b: FlowRuntimeEdge) =>
  a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
const nodeById = (definition: FlowDefinition, id: FlowNodeId) => {
  const node = definition.nodes.find((candidate) => candidate.id === id);
  if (!node) throw new FlowRuntimeError('NODE_NOT_FOUND');
  return node;
};
const outgoing = (definition: FlowDefinition, id: FlowNodeId) =>
  definition.edges.filter((edge) => edge.sourceNodeId === id).sort(byOrder);
const alwaysTransition = (definition: FlowDefinition, id: FlowNodeId) => {
  const candidates = outgoing(definition, id).filter(
    (edge) => edge.condition.type === 'ALWAYS',
  );
  if (candidates.length !== 1)
    throw new FlowRuntimeError('NO_VALID_TRANSITION');
  return candidates[0]!;
};
const requireCatalog = (context: FlowExecutionContext) => {
  if (!context.catalog)
    throw new FlowRuntimeError('CATALOG_REFERENCE_NOT_FOUND');
  return context.catalog;
};
const productsByIds = (
  context: FlowExecutionContext,
  ids: readonly string[],
) => {
  const catalog = requireCatalog(context);
  const products = ids.map((id) => catalog.products.find((p) => p.id === id));
  if (products.some((product) => !product))
    throw new FlowRuntimeError('CATALOG_REFERENCE_NOT_FOUND');
  return products as FlowCatalogProduct[];
};

export class DeterministicFlowEngine implements FlowEngine {
  constructor(private readonly maxAutomaticTransitions = 8) {}

  resolve(
    args: Readonly<{
      definition: FlowDefinition;
      currentNodeId: FlowNodeId;
      input?: unknown;
      context: FlowExecutionContext;
    }>,
  ): RuntimeEngineResult {
    let node = nodeById(args.definition, args.currentNodeId);
    let automatic = 0;
    while (node.type === 'START') {
      if (++automatic > this.maxAutomaticTransitions)
        throw new FlowRuntimeError('AUTOMATIC_TRANSITION_LIMIT');
      node = nodeById(
        args.definition,
        alwaysTransition(args.definition, node.id).targetNodeId,
      );
    }
    if (node.type === 'END') {
      const title = node.config.type === 'END' ? node.config.title : undefined;
      return this.result(
        args.definition,
        node,
        { type: 'END', ...(title ? { title } : {}) },
        true,
      );
    }

    const input = args.input as FlowRuntimeInput | undefined;
    if (node.type === 'CHOICE') {
      const config = node.config.type === 'CHOICE' ? node.config : undefined;
      if (!config) throw new FlowRuntimeError('INVALID_RUNTIME_STATE');
      if (!input)
        return this.result(args.definition, node, {
          type: 'CHOICE',
          title: config.title,
          options: config.options,
        });
      if (
        input.type !== 'SELECT_CHOICE' ||
        !config.options.some((option) => option.key === input.choiceKey)
      )
        throw new FlowRuntimeError('INVALID_CHOICE');
      const matches = outgoing(args.definition, node.id).filter(
        (edge) =>
          edge.condition.type === 'CHOICE_EQUALS' &&
          edge.condition.choiceKey === input.choiceKey,
      );
      if (matches.length !== 1)
        throw new FlowRuntimeError('NO_VALID_TRANSITION');
      const resolved = this.resolve({
        ...args,
        currentNodeId: matches[0]!.targetNodeId,
        input: undefined,
      });
      return { ...resolved, selectedChoiceKey: input.choiceKey };
    }

    if (input) {
      if (input.type !== 'CONTINUE')
        throw new FlowRuntimeError('INVALID_RUNTIME_STATE');
      return this.resolve({
        ...args,
        currentNodeId: alwaysTransition(args.definition, node.id).targetNodeId,
        input: undefined,
      });
    }
    return this.result(args.definition, node, this.render(node, args.context));
  }

  private result(
    definition: FlowDefinition,
    node: FlowRuntimeNode,
    render: FlowRenderPayload,
    completed = false,
  ): RuntimeEngineResult {
    return {
      node,
      render,
      completed,
      availableActions: completed
        ? []
        : node.type === 'CHOICE'
          ? ['select-choice']
          : ['continue'],
      nextTransitions: outgoing(definition, node.id),
    };
  }

  private render(
    node: FlowRuntimeNode,
    context: FlowExecutionContext,
  ): FlowRenderPayload {
    const config = node.config;
    switch (node.type) {
      case 'TEXT':
        if (config.type !== 'TEXT') break;
        return {
          type: 'TEXT',
          title: config.title,
          ...(config.body ? { body: config.body } : {}),
        };
      case 'CATEGORY':
        if (config.type !== 'CATEGORY') break;
        {
          const catalog = requireCatalog(context);
          const categories = config.categoryIds.map((id) =>
            catalog.categories.find((c) => c.id === id),
          );
          if (categories.some((c) => !c))
            throw new FlowRuntimeError('CATALOG_REFERENCE_NOT_FOUND');
          return {
            type: 'CATEGORY',
            categories: categories as FlowCatalogCategory[],
          };
        }
      case 'PRODUCT_LIST':
        if (config.type !== 'PRODUCT_LIST') break;
        {
          const catalog = requireCatalog(context);
          const products = config.productIds
            ? productsByIds(context, config.productIds)
            : catalog.products.filter(
                (p) => p.categoryId === config.categoryId,
              );
          return { type: 'PRODUCT_LIST', products };
        }
      case 'PRODUCT':
        if (config.type !== 'PRODUCT') break;
        return {
          type: 'PRODUCT',
          product: productsByIds(context, [config.productId])[0]!,
        };
      case 'UPSELL':
        if (config.type !== 'UPSELL') break;
        return {
          type: 'UPSELL',
          products: productsByIds(context, config.productIds),
        };
      case 'CART':
      case 'DELIVERY':
      case 'CHECKOUT':
        return { type: 'BOUNDARY', boundary: node.type };
    }
    throw new FlowRuntimeError('INVALID_RUNTIME_STATE');
  }
}
