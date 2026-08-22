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
    client.from('flow_nodes').insert(value),
  addEdge: (value: Record<string, unknown>) =>
    client.from('flow_edges').insert(value),
  validate: (versionId: string) =>
    client.rpc('validate_flow_version', { target_version_id: versionId }),
  publish: (versionId: string) =>
    client.rpc('publish_flow_version', { target_version_id: versionId }),
});
