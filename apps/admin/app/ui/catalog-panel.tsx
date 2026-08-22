'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import {
  createCatalogGateway,
  type BrowserDatabaseClient,
} from '@delivery/database';
import {
  categoryInputSchema,
  modifierGroupInputSchema,
  modifierOptionInputSchema,
  productInputSchema,
  variantInputSchema,
} from '@delivery/schemas';

type Row = {
  id: string;
  name: string;
  slug?: string;
  category_id?: string;
  base_price?: number | string;
};
type Group = Row & { modifier_options?: Row[] };
export function CatalogPanel({
  client,
  locationId,
}: {
  client: BrowserDatabaseClient;
  locationId: string;
}) {
  const gateway = useMemo(() => createCatalogGateway(client), [client]);
  const [categories, setCategories] = useState<Row[]>([]);
  const [products, setProducts] = useState<Row[]>([]);
  const [productId, setProductId] = useState('');
  const [variants, setVariants] = useState<Row[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await gateway.list(locationId);
    setLoading(false);
    if (r.error) return setStatus(r.error.message);
    const value = r.data as unknown as { categories?: Row[]; products?: Row[] };
    setCategories(value.categories ?? []);
    setProducts(value.products ?? []);
  }, [gateway, locationId]);
  const details = useCallback(
    async (id: string) => {
      setProductId(id);
      const [v, g] = await gateway.listProductDetails(id);
      if (v.error || g.error)
        return setStatus(v.error?.message ?? g.error?.message ?? 'Erro');
      setVariants((v.data ?? []) as Row[]);
      setGroups((g.data ?? []) as Group[]);
    },
    [gateway],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function category(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      p = categoryInputSchema.safeParse({
        locationId,
        name: f.get('name'),
        slug: f.get('slug'),
        description: null,
      });
    if (!p.success) return setStatus(p.error.issues[0]?.message ?? 'Inválido');
    const r = await gateway.createCategory({
      location_id: locationId,
      name: p.data.name,
      slug: p.data.slug,
    });
    if (r.error) setStatus(r.error.message);
    else {
      e.currentTarget.reset();
      await refresh();
    }
  }
  async function product(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      p = productInputSchema.safeParse({
        locationId,
        categoryId: f.get('category'),
        name: f.get('name'),
        slug: f.get('slug'),
        basePrice: f.get('price'),
        description: null,
        imageReference: null,
      });
    if (!p.success) return setStatus(p.error.issues[0]?.message ?? 'Inválido');
    const r = await gateway.createProduct({
      location_id: locationId,
      category_id: p.data.categoryId,
      name: p.data.name,
      slug: p.data.slug,
      base_price: p.data.basePrice,
    });
    if (r.error) setStatus(r.error.message);
    else {
      e.currentTarget.reset();
      await refresh();
    }
  }
  async function variant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      p = variantInputSchema.safeParse({
        productId,
        name: f.get('name'),
        price: f.get('price'),
        isDefault: f.get('default') === 'on',
      });
    if (!p.success) return setStatus(p.error.issues[0]?.message ?? 'Inválido');
    const r = await gateway.createVariant({
      product_id: productId,
      name: p.data.name,
      price: p.data.price,
      is_default: p.data.isDefault,
    });
    if (r.error) setStatus(r.error.message);
    else await details(productId);
  }
  async function group(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      min = Number(f.get('min')),
      p = modifierGroupInputSchema.safeParse({
        productId,
        name: f.get('name'),
        minSelections: min,
        maxSelections: Number(f.get('max')),
        isRequired: min > 0,
      });
    if (!p.success) return setStatus('Limites inválidos');
    const r = await gateway.createModifierGroup({
      product_id: productId,
      name: p.data.name,
      min_selections: p.data.minSelections,
      max_selections: p.data.maxSelections,
      is_required: p.data.isRequired,
    });
    if (r.error) setStatus(r.error.message);
    else await details(productId);
  }
  async function option(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      p = modifierOptionInputSchema.safeParse({
        modifierGroupId: f.get('group'),
        name: f.get('name'),
        priceDelta: f.get('delta'),
      });
    if (!p.success) return setStatus('Opção inválida');
    const r = await gateway.createModifierOption({
      modifier_group_id: p.data.modifierGroupId,
      name: p.data.name,
      price_delta: p.data.priceDelta,
    });
    if (r.error) setStatus(r.error.message);
    else await details(productId);
  }
  const rename = async (
    kind: 'category' | 'product' | 'variant' | 'group' | 'option',
    id: string,
    current: string,
  ) => {
    const name = window.prompt('Novo nome', current)?.trim();
    if (!name) return;
    const methods = {
      category: gateway.updateCategory,
      product: gateway.updateProduct,
      variant: gateway.updateVariant,
      group: gateway.updateModifierGroup,
      option: gateway.updateModifierOption,
    };
    const r = await methods[kind](id, { name });
    if (r.error) setStatus(r.error.message);
    else {
      await refresh();
      if (productId) await details(productId);
    }
  };
  return (
    <section className="card stack">
      <h2>Catálogo da unidade</h2>
      <p aria-live="polite">{loading ? 'Carregando…' : status}</p>
      <div className="grid">
        <div>
          <h3>Categorias</h3>
          <form onSubmit={(e) => void category(e)}>
            <input name="name" placeholder="Nome" required />
            <input name="slug" placeholder="slug" required />
            <button>Criar categoria</button>
          </form>
          <ul>
            {categories.map((x) => (
              <li key={x.id}>
                {x.name}{' '}
                <button
                  className="secondary"
                  onClick={() => void rename('category', x.id, x.name)}
                >
                  Editar
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Produtos</h3>
          <form onSubmit={(e) => void product(e)}>
            <select name="category" required>
              <option value="">Categoria</option>
              {categories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <input name="name" placeholder="Nome" required />
            <input name="slug" placeholder="slug" required />
            <input
              name="price"
              inputMode="decimal"
              placeholder="29.90"
              required
            />
            <button>Criar produto</button>
          </form>
          <ul>
            {products.map((x) => (
              <li key={x.id}>
                <button
                  className="secondary"
                  onClick={() => void details(x.id)}
                >
                  {x.name}
                </button>{' '}
                <button
                  className="secondary"
                  onClick={() => void rename('product', x.id, x.name)}
                >
                  Editar
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {productId && (
        <div className="grid">
          <div>
            <h3>Variantes</h3>
            <form onSubmit={(e) => void variant(e)}>
              <input name="name" placeholder="Nome" required />
              <input name="price" placeholder="Preço final" required />
              <label>
                <input name="default" type="checkbox" /> Padrão
              </label>
              <button>Criar variante</button>
            </form>
            <ul>
              {variants.map((x) => (
                <li key={x.id}>
                  {x.name}{' '}
                  <button
                    className="secondary"
                    onClick={() => void rename('variant', x.id, x.name)}
                  >
                    Editar
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Modificadores</h3>
            <form onSubmit={(e) => void group(e)}>
              <input name="name" placeholder="Grupo" required />
              <input
                name="min"
                type="number"
                min="0"
                placeholder="Mín."
                required
              />
              <input
                name="max"
                type="number"
                min="0"
                placeholder="Máx."
                required
              />
              <button>Criar grupo</button>
            </form>
            <form onSubmit={(e) => void option(e)}>
              <select name="group" required>
                <option value="">Grupo</option>
                {groups.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <input name="name" placeholder="Opção" required />
              <input name="delta" placeholder="Acréscimo" required />
              <button>Criar opção</button>
            </form>
            <ul>
              {groups.map((g) => (
                <li key={g.id}>
                  {g.name}{' '}
                  <button
                    className="secondary"
                    onClick={() => void rename('group', g.id, g.name)}
                  >
                    Editar
                  </button>
                  <ul>
                    {g.modifier_options?.map((o) => (
                      <li key={o.id}>
                        {o.name}{' '}
                        <button
                          className="secondary"
                          onClick={() => void rename('option', o.id, o.name)}
                        >
                          Editar
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
