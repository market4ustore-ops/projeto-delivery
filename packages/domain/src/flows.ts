import type { LocationId } from './organizations.js';

export type FlowId = string & { readonly __brand: 'FlowId' };
export type FlowVersionId = string & { readonly __brand: 'FlowVersionId' };
export type FlowNodeId = string & { readonly __brand: 'FlowNodeId' };
export type FlowVersionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export const flowNodeTypes = [
  'START',
  'TEXT',
  'CHOICE',
  'CATEGORY',
  'PRODUCT_LIST',
  'PRODUCT',
  'UPSELL',
  'CART',
  'DELIVERY',
  'CHECKOUT',
  'END',
] as const;
export type FlowNodeType = (typeof flowNodeTypes)[number];
export type FlowCondition =
  | Readonly<{ type: 'ALWAYS' }>
  | Readonly<{ type: 'CHOICE_EQUALS'; choiceKey: string }>;
export type FlowNodeConfig =
  | Readonly<{ type: 'START' | 'CART' | 'DELIVERY' | 'CHECKOUT' }>
  | Readonly<{ type: 'TEXT'; title: string; body?: string }>
  | Readonly<{
      type: 'CHOICE';
      title: string;
      options: readonly Readonly<{ key: string; label: string }>[];
    }>
  | Readonly<{ type: 'CATEGORY'; categoryIds: readonly string[] }>
  | Readonly<{
      type: 'PRODUCT_LIST';
      categoryId?: string;
      productIds?: readonly string[];
    }>
  | Readonly<{ type: 'PRODUCT'; productId: string }>
  | Readonly<{ type: 'UPSELL'; productIds: readonly string[] }>
  | Readonly<{ type: 'END'; title?: string }>;
export type FlowRuntimeNode = Readonly<{
  id: FlowNodeId;
  flowVersionId: FlowVersionId;
  type: FlowNodeType;
  name?: string;
  config: FlowNodeConfig;
}>;
export type FlowRuntimeEdge = Readonly<{
  id: string;
  flowVersionId: FlowVersionId;
  sourceNodeId: FlowNodeId;
  targetNodeId: FlowNodeId;
  condition: FlowCondition;
  sortOrder: number;
}>;
export type FlowDefinition = Readonly<{
  flowId: FlowId;
  versionId: FlowVersionId;
  locationId: LocationId;
  schemaVersion: number;
  nodes: readonly FlowRuntimeNode[];
  edges: readonly FlowRuntimeEdge[];
}>;
export type FlowValidationErrorCode =
  | 'MISSING_START'
  | 'MULTIPLE_START'
  | 'MISSING_END'
  | 'INVALID_EDGE'
  | 'CROSS_VERSION_EDGE'
  | 'START_HAS_INBOUND'
  | 'END_HAS_OUTBOUND'
  | 'MISSING_OUTPUT'
  | 'MISSING_BRANCH_DESTINATION'
  | 'UNREACHABLE_NODE'
  | 'INVALID_NODE_CONFIG'
  | 'INVALID_CATALOG_REFERENCE'
  | 'UNKNOWN_NODE_TYPE'
  | 'CYCLE_DETECTED';
export type FlowValidationIssue = Readonly<{
  code: FlowValidationErrorCode;
  nodeId?: string;
  edgeId?: string;
}>;
export type FlowValidationResult = Readonly<{
  valid: boolean;
  errors: readonly FlowValidationIssue[];
  warnings: readonly FlowValidationIssue[];
}>;
export type CatalogReferenceSet = Readonly<{
  categoryIds: ReadonlySet<string>;
  productIds: ReadonlySet<string>;
}>;

const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
export const isValidFlowNodeConfig = (
  type: FlowNodeType,
  value: FlowNodeConfig,
): boolean => {
  if (!value || value.type !== type) return false;
  switch (type) {
    case 'START':
    case 'CART':
    case 'DELIVERY':
    case 'CHECKOUT':
      return true;
    case 'TEXT':
      return text((value as { title?: unknown }).title);
    case 'CHOICE': {
      const c = value as Extract<FlowNodeConfig, { type: 'CHOICE' }>;
      return (
        text(c.title) &&
        c.options.length > 0 &&
        new Set(c.options.map((x) => x.key)).size === c.options.length &&
        c.options.every((x) => text(x.key) && text(x.label))
      );
    }
    case 'CATEGORY':
      return (
        (value as Extract<FlowNodeConfig, { type: 'CATEGORY' }>).categoryIds
          .length > 0
      );
    case 'PRODUCT_LIST': {
      const c = value as Extract<FlowNodeConfig, { type: 'PRODUCT_LIST' }>;
      return Boolean(c.categoryId) || Boolean(c.productIds?.length);
    }
    case 'PRODUCT':
      return text(
        (value as Extract<FlowNodeConfig, { type: 'PRODUCT' }>).productId,
      );
    case 'UPSELL':
      return (
        (value as Extract<FlowNodeConfig, { type: 'UPSELL' }>).productIds
          .length > 0
      );
    case 'END':
      return (
        !(value as Extract<FlowNodeConfig, { type: 'END' }>).title ||
        text((value as Extract<FlowNodeConfig, { type: 'END' }>).title)
      );
  }
};

