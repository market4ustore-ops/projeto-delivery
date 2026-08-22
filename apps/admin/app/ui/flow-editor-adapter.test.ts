import { describe, expect, it } from 'vitest';
import {
  branchCondition,
  toPersistedPosition,
  toReactFlowGraph,
  type PersistedEditorEdge,
  type PersistedEditorNode,
} from './flow-editor-adapter';

const nodes: PersistedEditorNode[] = [
  {
    id: 'start',
    flow_version_id: 'v',
    type: 'START',
    name: null,
    config: { type: 'START' },
    editor_metadata: null,
    updated_at: 'now',
  },
  {
    id: 'question',
    flow_version_id: 'v',
    type: 'CHOICE',
    name: null,
    config: {
      type: 'CHOICE',
      title: 'O que deseja?',
      options: [{ key: 'pizza', label: 'Pizza' }],
    },
    editor_metadata: null,
    updated_at: 'now',
  },
];
const edges: PersistedEditorEdge[] = [
  {
    id: 'e',
    flow_version_id: 'v',
    source_node_id: 'start',
    target_node_id: 'question',
    condition_type: 'ALWAYS',
    condition_config: {},
    sort_order: 0,
  },
];

describe('Flow editor adapter', () => {
  it('maps the persisted graph and applies automatic layout', () => {
    const graph = toReactFlowGraph(nodes, edges);
    expect(graph.nodes[0]?.data.label).toBe('Comece aqui');
    expect(graph.nodes[1]!.position.x).toBeGreaterThan(
      graph.nodes[0]!.position.x,
    );
    expect(graph.edges[0]).toMatchObject({
      source: 'start',
      target: 'question',
      label: 'Continuar',
    });
  });
  it('maps manual position to editor-only metadata', () => {
    expect(
      toPersistedPosition({ id: 'x', position: { x: 10, y: 20 }, data: {} }),
    ).toEqual({ position: { x: 10, y: 20 } });
  });
  it('maps friendly branches to the existing condition contract', () => {
    expect(branchCondition('pizza')).toEqual({
      type: 'CHOICE_EQUALS',
      choiceKey: 'pizza',
    });
    expect(branchCondition()).toEqual({ type: 'ALWAYS' });
  });
});
