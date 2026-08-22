'use client';
import { useState } from 'react';
type Product = {
  id: string;
  name: string;
  price: string;
  available: boolean;
  description?: string | null;
};
type Render =
  | { type: 'TEXT'; title: string; body?: string }
  | { type: 'CHOICE'; title: string; options: { key: string; label: string }[] }
  | { type: 'CATEGORY'; categories: { id: string; name: string }[] }
  | { type: 'PRODUCT_LIST'; products: Product[] }
  | { type: 'UPSELL'; products: Product[] }
  | { type: 'PRODUCT'; product: Product }
  | { type: 'BOUNDARY'; boundary: 'CART' | 'DELIVERY' | 'CHECKOUT' }
  | { type: 'END'; title?: string };
type FlowState = {
  publicToken: string;
  revision: number;
  status: string;
  render: Render;
  completed: boolean;
};
type CartItem = {
  id: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  productName: string;
  variantName?: string | null;
  unitPrice: string;
  lineTotal: string;
  modifiers: { optionId: string; name: string; priceDelta: string }[];
};
type Cart = {
  revision: number;
  status: string;
  subtotal: string;
  items: CartItem[];
};
type Configuration = {
  id: string;
  name: string;
  description?: string | null;
  basePrice: string;
  variants: { id: string; name: string; price: string; default: boolean }[];
  modifierGroups: {
    id: string;
    name: string;
    minSelections: number;
    maxSelections: number;
    required: boolean;
    options: { id: string; name: string; priceDelta: string }[];
  }[];
};
const money = (value: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value),
  );
