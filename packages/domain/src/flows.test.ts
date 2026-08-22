import { describe, expect, it } from 'vitest';
import {
  assertDraftEditable,
  validateFlowDefinition,
  type FlowDefinition,
  type FlowNodeId,
  type FlowVersionId,
  type FlowId,
} from './flows.js';
import type { LocationId } from './organizations.js';
const version = 'v1' as FlowVersionId,
  start = 'start' as FlowNodeId,
  end = 'end' as FlowNodeId;
const valid = (): FlowDefinition => ({
  flowId: 'flow' as FlowId,
  versionId: version,
  locationId: 'loc' as LocationId,
  schemaVersion: 1,
  nodes: [
    {
      id: start,
      flowVersionId: version,
      type: 'START',
      config: { type: 'START' },
    },
    { id: end, flowVersionId: version, type: 'END', config: { type: 'END' } },
  ],
  edges: [
    {
      id: 'e',
      flowVersionId: version,
      sourceNodeId: start,
      targetNodeId: end,
      condition: { type: 'ALWAYS' },
      sortOrder: 0,
    },
  ],
});
describe('flow domain', () => {
  it('accepts a minimal valid graph', () =>
    expect(validateFlowDefinition(valid()).valid).toBe(true));
  it('reports missing start', () => {
    const d = valid();
    expect(
      validateFlowDefinition({
        ...d,
        nodes: d.nodes.filter((x) => x.type !== 'START'),
      }).errors,
    ).toContainEqual(expect.objectContaining({ code: 'MISSING_START' }));
  });
  it('reports missing end', () => {
    const d = valid();
    expect(
      validateFlowDefinition({
        ...d,
        nodes: d.nodes.filter((x) => x.type !== 'END'),
      }).errors,
    ).toContainEqual(expect.objectContaining({ code: 'MISSING_END' }));
  });
  it('detects unreachable nodes and cycles', () => {
    const d = valid();
    const extra = {
      id: 'x' as FlowNodeId,
      flowVersionId: version,
      type: 'END' as const,
      config: { type: 'END' as const },
    };
    expect(
      validateFlowDefinition({ ...d, nodes: [...d.nodes, extra] }).errors.some(
        (e) => e.code === 'UNREACHABLE_NODE',
      ),
    ).toBe(true);
    const cycle = {
      ...d,
      edges: [
        ...d.edges,
        {
          id: 'back',
          flowVersionId: version,
          sourceNodeId: end,
          targetNodeId: start,
          condition: { type: 'ALWAYS' as const },
          sortOrder: 1,
        },
      ],
    };
    expect(
      validateFlowDefinition(cycle).errors.some(
        (e) => e.code === 'CYCLE_DETECTED',
      ),
    ).toBe(true);
  });
  it('validates choice branches and node config', () => {
    const d = valid();
    const choice = {
      id: 'choice' as FlowNodeId,
      flowVersionId: version,
      type: 'CHOICE' as const,
      config: {
        type: 'CHOICE' as const,
        title: 'Choose',
        options: [{ key: 'yes', label: 'Yes' }],
      },
    };
    const r = validateFlowDefinition({
      ...d,
      nodes: [d.nodes[0]!, choice, d.nodes[1]!],
      edges: [
        { ...d.edges[0]!, targetNodeId: choice.id },
        { ...d.edges[0]!, id: 'two', sourceNodeId: choice.id },
      ],
    });
    expect(r.errors.some((e) => e.code === 'MISSING_BRANCH_DESTINATION')).toBe(
      true,
    );
  });
  it('validates catalog ownership sets', () => {
    const d = valid();
    const product = {
      id: 'p' as FlowNodeId,
      flowVersionId: version,
      type: 'PRODUCT' as const,
      config: { type: 'PRODUCT' as const, productId: 'foreign' },
    };
    const r = validateFlowDefinition(
      {
        ...d,
        nodes: [d.nodes[0]!, product, d.nodes[1]!],
        edges: [
          { ...d.edges[0]!, targetNodeId: product.id },
          { ...d.edges[0]!, id: 'two', sourceNodeId: product.id },
        ],
      },
      { categoryIds: new Set(), productIds: new Set() },
    );
    expect(r.errors.some((e) => e.code === 'INVALID_CATALOG_REFERENCE')).toBe(
      true,
    );
  });
  it('only permits draft mutation', () => {
    expect(() => assertDraftEditable('PUBLISHED')).toThrow('immutable');
    expect(() => assertDraftEditable('ARCHIVED')).toThrow();
    expect(() => assertDraftEditable('DRAFT')).not.toThrow();
  });
});
