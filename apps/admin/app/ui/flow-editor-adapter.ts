import type { Edge, Node } from '@xyflow/react';
import type {
  FlowCondition,
  FlowNodeConfig,
  FlowNodeType,
} from '@delivery/domain';

export type PersistedEditorNode = {
  id: string;
  flow_version_id: string;
  type: FlowNodeType;
  name: string | null;
  config: FlowNodeConfig;
  editor_metadata: { position?: { x: number; y: number } } | null;
  updated_at: string;
};

export type PersistedEditorEdge = {
  id: string;
  flow_version_id: string;
  source_node_id: string;
  target_node_id: string;
  condition_type: 'ALWAYS' | 'CHOICE_EQUALS';
  condition_config: { choiceKey?: string };
  sort_order: number;
};

export type EditorNodeData = {
  label: string;
  kind: FlowNodeType;
  summary: string;
};

export const stageLabels: Record<FlowNodeType, string> = {
  START: 'Comece aqui',
  TEXT: 'Mensagem',
  CHOICE: 'Pergunta',
  CATEGORY: 'Categoria',
  PRODUCT_LIST: 'Lista de produtos',
  PRODUCT: 'Produto',
  UPSELL: 'Sugestão',
  CART: 'Carrinho',
  DELIVERY: 'Entrega',
  CHECKOUT: 'Finalização',
  END: 'Encerramento',
};

const summary = (node: PersistedEditorNode) => {
  const config = node.config;
  if ('title' in config && config.title) return config.title;
  if (config.type === 'CHOICE') return `${config.options.length} opções`;
  if (config.type === 'CATEGORY')
    return `${config.categoryIds.length} categorias`;
  if ('productIds' in config && config.productIds)
    return `${config.productIds.length} produtos`;
  return node.name ?? stageLabels[node.type];
};

export function autoLayout(
  nodes: readonly PersistedEditorNode[],
  edges: readonly PersistedEditorEdge[],
): Map<string, { x: number; y: number }> {
  const levels = new Map<string, number>();
  const start = nodes.find((node) => node.type === 'START');
  if (start) levels.set(start.id, 0);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      const sourceLevel = levels.get(edge.source_node_id);
      if (sourceLevel === undefined || levels.has(edge.target_node_id))
        continue;
      levels.set(edge.target_node_id, sourceLevel + 1);
      changed = true;
    }
  }
  const perLevel = new Map<number, number>();
  return new Map(
    nodes.map((node, index) => {
      const level = levels.get(node.id) ?? index + 1;
      const row = perLevel.get(level) ?? 0;
      perLevel.set(level, row + 1);
      return [node.id, { x: level * 260 + 32, y: row * 150 + 36 }];
    }),
  );
}

export function toReactFlowGraph(
  nodes: readonly PersistedEditorNode[],
  edges: readonly PersistedEditorEdge[],
): { nodes: Node<EditorNodeData>[]; edges: Edge[] } {
  const automatic = autoLayout(nodes, edges);
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: 'journeyStage',
      position: node.editor_metadata?.position ?? automatic.get(node.id)!,
      data: {
        label: node.name ?? stageLabels[node.type],
        kind: node.type,
        summary: summary(node),
      },
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source_node_id,
      target: edge.target_node_id,
      label:
        edge.condition_type === 'CHOICE_EQUALS'
          ? edge.condition_config.choiceKey
          : 'Continuar',
    })),
  };
}

export const toPersistedPosition = (node: Node) => ({
  position: { x: node.position.x, y: node.position.y },
});

export const branchCondition = (choiceKey?: string): FlowCondition =>
  choiceKey ? { type: 'CHOICE_EQUALS', choiceKey } : { type: 'ALWAYS' };
