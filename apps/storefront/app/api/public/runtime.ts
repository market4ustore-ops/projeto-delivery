import 'server-only';
import { createClient } from '@supabase/supabase-js';
import {
  DeterministicFlowEngine,
  type FlowDefinition,
  type FlowId,
  type FlowNodeConfig,
  type FlowNodeId,
  type FlowVersionId,
  type LocationId,
} from '@delivery/domain';
import { publicFlowDefinitionSchema } from '@delivery/schemas';
export const publicEngine = new DeterministicFlowEngine();
export const publicDatabase = () => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    key =
      process.env.SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('PUBLIC_RUNTIME_UNAVAILABLE');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};
export const parseDefinition = (
  value: unknown,
): {
  definition: FlowDefinition;
  catalog: ReturnType<typeof publicFlowDefinitionSchema.parse>['catalog'];
} => {
  const parsed = publicFlowDefinitionSchema.parse(value);
  return {
    definition: {
      flowId: parsed.flowId as FlowId,
      versionId: parsed.versionId as FlowVersionId,
      locationId: parsed.locationId as LocationId,
      schemaVersion: parsed.schemaVersion,
      nodes: parsed.nodes.map((n) => ({
        id: n.id as FlowNodeId,
        flowVersionId: n.flowVersionId as FlowVersionId,
        type: n.type,
        ...(n.name ? { name: n.name } : {}),
        config: n.config as FlowNodeConfig,
      })),
      edges: parsed.edges.map((e) => ({
        ...e,
        flowVersionId: e.flowVersionId as FlowVersionId,
        sourceNodeId: e.sourceNodeId as FlowNodeId,
        targetNodeId: e.targetNodeId as FlowNodeId,
      })),
    },
    catalog: parsed.catalog,
  };
};
export const publicResponse = (value: {
  publicToken: string;
  revision: number;
  status: string;
  engine: { render: unknown; completed: boolean };
}) => ({
  publicToken: value.publicToken,
  revision: value.revision,
  status: value.status,
  render: value.engine.render,
  completed: value.engine.completed,
});
export const safeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('EXPIRED'))
    return { status: 410, code: 'SESSION_EXPIRED' };
  if (message.includes('CONFLICT'))
    return { status: 409, code: 'SESSION_CHANGED' };
  if (
    message.includes('INVALID_CHOICE') ||
    message.includes('INVALID_PUBLIC_ACTION')
  )
    return { status: 422, code: 'INVALID_ACTION' };
  return { status: 404, code: 'FLOW_NOT_AVAILABLE' };
};
