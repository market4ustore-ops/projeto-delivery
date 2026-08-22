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
  | { type: 'PRODUCT_LIST' | 'UPSELL'; products: Product[] }
  | { type: 'PRODUCT'; product: Product }
  | { type: 'BOUNDARY'; boundary: 'CART' | 'DELIVERY' | 'CHECKOUT' }
  | { type: 'END'; title?: string };
type State = {
  publicToken: string;
  revision: number;
  status: string;
  render: Render;
  completed: boolean;
};
const boundary = {
  CART: 'O carrinho será implementado na próxima etapa.',
  DELIVERY: 'As opções de entrega serão implementadas na próxima etapa.',
  CHECKOUT: 'O checkout será implementado na próxima etapa.',
};
function Products({ items }: { items: Product[] }) {
  return (
    <ul className="cards">
      {items.map((p) => (
        <li key={p.id}>
          <strong>{p.name}</strong>
          <span>R$ {p.price}</span>
          {p.description && <p>{p.description}</p>}
          <small>{p.available ? 'Disponível' : 'Indisponível'}</small>
        </li>
      ))}
    </ul>
  );
}
function Renderer({
  render,
  onAction,
  busy,
}: {
  render: Render;
  onAction: (
    a: { type: 'CONTINUE' } | { type: 'SELECT_CHOICE'; choiceKey: string },
  ) => void;
  busy: boolean;
}) {
  switch (render.type) {
    case 'TEXT':
      return (
        <>
          <h1>{render.title}</h1>
          {render.body && <p>{render.body}</p>}
          <button
            disabled={busy}
            onClick={() => onAction({ type: 'CONTINUE' })}
          >
            Continuar
          </button>
        </>
      );
    case 'CHOICE':
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
    case 'CATEGORY':
      return (
        <>
          <h1>Categorias</h1>
          <ul className="cards">
            {render.categories.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
          <button
            disabled={busy}
            onClick={() => onAction({ type: 'CONTINUE' })}
          >
            Continuar
          </button>
        </>
      );
    case 'PRODUCT_LIST':
      return (
        <>
          <h1>Produtos</h1>
          <Products items={render.products} />
          <button
            disabled={busy}
            onClick={() => onAction({ type: 'CONTINUE' })}
          >
            Continuar
          </button>
        </>
      );
    case 'PRODUCT':
      return (
        <>
          <h1>{render.product.name}</h1>
          <Products items={[render.product]} />
          <button
            disabled={busy}
            onClick={() => onAction({ type: 'CONTINUE' })}
          >
            Continuar
          </button>
        </>
      );
    case 'UPSELL':
      return (
        <>
          <h1>Você também pode gostar</h1>
          <Products items={render.products} />
          <button
            disabled={busy}
            onClick={() => onAction({ type: 'CONTINUE' })}
          >
            Continuar
          </button>
        </>
      );
    case 'BOUNDARY':
      return (
        <>
          <h1>{render.boundary}</h1>
          <p>{boundary[render.boundary]}</p>
          <button
            disabled={busy}
            onClick={() => onAction({ type: 'CONTINUE' })}
          >
            Continuar
          </button>
        </>
      );
    case 'END':
      return (
        <>
          <h1>{render.title ?? 'Jornada concluída'}</h1>
          <p>Obrigado.</p>
        </>
      );
  }
}
export function PublicFlow({
  locationSlug,
  flowSlug,
}: {
  locationSlug: string;
  flowSlug: string;
}) {
  const [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function start() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/public/flows/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationSlug, flowSlug }),
        }),
        data = (await r.json()) as State & { error?: string };
      if (!r.ok) throw new Error(data.error);
      setState(data);
    } catch {
      setError('Este fluxo não está disponível.');
    } finally {
      setBusy(false);
    }
  }
  async function advance(
    action: { type: 'CONTINUE' } | { type: 'SELECT_CHOICE'; choiceKey: string },
  ) {
    if (!state || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/public/sessions/advance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicToken: state.publicToken,
            expectedRevision: state.revision,
            idempotencyKey: crypto.randomUUID(),
            action,
          }),
        }),
        data = (await r.json()) as State & { error?: string };
      if (!r.ok) throw new Error(data.error);
      setState(data);
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'SESSION_EXPIRED'
          ? 'Sua sessão expirou. Reinicie para continuar.'
          : 'Não foi possível avançar. Reinicie ou tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="journey">
      <section className="panel" aria-busy={busy}>
        <p className="eyebrow">Delivery</p>
        {!state ? (
          <>
            <h1>Iniciar pedido</h1>
            <p>Comece a jornada publicada deste restaurante.</p>
            <button disabled={busy} onClick={() => void start()}>
              {busy ? 'Iniciando…' : 'Começar'}
            </button>
          </>
        ) : (
          <Renderer
            render={state.render}
            onAction={(a) => void advance(a)}
            busy={busy}
          />
        )}
        <p role="alert">{error}</p>
        {error && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void start()}
          >
            Reiniciar sessão
          </button>
        )}
      </section>
    </main>
  );
}
