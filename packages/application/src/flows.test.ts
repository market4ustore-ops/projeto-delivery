import { describe, expect, it, vi } from 'vitest';
import {
  createFlow,
  ensureDraftVersion,
  listFlows,
  mutateFlowGraph,
  publishFlowVersion,
  ForbiddenError,
  type ActorContext,
  type FlowRepository,
} from './index.js';
import type {
  FlowDefinition,
  FlowId,
  FlowNodeId,
  FlowVersionId,
  LocationId,
  OrganizationId,
  UserId,
} from '@delivery/domain';
const location = '20000000-0000-0000-0000-000000000001' as LocationId;
const actor: ActorContext = {
  userId: 'u' as UserId,
  organizationId: 'o' as OrganizationId,
  locationId: location,
  role: 'OWNER',
};
const version = 'v' as FlowVersionId,
  start = 's' as FlowNodeId,
  end = 'e' as FlowNodeId;
const definition: FlowDefinition = {
  flowId: 'f' as FlowId,
  versionId: version,
  locationId: location,
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
      id: 'x',
      flowVersionId: version,
      sourceNodeId: start,
      targetNodeId: end,
      condition: { type: 'ALWAYS' },
      sortOrder: 0,
    },
  ],
};
const create = vi.fn(),
  ensureDraft = vi.fn(),
  publish = vi.fn();
const repo: FlowRepository = {
  create,
  ensureDraft,
  mutateGraph: vi.fn(),
  publish,
  get: vi.fn(),
  getVersion: vi.fn(),
  list: vi.fn(),
};
describe('flow application', () => {
  it('uses actor location for create/list/draft', async () => {
    await createFlow(repo, actor, { name: 'Menu flow', slug: 'menu' });
    await listFlows(repo, actor);
    await ensureDraftVersion(repo, actor, 'f');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: location }),
    );
    expect(ensureDraft).toHaveBeenCalledWith(
      expect.objectContaining({ locationId: location }),
    );
  });
  it('enforces read, write and publish permissions', () => {
    const kitchen = { ...actor, role: 'KITCHEN' as const };
    expect(() => listFlows(repo, kitchen)).toThrow(ForbiddenError);
    expect(() =>
      createFlow(repo, kitchen, { name: 'Menu', slug: 'menu' }),
    ).toThrow(ForbiddenError);
    expect(() =>
      publishFlowVersion(repo, { ...actor, role: 'CASHIER' }, definition),
    ).toThrow(ForbiddenError);
  });
  it('blocks cross-location publication', () =>
    expect(() =>
      publishFlowVersion(repo, actor, {
        ...definition,
        locationId: 'other' as LocationId,
      }),
    ).toThrow(ForbiddenError));
  it('rejects invalid publication before repository transaction', () =>
    expect(() =>
      publishFlowVersion(repo, actor, { ...definition, nodes: [] }),
    ).toThrow('MISSING_START'));
  it('delegates valid publication transaction', async () => {
    await publishFlowVersion(repo, actor, definition);
    expect(publish).toHaveBeenCalledWith({ definition, actorId: actor.userId });
  });
  it('blocks normal mutation of published and archived versions', () => {
    expect(() =>
      mutateFlowGraph(repo, actor, {
        operation: 'ADD_NODE',
        versionStatus: 'PUBLISHED',
        payload: {},
      }),
    ).toThrow('immutable');
    expect(() =>
      mutateFlowGraph(repo, actor, {
        operation: 'ADD_NODE',
        versionStatus: 'ARCHIVED',
        payload: {},
      }),
    ).toThrow();
  });
});