function ProductCards({
  items,
  onOpen,
}: {
  items: Product[];
  onOpen: (p: Product) => void;
}) {
  return (
    <ul className="cards">
      {items.map((p) => (
        <li key={p.id}>
          <strong>{p.name}</strong>
          <span>{money(p.price)}</span>
          {p.description && <p>{p.description}</p>}
          <button disabled={!p.available} onClick={() => onOpen(p)}>
            Personalizar / Adicionar
          </button>
        </li>
      ))}
    </ul>
  );
}
function Renderer({
  render,
  busy,
  onAction,
  onProduct,
  onCart,
}: {
  render: Render;
  busy: boolean;
  onAction: (
    a: { type: 'CONTINUE' } | { type: 'SELECT_CHOICE'; choiceKey: string },
  ) => void;
  onProduct: (p: Product) => void;
  onCart: () => void;
}) {
  if (render.type === 'TEXT')
    return (
      <>
        <h1>{render.title}</h1>
        {render.body && <p>{render.body}</p>}
        <button disabled={busy} onClick={() => onAction({ type: 'CONTINUE' })}>
          Continuar
        </button>
      </>
    );
  if (render.type === 'CHOICE')
    return (
      <>
        <h1>{render.title}</h1>
        <div className="choices">
          {render.options.map((o) => (
            <button
              disabled={busy}
              key={o.key}
              onClick={() =>
                onAction({ type: 'SELECT_CHOICE', choiceKey: o.key })
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      </>
    );
  if (render.type === 'CATEGORY')
    return (
      <>
        <h1>Categorias</h1>
        <ul className="cards">
          {render.categories.map((c) => (
            <li key={c.id}>{c.name}</li>
          ))}
        </ul>
        <button onClick={() => onAction({ type: 'CONTINUE' })}>
          Continuar
        </button>
      </>
    );
  if (render.type === 'PRODUCT_LIST' || render.type === 'UPSELL')
    return (
      <>
        <h1>
          {render.type === 'UPSELL' ? 'Você também pode gostar' : 'Produtos'}
        </h1>
        <ProductCards items={render.products} onOpen={onProduct} />
        <button onClick={() => onAction({ type: 'CONTINUE' })}>
          Continuar
        </button>
      </>
    );
  if (render.type === 'PRODUCT')
    return (
      <>
        <h1>{render.product.name}</h1>
        <ProductCards items={[render.product]} onOpen={onProduct} />
        <button onClick={() => onAction({ type: 'CONTINUE' })}>
          Continuar
        </button>
      </>
    );
  if (render.type === 'BOUNDARY')
    return (
      <>
        <h1>{render.boundary}</h1>
        {render.boundary === 'CART' ? (
          <button onClick={onCart}>Abrir carrinho</button>
        ) : (
          <p>Esta etapa será implementada futuramente.</p>
        )}
        <button onClick={() => onAction({ type: 'CONTINUE' })}>
          Continuar
        </button>
      </>
    );
  return (
    <>
      <h1>{render.title ?? 'Jornada concluída'}</h1>
      <p>Obrigado.</p>
    </>
  );
}
export function PublicFlow({
  locationSlug,
  flowSlug,
}: {
  locationSlug: string;
  flowSlug: string;
}) {
  const [flow, setFlow] = useState<FlowState | null>(null),
    [cartToken, setCartToken] = useState(''),
    [cart, setCart] = useState<Cart | null>(null),
    [configuration, setConfiguration] = useState<Configuration | null>(null),
    [editing, setEditing] = useState<CartItem | null>(null),
    [variantId, setVariantId] = useState(''),
    [options, setOptions] = useState<string[]>([]),
    [quantity, setQuantity] = useState(1),
    [cartOpen, setCartOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [sessionExpired, setSessionExpired] = useState(false);
  async function start() {
    setBusy(true);
    setError('');
    setSessionExpired(false);
    try {
      const [flowResponse, cartResponse] = await Promise.all([
        fetch('/api/public/flows/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationSlug, flowSlug }),
        }),
        fetch('/api/public/cart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationSlug }),
        }),
      ]);
      const f = (await flowResponse.json()) as FlowState & { error?: string };
      const c = (await cartResponse.json()) as {
        publicToken: string;
        cart: Cart;
      };
      if (!flowResponse.ok || !cartResponse.ok) throw new Error();
      setFlow(f);
      setCartToken(c.publicToken);
      setCart(c.cart);
    } catch {
      setError('Esta jornada não está disponível.');
    } finally {
      setBusy(false);
    }
  }
  async function advance(
    action: { type: 'CONTINUE' } | { type: 'SELECT_CHOICE'; choiceKey: string },
  ) {
    if (!flow || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/public/sessions/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken: flow.publicToken,
          expectedRevision: flow.revision,
          idempotencyKey: crypto.randomUUID(),
          action,
        }),
      });
      const data = (await r.json()) as FlowState & { error?: string };
      if (!r.ok) {
        if (data.error === 'SESSION_EXPIRED') {
          setSessionExpired(true);
          setError('Sua sessão expirou.');
          return;
        }
        throw new Error();
      }
      setFlow(data);
    } catch {
      setError('Não foi possível avançar.');
    } finally {
      setBusy(false);
    }
  }
  async function openProduct(product: Product, item?: CartItem) {
    const r = await fetch(
      `/api/public/cart/product?token=${cartToken}&productId=${product.id}`,
    );
    if (!r.ok) return setError('Produto indisponível.');
    const data = (await r.json()) as Configuration;
    setConfiguration(data);
    setEditing(item ?? null);
    setVariantId(
      item?.variantId ?? data.variants.find((v) => v.default)?.id ?? '',
    );
    setOptions(item?.modifiers.map((m) => m.optionId) ?? []);
    setQuantity(item?.quantity ?? 1);
  }
  async function mutate(action: Record<string, unknown>) {
    if (!cart) return;
    setBusy(true);
    try {
      const r = await fetch('/api/public/cart', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken: cartToken,
          expectedRevision: cart.revision,
          idempotencyKey: crypto.randomUUID(),
          action,
        }),
      });
      const data = (await r.json()) as Cart & { error?: string };
      if (!r.ok) throw new Error(data.error);
      setCart(data);
      setConfiguration(null);
      setEditing(null);
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'CART_REVISION_CONFLICT'
          ? 'O carrinho mudou. Tente novamente.'
          : 'Não foi possível atualizar o carrinho.',
      );
    } finally {
      setBusy(false);
    }
  }
  const add = () =>
    configuration &&
    mutate({
      type: editing ? 'UPDATE' : 'ADD',
      ...(editing ? { itemId: editing.id } : {}),
      productId: configuration.id,
      variantId: variantId || null,
      modifierOptionIds: options,
      quantity,
    });
  return (
    <main className="journey">
      <section className="panel" aria-busy={busy}>
        <p className="eyebrow">Delivery</p>
        {!flow ? (
          <>
            <h1>Iniciar pedido</h1>
            <p>Comece a jornada publicada deste restaurante.</p>
            <button onClick={() => void start()} disabled={busy}>
              Começar
            </button>
          </>
        ) : (
          <Renderer
            render={flow.render}
            busy={busy}
            onAction={(a) => void advance(a)}
            onProduct={(p) => void openProduct(p)}
            onCart={() => setCartOpen(true)}
          />
        )}
        <p role="alert">{error}</p>
        {sessionExpired && (
          <button
            onClick={() => {
              setFlow(null);
              setCart(null);
              setCartToken('');
              setSessionExpired(false);
              setError('');
            }}
          >
            Reiniciar sessão
          </button>
        )}
      </section>
      {cart && (
        <button className="cart-bar" onClick={() => setCartOpen(true)}>
          🛒 {cart.items.reduce((n, i) => n + i.quantity, 0)} itens ·{' '}
          {money(cart.subtotal)}
        </button>
      )}
      {configuration && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Personalizar produto"
        >
          <section className="sheet">
            <button
              className="secondary"
              onClick={() => setConfiguration(null)}
            >
              Fechar
            </button>
            <h2>{configuration.name}</h2>
            {configuration.description && <p>{configuration.description}</p>}
            {configuration.variants.length > 0 && (
              <fieldset>
                <legend>Escolha uma opção</legend>
                {configuration.variants.map((v) => (
                  <label key={v.id}>
                    <input
                      type="radio"
                      name="variant"
                      checked={variantId === v.id}
                      onChange={() => setVariantId(v.id)}
                    />
                    {v.name} · {money(v.price)}
                  </label>
                ))}
              </fieldset>
            )}
            {configuration.modifierGroups.map((g) => (
              <fieldset key={g.id}>
                <legend>
                  {g.name} ({g.minSelections}–{g.maxSelections})
                </legend>
                {g.options.map((o) => (
                  <label key={o.id}>
                    <input
                      type="checkbox"
                      checked={options.includes(o.id)}
                      onChange={(e) =>
                        setOptions((current) =>
                          e.target.checked
                            ? [...current, o.id]
                            : current.filter((id) => id !== o.id),
                        )
                      }
                    />
                    {o.name} · {money(o.priceDelta)}
                  </label>
                ))}
              </fieldset>
            ))}
            <label>
              Quantidade
              <input
                aria-label="Quantidade"
                type="number"
                min="1"
                max="99"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            <button disabled={busy} onClick={() => void add()}>
              {editing ? 'Salvar alterações' : 'Adicionar ao pedido'}
            </button>
          </section>
        </div>
      )}
      {cartOpen && cart && (
        <div
          className="sheet-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Carrinho"
        >
          <section className="sheet">
            <button className="secondary" onClick={() => setCartOpen(false)}>
              Fechar
            </button>
            <h2>Seu carrinho</h2>
            {cart.items.map((i) => (
              <article className="cart-item" key={i.id}>
                <strong>{i.productName}</strong>
                <span>{i.variantName}</span>
                <small>{i.modifiers.map((m) => m.name).join(', ')}</small>
                <span>
                  {i.quantity} × {money(i.unitPrice)} = {money(i.lineTotal)}
                </span>
                <div>
                  <button
                    className="secondary"
                    onClick={() =>
                      void openProduct(
                        {
                          id: i.productId,
                          name: i.productName,
                          price: i.unitPrice,
                          available: true,
                        },
                        i,
                      )
                    }
                  >
                    Editar
                  </button>
                  <button
                    className="secondary"
                    onClick={() =>
                      void mutate({
                        type: 'UPDATE',
                        itemId: i.id,
                        productId: i.productId,
                        variantId: i.variantId ?? null,
                        modifierOptionIds: i.modifiers.map((m) => m.optionId),
                        quantity: Math.min(99, i.quantity + 1),
                      })
                    }
                  >
                    +
                  </button>
                  {i.quantity > 1 && (
                    <button
                      className="secondary"
                      onClick={() =>
                        void mutate({
                          type: 'UPDATE',
                          itemId: i.id,
                          productId: i.productId,
                          variantId: i.variantId ?? null,
                          modifierOptionIds: i.modifiers.map((m) => m.optionId),
                          quantity: i.quantity - 1,
                        })
                      }
                    >
                      −
                    </button>
                  )}
                  <button
                    className="secondary"
                    onClick={() =>
                      void mutate({ type: 'REMOVE', itemId: i.id })
                    }
                  >
                    Remover
                  </button>
                </div>
              </article>
            ))}
            <h3>Subtotal: {money(cart.subtotal)}</h3>
            <button disabled>Continuar (em breve)</button>
          </section>
        </div>
      )}
    </main>
  );
}
