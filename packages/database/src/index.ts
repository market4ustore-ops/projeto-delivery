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
