import { NextResponse } from 'next/server';
import { publicFlowStartSchema } from '@delivery/schemas';
import {
  parseDefinition,
  publicDatabase,
  publicEngine,
  publicResponse,
  safeError,
} from '../../runtime';
export async function POST(request: Request) {
  try {
    const input = publicFlowStartSchema.parse(await request.json()),
      db = publicDatabase(),
      loaded = await db.rpc('get_public_flow', {
        location_slug: input.locationSlug,
        flow_slug: input.flowSlug,
      });
    if (loaded.error || !loaded.data) throw new Error('FLOW_NOT_AVAILABLE');
    const { definition, catalog } = parseDefinition(loaded.data),
      start = definition.nodes.find((n) => n.type === 'START');
    if (!start) throw new Error('FLOW_NOT_AVAILABLE');
    const engine = publicEngine.resolve({
      definition,
      currentNodeId: start.id,
      context: {
        locationId: definition.locationId,
        flowId: definition.flowId,
        flowVersionId: definition.versionId,
        catalog,
      },
    });
    const created = await db.rpc('start_public_flow_session', {
      location_slug: input.locationSlug,
      flow_slug: input.flowSlug,
      target_current_node_id: engine.node.id,
      target_engine_result: engine,
    });
    if (created.error) throw created.error;
    return NextResponse.json(
      publicResponse(created.data as Parameters<typeof publicResponse>[0]),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status });
  }
}
