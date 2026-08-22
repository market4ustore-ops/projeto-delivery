import { NextResponse } from 'next/server';
import { publicFlowAdvanceSchema } from '@delivery/schemas';
import { z } from 'zod';
import type { FlowNodeId } from '@delivery/domain';
import {
  parseDefinition,
  publicDatabase,
  publicEngine,
  publicResponse,
  safeError,
} from '../../runtime';
export async function POST(request: Request) {
  try {
    const input = publicFlowAdvanceSchema.parse(await request.json()),
      db = publicDatabase(),
      loaded = await db.rpc('get_public_flow_session', {
        public_token: input.publicToken,
      });
    if (loaded.error || !loaded.data) throw new Error('FLOW_SESSION_EXPIRED');
    const session = z
      .object({
        status: z.string(),
        definition: z.unknown(),
        currentNodeId: z.string().uuid(),
        selectedChoiceKeys: z.array(z.string()),
      })
      .parse(loaded.data);
    if (session.status === 'EXPIRED') throw new Error('FLOW_SESSION_EXPIRED');
    const { definition, catalog } = parseDefinition(session.definition),
      engine = publicEngine.resolve({
        definition,
        currentNodeId: session.currentNodeId as FlowNodeId,
        input: input.action,
        context: {
          locationId: definition.locationId,
          flowId: definition.flowId,
          flowVersionId: definition.versionId,
          selectedChoiceKeys: session.selectedChoiceKeys,
          catalog,
        },
      });
    const advanced = await db.rpc('advance_public_flow_session', {
      public_token: input.publicToken,
      expected_revision: input.expectedRevision,
      target_idempotency_key: input.idempotencyKey,
      target_current_node_id: engine.node.id,
      target_completed: engine.completed,
      target_selected_choice_keys: engine.selectedChoiceKey
        ? [...session.selectedChoiceKeys, engine.selectedChoiceKey]
        : session.selectedChoiceKeys,
      target_engine_result: engine,
      action_type: input.action.type,
      choice_key:
        input.action.type === 'SELECT_CHOICE' ? input.action.choiceKey : null,
    });
    if (advanced.error) throw advanced.error;
    return NextResponse.json(
      publicResponse(advanced.data as Parameters<typeof publicResponse>[0]),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const safe = safeError(error);
    return NextResponse.json({ error: safe.code }, { status: safe.status });
  }
}
