import { describe, expect, it } from 'vitest';
import {
  DeterministicFlowEngine,
  FlowRuntimeError,
  assertSessionActive,
  canTransitionSession,
  type FlowDefinition,
  type FlowId,
  type FlowNodeId,
  type FlowNodeType,
  type FlowVersionId,
} from './index.js';
import type { LocationId } from './organizations.js';
const v = 'v' as FlowVersionId,
  loc = 'loc' as LocationId;
const node = (
  id: string,
  type: FlowNodeType,
  config: FlowDefinition['nodes'][number]['config'],
) => ({ id: id as FlowNodeId, flowVersionId: v, type, config });
const edge = (
  id: string,
  source: string,
  target: string,
  condition: FlowDefinition['edges'][number]['condition'] = { type: 'ALWAYS' },
) => ({
  id,
  flowVersionId: v,
  sourceNodeId: source as FlowNodeId,
  targetNodeId: target as FlowNodeId,
  condition,
  sortOrder: 0,
});
const definition = (
  middle: FlowDefinition['nodes'][number],
  extraNodes: FlowDefinition['nodes'] = [],
  extraEdges: FlowDefinition['edges'] = [],
): FlowDefinition => ({
  flowId: 'f' as FlowId,
  versionId: v,
  locationId: loc,
  schemaVersion: 1,
  nodes: [
    node('start', 'START', { type: 'START' }),
    middle,
    ...extraNodes,
    node('end', 'END', { type: 'END', title: 'Done' }),
  ],
  edges: [
    edge('a', 'start', middle.id),
    ...extraEdges,
    edge('z', middle.id, 'end'),
  ],
});
const catalog = {
  categories: [{ id: 'cat', name: 'Meals' }],
  products: [
    {
      id: 'prod',
      name: 'Burger',
      price: '10.00',
      categoryId: 'cat',
      available: true,
    },
  ],
};
const context = { locationId: loc, catalog };
const engine = new DeterministicFlowEngine();
describe('deterministic flow engine', () => {
  it('automatically resolves START to TEXT', () => {
    const d = definition(
      node('text', 'TEXT', { type: 'TEXT', title: 'Welcome' }),
    );
    const r = engine.resolve({
      definition: d,
      currentNodeId: 'start' as FlowNodeId,
      context,
    });
    expect(r.node.id).toBe('text');
    expect(r.render).toEqual({
      type: 'TEXT',
      title: 'Welcome',
      body: undefined,
    });
  });
  it('continues from TEXT and completes on END', () => {
    const d = definition(
      node('text', 'TEXT', { type: 'TEXT', title: 'Welcome' }),
    );
    expect(
      engine.resolve({
        definition: d,
        currentNodeId: 'text' as FlowNodeId,
        input: { type: 'CONTINUE' },
        context,
      }).completed,
    ).toBe(true);
  });
  it('selects only the declared CHOICE branch', () => {
    const choice = node('choice', 'CHOICE', {
        type: 'CHOICE',
        title: 'Type?',
        options: [
          { key: 'burger', label: 'Burger' },
          { key: 'pizza', label: 'Pizza' },
        ],
      }),
      burger = node('burger', 'TEXT', { type: 'TEXT', title: 'Burger' }),
      pizza = node('pizza', 'TEXT', { type: 'TEXT', title: 'Pizza' });
    const d = definition(
      choice,
      [burger, pizza],
      [
        edge('b', 'choice', 'burger', {
          type: 'CHOICE_EQUALS',
          choiceKey: 'burger',
        }),
        edge('p', 'choice', 'pizza', {
          type: 'CHOICE_EQUALS',
          choiceKey: 'pizza',
        }),
        edge('be', 'burger', 'end'),
        edge('pe', 'pizza', 'end'),
      ],
    ).edges.filter((e) => e.id !== 'z');
    const full = { ...definition(choice, [burger, pizza]), edges: d };
    expect(
      engine.resolve({
        definition: full,
        currentNodeId: choice.id,
        input: { type: 'SELECT_CHOICE', choiceKey: 'burger' },
        context,
      }).node.id,
    ).toBe('burger');
    expect(() =>
      engine.resolve({
        definition: full,
        currentNodeId: choice.id,
        input: { type: 'SELECT_CHOICE', choiceKey: 'invalid' },
        context,
      }),
    ).toThrowError('INVALID_CHOICE');
  });
  it.each([
    [
      'CATEGORY',
      node('n', 'CATEGORY', { type: 'CATEGORY', categoryIds: ['cat'] }),
      'CATEGORY',
    ],
    [
      'PRODUCT_LIST',
      node('n', 'PRODUCT_LIST', { type: 'PRODUCT_LIST', categoryId: 'cat' }),
      'PRODUCT_LIST',
    ],
    [
      'PRODUCT',
      node('n', 'PRODUCT', { type: 'PRODUCT', productId: 'prod' }),
      'PRODUCT',
    ],
    [
      'UPSELL',
      node('n', 'UPSELL', { type: 'UPSELL', productIds: ['prod'] }),
      'UPSELL',
    ],
  ] as const)('resolves %s catalog data', (_label, middle, renderType) =>
    expect(
      engine.resolve({
        definition: definition(middle),
        currentNodeId: 'n' as FlowNodeId,
        context,
      }).render.type,
    ).toBe(renderType),
  );
  it.each(['CART', 'DELIVERY', 'CHECKOUT'] as const)(
    'renders %s as a boundary',
    (type) =>
      expect(
        engine.resolve({
          definition: definition(node('n', type, { type })),
          currentNodeId: 'n' as FlowNodeId,
          context,
        }).render,
      ).toEqual({ type: 'BOUNDARY', boundary: type }),
  );
  it('fails safely for missing node, edge and catalog reference', () => {
    const d = definition(node('text', 'TEXT', { type: 'TEXT', title: 'x' }));
    expect(() =>
      engine.resolve({
        definition: d,
        currentNodeId: 'missing' as FlowNodeId,
        context,
      }),
    ).toThrowError('NODE_NOT_FOUND');
    expect(() =>
      engine.resolve({
        definition: { ...d, edges: [] },
        currentNodeId: 'text' as FlowNodeId,
        input: { type: 'CONTINUE' },
        context,
      }),
    ).toThrowError('NO_VALID_TRANSITION');
    const p = definition(
      node('p', 'PRODUCT', { type: 'PRODUCT', productId: 'missing' }),
    );
    expect(() =>
      engine.resolve({
        definition: p,
        currentNodeId: 'p' as FlowNodeId,
        context,
      }),
    ).toThrowError('CATALOG_REFERENCE_NOT_FOUND');
  });
  it('enforces the automatic transition limit defensively', () => {
    const d = definition(
      node('s2', 'START', { type: 'START' }),
      [],
      [edge('loop', 's2', 's2')],
    );
    const broken = { ...d, edges: d.edges.filter((e) => e.id !== 'z') };
    expect(() =>
      new DeterministicFlowEngine(2).resolve({
        definition: broken,
        currentNodeId: 'start' as FlowNodeId,
        context,
      }),
    ).toThrowError('AUTOMATIC_TRANSITION_LIMIT');
  });
  it('returns the same result for the same state and input', () => {
    const d = definition(
      node('text', 'TEXT', { type: 'TEXT', title: 'Stable' }),
    );
    const input = {
      definition: d,
      currentNodeId: 'start' as FlowNodeId,
      context,
    };
    expect(engine.resolve(input)).toEqual(engine.resolve(input));
  });
  it('exposes typed runtime errors', () =>
    expect(new FlowRuntimeError('SESSION_NOT_ACTIVE').code).toBe(
      'SESSION_NOT_ACTIVE',
    ));
  it('allows terminal transitions only from ACTIVE', () => {
    expect(canTransitionSession('ACTIVE', 'COMPLETED')).toBe(true);
    expect(canTransitionSession('COMPLETED', 'ACTIVE')).toBe(false);
    expect(() => assertSessionActive('ABANDONED')).toThrowError(
      'SESSION_NOT_ACTIVE',
    );
  });
});
