import { createClient } from '@supabase/supabase-js';

export const createBrowserDatabaseClient = (url: string, anonKey: string) =>
  createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

export type BrowserDatabaseClient = ReturnType<
  typeof createBrowserDatabaseClient
>;

export const createCatalogGateway = (client: BrowserDatabaseClient) => ({
  list: (locationId: string) =>
    client.rpc('list_catalog', { target_location_id: locationId }),
  createCategory: (value: Record<string, unknown>) =>
    client.from('categories').insert(value),
  updateCategory: (id: string, value: Record<string, unknown>) =>
    client.from('categories').update(value).eq('id', id),
  createProduct: (value: Record<string, unknown>) =>
    client.from('products').insert(value),
  updateProduct: (id: string, value: Record<string, unknown>) =>
    client.from('products').update(value).eq('id', id),
  listProductDetails: async (productId: string) =>
    Promise.all([
      client
        .from('product_variants')
        .select('*')
        .eq('product_id', productId)
        .order('sort_order'),
      client
        .from('modifier_groups')
        .select('*,modifier_options(*)')
        .eq('product_id', productId)
        .order('sort_order'),
    ]),
  createVariant: (value: Record<string, unknown>) =>
    client.from('product_variants').insert(value),
  updateVariant: (id: string, value: Record<string, unknown>) =>
    client.from('product_variants').update(value).eq('id', id),
  createModifierGroup: (value: Record<string, unknown>) =>
    client.from('modifier_groups').insert(value),
  updateModifierGroup: (id: string, value: Record<string, unknown>) =>
    client.from('modifier_groups').update(value).eq('id', id),
  createModifierOption: (value: Record<string, unknown>) =>
    client.from('modifier_options').insert(value),
  updateModifierOption: (id: string, value: Record<string, unknown>) =>
    client.from('modifier_options').update(value).eq('id', id),
});

export const createFlowGateway = (client: BrowserDatabaseClient) => ({
  list: (locationId: string) =>
    client
      .from('flows')
      .select('*,flow_versions(*)')
      .eq('location_id', locationId)
      .order('name'),
  create: (locationId: string, name: string, slug: string) =>
    client.rpc('create_flow', {
      target_location_id: locationId,
      flow_name: name,
      flow_slug: slug,
    }),
  ensureDraft: (flowId: string) =>
    client.rpc('ensure_flow_draft', { target_flow_id: flowId }),
  definition: async (versionId: string) => {
    const [nodes, edges] = await Promise.all([
      client
        .from('flow_nodes')
        .select('*')
        .eq('flow_version_id', versionId)
        .order('created_at'),
      client
        .from('flow_edges')
        .select('*')
        .eq('flow_version_id', versionId)
        .order('sort_order'),
    ]);
    return { nodes, edges };
  },
  addNode: (value: Record<string, unknown>) =>
    client.from('flow_nodes').insert(value).select('*').single(),
  updateNode: (
    id: string,
    expectedUpdatedAt: string,
    value: Record<string, unknown>,
  ) =>
    client.rpc('update_flow_draft_node', {
      target_node_id: id,
      expected_updated_at: expectedUpdatedAt,
      target_name: value.name ?? null,
      target_config: value.config,
      target_editor_metadata: value.editor_metadata ?? {},
    }),
  addEdge: (value: Record<string, unknown>) =>
    client.from('flow_edges').insert(value).select('*').single(),
  deleteEdgesFrom: (versionId: string, sourceNodeId: string) =>
    client
      .from('flow_edges')
      .delete()
      .eq('flow_version_id', versionId)
      .eq('source_node_id', sourceNodeId),
  replaceBranches: (
    sourceNodeId: string,
    branches: readonly Record<string, unknown>[],
  ) =>
    client.rpc('replace_flow_draft_branches', {
      target_source_node_id: sourceNodeId,
      target_branches: branches,
    }),
  validate: (versionId: string) =>
    client.rpc('validate_flow_version', { target_version_id: versionId }),
  publish: (versionId: string) =>
    client.rpc('publish_flow_version', { target_version_id: versionId }),
});

export const createFlowRuntimeGateway = (client: BrowserDatabaseClient) => ({
  findPublished: async (locationId: string, slug: string) =>
    client
      .from('flows')
      .select('id,location_id,published_version_id')
      .eq('location_id', locationId)
      .eq('slug', slug)
      .not('published_version_id', 'is', null)
      .maybeSingle(),
  definition: async (versionId: string) => {
    const [version, nodes, edges] = await Promise.all([
      client
        .from('flow_versions')
        .select('id,flow_id,schema_version,flows!inner(location_id)')
        .eq('id', versionId)
        .single(),
      client.from('flow_nodes').select('*').eq('flow_version_id', versionId),
      client
        .from('flow_edges')
        .select('*')
        .eq('flow_version_id', versionId)
        .order('sort_order'),
    ]);
    return { version, nodes, edges };
  },
  categories: (locationId: string, ids: readonly string[]) =>
    ids.length
      ? client
          .from('categories')
          .select('id,name')
          .eq('location_id', locationId)
          .in('id', [...ids])
      : Promise.resolve({ data: [], error: null }),
  products: (
    locationId: string,
    input: { ids?: readonly string[]; categoryId?: string },
  ) => {
    let query = client
      .from('products')
      .select('id,name,base_price,category_id,is_available')
      .eq('location_id', locationId);
    if (input.ids?.length) query = query.in('id', [...input.ids]);
    if (input.categoryId) query = query.eq('category_id', input.categoryId);
    return query;
  },
  createSession: (value: {
    locationId: string;
    flowSlug: string;
    currentNodeId: string;
    engineResult: unknown;
  }) =>
    client.rpc('create_flow_session', {
      target_location_id: value.locationId,
      target_flow_slug: value.flowSlug,
      target_current_node_id: value.currentNodeId,
      target_engine_result: value.engineResult,
    }),
  advanceSession: (value: {
    publicToken: string;
    locationId: string;
    expectedRevision: number;
    idempotencyKey: string;
    currentNodeId: string;
    completed: boolean;
    selectedChoiceKeys: readonly string[];
    engineResult: unknown;
  }) =>
    client.rpc('advance_flow_session', {
      public_token: value.publicToken,
      target_location_id: value.locationId,
      expected_revision: value.expectedRevision,
      target_idempotency_key: value.idempotencyKey,
      target_current_node_id: value.currentNodeId,
      target_completed: value.completed,
      target_selected_choice_keys: value.selectedChoiceKeys,
      target_engine_result: value.engineResult,
    }),
});
