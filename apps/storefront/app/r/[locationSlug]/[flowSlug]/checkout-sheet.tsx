'use client';
import { useState } from 'react';
type Item = {
  id: string;
  productName?: string;
  name?: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  modifiers: { name: string }[];
};
type Checkout = {
  status: 'IN_PROGRESS' | 'READY' | 'EXPIRED' | 'CANCELED';
  revision: number;
  fulfillmentType?: 'DELIVERY' | 'PICKUP';
  customer?: { name: string; phone: string } | null;
  address?: Record<string, string | null> | null;
  subtotal: string;
  deliveryFee: string;
  total: string;
  cartRevision: number;
  cartRevisionValidated?: number | null;
  items: Item[];
};
type PublicOrder = {
  displayNumber: string;
  status: string;
  fulfillmentType: string;
  subtotal: string;
  deliveryFee: string;
  total: string;
  createdAt: string;
  items: Item[];
};
const money = (value: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value),
  );
export function CheckoutSheet({
  cartToken,
  onClose,
  onBackToCart,
}: {
  cartToken: string;
  onClose: () => void;
  onBackToCart: () => void;
}) {
  const [checkout, setCheckout] = useState<Checkout | null>(null),
    [order, setOrder] = useState<PublicOrder | null>(null),
    [step, setStep] = useState<
      'FULFILLMENT' | 'CUSTOMER' | 'ADDRESS' | 'REVIEW'
    >('FULFILLMENT'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [fulfillment, setFulfillment] = useState<'DELIVERY' | 'PICKUP'>(
      'DELIVERY',
    ),
    [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [address, setAddress] = useState({
      postalCode: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      reference: '',
    });
  async function start() {
    setBusy(true);
    try {
      const r = await fetch('/api/public/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartToken,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = (await r.json()) as Checkout & { error?: string };
      if (!r.ok) throw new Error(data.error);
      setCheckout(data);
      setFulfillment(data.fulfillmentType ?? 'DELIVERY');
      setName(data.customer?.name ?? '');
      setPhone(data.customer?.phone ?? '');
      if (data.status === 'READY') setStep('REVIEW');
    } catch {
      setError('Não foi possível iniciar o checkout.');
    } finally {
      setBusy(false);
    }
  }
  async function mutate(action: Record<string, unknown>) {
    if (!checkout) return null;
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/public/checkout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartToken,
          expectedRevision: checkout.revision,
          idempotencyKey: crypto.randomUUID(),
          action,
        }),
      });
      const data = (await r.json()) as Checkout & {
        error?: string;
        outcome?: string;
        checkout?: Checkout;
      };
      if (!r.ok) throw new Error(data.error);
      if (data.outcome === 'PRICE_CHANGED') {
        setCheckout(data.checkout ?? null);
        setError(
          'O preço de um item foi atualizado. Revise seu pedido antes de continuar.',
        );
        return null;
      }
      setCheckout(data);
      return data;
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      setError(
        code.includes('AVAILABLE')
          ? 'Um item não está mais disponível. Volte ao carrinho para corrigir.'
          : code === 'CHECKOUT_REVISION_CONFLICT'
            ? 'O checkout mudou. Recarregue e tente novamente.'
            : 'Revise os dados obrigatórios.',
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function chooseFulfillment() {
    const next = await mutate({
      type: 'FULFILLMENT',
      fulfillmentType: fulfillment,
    });
    if (next) setStep('CUSTOMER');
  }
  async function saveCustomer() {
    const next = await mutate({ type: 'CUSTOMER', name, phone });
    if (next) setStep(fulfillment === 'DELIVERY' ? 'ADDRESS' : 'REVIEW');
  }
  async function saveAddress() {
    const next = await mutate({ type: 'ADDRESS', address });
    if (next) setStep('REVIEW');
  }
  async function confirmOrder() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartToken,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = (await r.json()) as PublicOrder & { error?: string };
      if (!r.ok) throw new Error(data.error);
      setOrder(data);
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'CHECKOUT_STALE'
          ? 'O carrinho mudou. Revise o checkout novamente.'
          : 'Não foi possível confirmar o pedido.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function refreshOrder() {
    const r = await fetch(`/api/public/orders?token=${cartToken}`);
    if (r.ok) setOrder((await r.json()) as PublicOrder);
  }
  if (order)
    return (
      <div
        className="sheet-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Pedido confirmado"
      >
        <section className="sheet">
          <button className="secondary" onClick={onClose}>
            Fechar
          </button>
          <h2>Pedido #{order.displayNumber}</h2>
          <p role="status">Pedido confirmado</p>
          <p>
            Status atual: <strong>{order.status}</strong>
          </p>
          {order.items.map((i) => (
            <article className="cart-item" key={i.id}>
              <strong>{i.productName ?? i.name}</strong>
              <span>
                {i.quantity} × {money(i.unitPrice)}
              </span>
            </article>
          ))}
          <h3>Total: {money(order.total)}</h3>
          <p>{order.fulfillmentType === 'DELIVERY' ? 'Entrega' : 'Retirada'}</p>
          <button className="secondary" onClick={() => void refreshOrder()}>
            Atualizar status
          </button>
        </section>
      </div>
    );
  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
    >
      <section className="sheet">
        <button className="secondary" onClick={onClose}>
          Fechar
        </button>
        <h2>
          {checkout?.status === 'READY' ? 'Checkout pronto' : 'Revisar pedido'}
        </h2>
        {!checkout ? (
          <>
            <p>Confirme seus dados de entrega ou retirada.</p>
            <button disabled={busy} onClick={() => void start()}>
              Iniciar checkout
            </button>
          </>
        ) : (
          <>
            {step === 'FULFILLMENT' && (
              <>
                <fieldset>
                  <legend>Entrega ou retirada</legend>
                  <label>
                    <input
                      type="radio"
                      checked={fulfillment === 'DELIVERY'}
                      onChange={() => setFulfillment('DELIVERY')}
                    />
                    Entrega
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={fulfillment === 'PICKUP'}
                      onChange={() => setFulfillment('PICKUP')}
                    />
                    Retirada
                  </label>
                </fieldset>
                <button onClick={() => void chooseFulfillment()}>
                  Continuar
                </button>
              </>
            )}
            {step === 'CUSTOMER' && (
              <>
                <label>
                  Nome
                  <input
                    aria-label="Nome"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  Telefone
                  <input
                    aria-label="Telefone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
                <button onClick={() => void saveCustomer()}>Continuar</button>
              </>
            )}
            {step === 'ADDRESS' && (
              <>
                <h3>Endereço</h3>
                {(
                  [
                    ['postalCode', 'CEP'],
                    ['street', 'Rua'],
                    ['number', 'Número'],
                    ['complement', 'Complemento'],
                    ['neighborhood', 'Bairro'],
                    ['city', 'Cidade'],
                    ['state', 'Estado'],
                    ['reference', 'Referência'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      aria-label={label}
                      value={address[key]}
                      onChange={(e) =>
                        setAddress((a) => ({ ...a, [key]: e.target.value }))
                      }
                    />
                  </label>
                ))}
                <button onClick={() => void saveAddress()}>Revisar</button>
              </>
            )}
            {step === 'REVIEW' && (
              <>
                <p>
                  <strong>
                    {fulfillment === 'DELIVERY' ? 'Entrega' : 'Retirada'}
                  </strong>{' '}
                  para {name}
                </p>
                {checkout.items.map((i) => (
                  <article className="cart-item" key={i.id}>
                    <strong>{i.productName}</strong>
                    <span>
                      {i.quantity} × {money(i.unitPrice)}
                    </span>
                    <small>{i.modifiers.map((m) => m.name).join(', ')}</small>
                  </article>
                ))}
                <p>
                  Subtotal: {money(checkout.subtotal)}
                  <br />
                  Taxa de entrega: {money(checkout.deliveryFee)}
                  <br />
                  <strong>Total: {money(checkout.total)}</strong>
                </p>
                {checkout.status === 'READY' ? (
                  <>
                    <p role="status">Pronto para confirmar o pedido.</p>
                    {checkout.cartRevisionValidated !==
                      checkout.cartRevision && (
                      <p role="alert">O carrinho mudou. Valide novamente.</p>
                    )}
                    <button disabled={busy} onClick={() => void confirmOrder()}>
                      Confirmar pedido
                    </button>
                  </>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() => void mutate({ type: 'VALIDATE' })}
                  >
                    Validar checkout
                  </button>
                )}
                <button className="secondary" onClick={onBackToCart}>
                  Voltar ao carrinho
                </button>
              </>
            )}
          </>
        )}
        <p role="alert">{error}</p>
      </section>
    </div>
  );
}
