import { describe, expect, it } from 'vitest';
import {
  advanceFlowSession,
  startFlowSession,
  type FlowCatalogReader,
  type FlowRuntimeReader,
  type FlowSessionRepository,
  type PersistedSessionResult,
} from './flow-runtime.js';
import type {
  FlowDefinition,
  FlowId,
  FlowNodeId,
  FlowSession,
  FlowVersionId,
  LocationId,
} from '@delivery/domain';
const loc = '20000000-0000-0000-0000-000000000031' as LocationId,
  flowId = '70000000-0000-0000-0000-000000000031' as FlowId,
  v1 = '71000000-0000-0000-0000-000000000031' as FlowVersionId,
  v2 = '71000000-0000-0000-0000-000000000032' as FlowVersionId;
const def = (versionId: FlowVersionId, title: string): FlowDefinition => ({
  flowId,
  versionId,
  locationId: loc,
  schemaVersion: 1,
  nodes: [
    {
      id: '72000000-0000-0000-0000-000000000031' as FlowNodeId,
      flowVersionId: versionId,
      type: 'START',
      config: { type: 'START' },
    },
    {
      id: '72000000-0000-0000-0000-000000000032' as FlowNodeId,
      flowVersionId: versionId,
      type: 'TEXT',
      config: { type: 'TEXT', title },
    },
    {
      id: '72000000-0000-0000-0000-000000000033' as FlowNodeId,
      flowVersionId: versionId,
      type: 'END',
      config: { type: 'END' },
    },
  ],
  edges: [
    {
      id: 'a',
      flowVersionId: versionId,
      sourceNodeId: '72000000-0000-0000-0000-000000000031' as FlowNodeId,
      targetNodeId: '72000000-0000-0000-0000-000000000032' as FlowNodeId,
      condition: { type: 'ALWAYS' },
      sortOrder: 0,
    },
    {
      id: 'b',
      flowVersionId: versionId,
      sourceNodeId: '72000000-0000-0000-0000-000000000032' as FlowNodeId,
      targetNodeId: '72000000-0000-0000-0000-000000000033' as FlowNodeId,
      condition: { type: 'ALWAYS' },
      sortOrder: 0,
    },
  ],
});
class FakeSessions implements FlowSessionRepository {
  value?: PersistedSessionResult;
  keys = new Map<string, PersistedSessionResult>();
  async create(input: Parameters<FlowSessionRepository['create']>[0]) {
    await Promise.resolve();
    const session: FlowSession = {
      id: 'session',
      publicToken: 'token',
      flowId: input.flowId,
      flowVersionId: input.flowVersionId,
      locationId: input.locationId,
      status: input.completed ? 'COMPLETED' : 'ACTIVE',
      currentNodeId: input.currentNodeId,
      revision: 0,
      selectedChoiceKeys: input.selectedChoiceKeys,
    };
    return (this.value = { session, engine: input.engine });
  }
  async getByPublicToken() {
    await Promise.resolve();
    return this.value ?? null;
  }
  getIdempotentResult(
    input: Parameters<FlowSessionRepository['getIdempotentResult']>[0],
  ) {
    return Promise.resolve(this.keys.get(input.idempotencyKey) ?? null);
  }
  async advanceAtomically(
    input: Parameters<FlowSessionRepository['advanceAtomically']>[0],
  ) {
    await Promise.resolve();
    const cached = this.keys.get(input.idempotencyKey);
    if (cached) return cached;
    if (!this.value || this.value.session.revision !== input.expectedRevision)
      throw Object.assign(new Error('REVISION_CONFLICT'), {
        code: 'REVISION_CONFLICT',
      });
    const session = {
      ...this.value.session,
      currentNodeId: input.currentNodeId,
      revision: input.expectedRevision + 1,
      status: (input.completed
        ? 'COMPLETED'
        : 'ACTIVE') as FlowSession['status'],
      selectedChoiceKeys: input.selectedChoiceKeys,
    };
    const result = { session, engine: input.engine };
    this.value = result;
    this.keys.set(input.idempotencyKey, result);
    return result;
  }
  async abandonAtomically() {
    await Promise.resolve();
    if (!this.value) throw new Error();
    return this.value;
  }
}
const catalog: FlowCatalogReader = {
  getCategories: () => Promise.resolve([]),
  getProducts: () => Promise.resolve([]),
};
const setup = () => {
  let published: FlowVersionId | null = v1;
  const definitions = new Map<string, FlowDefinition>([
    [v1, def(v1, 'V1')],
    [v2, def(v2, 'V2')],
  ]);
  const flows: FlowRuntimeReader = {
    findPublishedBySlug: () =>
      Promise.resolve({
        id: flowId,
        locationId: loc,
        publishedVersionId: published,
      }),
    getDefinition: (id) => Promise.resolve(definitions.get(id) ?? null),
  };
  return {
    flows,
    catalog,
    sessions: new FakeSessions(),
    publish: (v: FlowVersionId | null) => {
      published = v;
    },
  };
};
describe('flow session application', () => {
  it('rejects an unpublished flow', async () => {
    const d = setup();
    d.publish(null);
    await expect(
      startFlowSession(d, { locationId: loc, flowSlug: 'menu' }),
    ).rejects.toMatchObject({ code: 'FLOW_NOT_PUBLISHED' });
  });
  it('starts on the published version and first renderable node', async () => {
    const d = setup();
    const r = await startFlowSession(d, { locationId: loc, flowSlug: 'menu' });
    expect(r.session.flowVersionId).toBe(v1);
    expect(r.engine.render).toMatchObject({ type: 'TEXT', title: 'V1' });
  });
  it('pins existing sessions while new sessions use a new publication', async () => {
    const d = setup();
    const old = await startFlowSession(d, {
      locationId: loc,
      flowSlug: 'menu',
    });
    d.publish(v2);
    const newer = await startFlowSession(
      { ...d, sessions: new FakeSessions() },
      { locationId: loc, flowSlug: 'menu' },
    );
    expect(old.session.flowVersionId).toBe(v1);
    expect(newer.session.flowVersionId).toBe(v2);
  });
  it('advances, increments revision and completes at END', async () => {
    const d = setup();
    await startFlowSession(d, { locationId: loc, flowSlug: 'menu' });
    const r = await advanceFlowSession(d, {
      locationId: loc,
      publicToken: 'token',
      expectedRevision: 0,
      idempotencyKey: 'key-1',
      action: { type: 'CONTINUE' },
    });
    expect(r.session).toMatchObject({ revision: 1, status: 'COMPLETED' });
  });
  it('returns the saved result for an idempotent retry', async () => {
    const d = setup();
    await startFlowSession(d, { locationId: loc, flowSlug: 'menu' });
    const input = {
      locationId: loc,
      publicToken: 'token',
      expectedRevision: 0,
      idempotencyKey: 'same',
      action: { type: 'CONTINUE' } as const,
    };
    const first = await advanceFlowSession(d, input);
    expect(await advanceFlowSession(d, input)).toEqual(first);
  });
  it('rejects completed sessions and stale revisions', async () => {
    const d = setup();
    await startFlowSession(d, { locationId: loc, flowSlug: 'menu' });
    await advanceFlowSession(d, {
      locationId: loc,
      publicToken: 'token',
      expectedRevision: 0,
      idempotencyKey: 'one',
      action: { type: 'CONTINUE' },
    });
    await expect(
      advanceFlowSession(d, {
        locationId: loc,
        publicToken: 'token',
        expectedRevision: 1,
        idempotencyKey: 'two',
        action: { type: 'CONTINUE' },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE' });
    d.sessions.value = {
      ...d.sessions.value!,
      session: { ...d.sessions.value!.session, status: 'ACTIVE' },
    };
    await expect(
      advanceFlowSession(d, {
        locationId: loc,
        publicToken: 'token',
        expectedRevision: 0,
        idempotencyKey: 'three',
        action: { type: 'CONTINUE' },
      }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });
  it('does not allow two concurrent writes at the same revision', async () => {
    const d = setup();
    const started = await startFlowSession(d, {
      locationId: loc,
      flowSlug: 'menu',
    });
    const engine = started.engine;
    await d.sessions.advanceAtomically({
      publicToken: 'token',
      locationId: loc,
      expectedRevision: 0,
      idempotencyKey: 'a',
      currentNodeId: 'x',
      completed: false,
      selectedChoiceKeys: [],
      engine,
    });
    await expect(
      d.sessions.advanceAtomically({
        publicToken: 'token',
        locationId: loc,
        expectedRevision: 0,
        idempotencyKey: 'b',
        currentNodeId: 'y',
        completed: false,
        selectedChoiceKeys: [],
        engine,
      }),
    ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  });
});