export const validateFlowDefinition = (
  definition: FlowDefinition,
  catalog?: CatalogReferenceSet,
): FlowValidationResult => {
  const errors: FlowValidationIssue[] = [];
  const ids = new Set(definition.nodes.map((n) => n.id));
  const starts = definition.nodes.filter((n) => n.type === 'START');
  const ends = definition.nodes.filter((n) => n.type === 'END');
  if (!starts.length) errors.push({ code: 'MISSING_START' });
  if (starts.length > 1) errors.push({ code: 'MULTIPLE_START' });
  if (!ends.length) errors.push({ code: 'MISSING_END' });
  for (const node of definition.nodes) {
    if (!(flowNodeTypes as readonly string[]).includes(node.type))
      errors.push({ code: 'UNKNOWN_NODE_TYPE', nodeId: node.id });
    else if (!isValidFlowNodeConfig(node.type, node.config))
      errors.push({ code: 'INVALID_NODE_CONFIG', nodeId: node.id });
    if (catalog) {
      const c = node.config;
      const categories =
        c.type === 'CATEGORY'
          ? c.categoryIds
          : c.type === 'PRODUCT_LIST' && c.categoryId
            ? [c.categoryId]
            : [];
      const products =
        c.type === 'PRODUCT'
          ? [c.productId]
          : c.type === 'UPSELL'
            ? c.productIds
            : c.type === 'PRODUCT_LIST'
              ? (c.productIds ?? [])
              : [];
      if (
        categories.some((id) => !catalog.categoryIds.has(id)) ||
        products.some((id) => !catalog.productIds.has(id))
      )
        errors.push({ code: 'INVALID_CATALOG_REFERENCE', nodeId: node.id });
    }
  }
  const outgoing = new Map<string, FlowRuntimeEdge[]>(),
    incoming = new Map<string, FlowRuntimeEdge[]>();
  for (const edge of definition.edges) {
    if (edge.flowVersionId !== definition.versionId)
      errors.push({ code: 'CROSS_VERSION_EDGE', edgeId: edge.id });
    if (!ids.has(edge.sourceNodeId) || !ids.has(edge.targetNodeId))
      errors.push({ code: 'INVALID_EDGE', edgeId: edge.id });
    outgoing.set(edge.sourceNodeId, [
      ...(outgoing.get(edge.sourceNodeId) ?? []),
      edge,
    ]);
    incoming.set(edge.targetNodeId, [
      ...(incoming.get(edge.targetNodeId) ?? []),
      edge,
    ]);
  }
  for (const start of starts)
    if (incoming.get(start.id)?.length)
      errors.push({ code: 'START_HAS_INBOUND', nodeId: start.id });
  for (const end of ends)
    if (outgoing.get(end.id)?.length)
      errors.push({ code: 'END_HAS_OUTBOUND', nodeId: end.id });
  for (const node of definition.nodes.filter((n) => n.type !== 'END'))
    if (!outgoing.get(node.id)?.length)
      errors.push({ code: 'MISSING_OUTPUT', nodeId: node.id });
  for (const node of definition.nodes.filter((n) => n.type === 'CHOICE')) {
    const c = node.config as Extract<FlowNodeConfig, { type: 'CHOICE' }>;
    const branches = outgoing.get(node.id) ?? [];
    for (const option of c.options)
      if (
        !branches.some(
          (e) =>
            e.condition.type === 'CHOICE_EQUALS' &&
            e.condition.choiceKey === option.key,
        )
      )
        errors.push({ code: 'MISSING_BRANCH_DESTINATION', nodeId: node.id });
  }
  if (starts.length === 1) {
    const reached = new Set<string>();
    const visiting = new Set<string>();
    let cycle = false;
    const visit = (id: string) => {
      if (visiting.has(id)) {
        cycle = true;
        return;
      }
      if (reached.has(id)) return;
      visiting.add(id);
      reached.add(id);
      for (const e of outgoing.get(id) ?? [])
        if (ids.has(e.targetNodeId)) visit(e.targetNodeId);
      visiting.delete(id);
    };
    visit(starts[0]!.id);
    for (const n of definition.nodes)
      if (!reached.has(n.id))
        errors.push({ code: 'UNREACHABLE_NODE', nodeId: n.id });
    if (cycle) errors.push({ code: 'CYCLE_DETECTED' });
  }
  return { valid: errors.length === 0, errors, warnings: [] };
};

export const assertDraftEditable = (status: FlowVersionStatus): void => {
  if (status !== 'DRAFT')
    throw new Error('Published and archived flow versions are immutable');
};
export type FlowExecutionContext = Readonly<{
  locationId: LocationId;
  attributes?: Readonly<Record<string, unknown>>;
}>;
export type FlowEngineResult = Readonly<{
  node: FlowRuntimeNode;
  availableActions: readonly string[];
  nextTransitions: readonly FlowRuntimeEdge[];
}>;
export interface FlowEngine {
  resolve(
    input: Readonly<{
      definition: FlowDefinition;
      currentNodeId: FlowNodeId;
      input?: unknown;
      context: FlowExecutionContext;
    }>,
  ): FlowEngineResult;
}
