'use client';

import {
  createBrowserDatabaseClient,
  createKitchenGateway,
} from '@delivery/database';
import {
  kitchenOrdersSchema,
  locationRowsSchema,
  organizationRowsSchema,
  signInSchema,
  type KitchenOrder,
  type LocationRow,
  type OrganizationRow,
} from '@delivery/schemas';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  elapsedMinutes,
  groupKitchenOrders,
  isOperationallyLate,
  kitchenColumns,
} from '../kitchen-board';

const lateThresholdMinutes = 20;

export function KitchenApp() {
  const client = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createBrowserDatabaseClient(url, key) : null;
  }, []);
  const gateway = useMemo(
    () => (client ? createKitchenGateway(client) : null),
    [client],
  );
  const [authenticated, setAuthenticated] = useState(false);
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationId, setLocationId] = useState('');
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [connected, setConnected] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(false);
  const knownOrderIds = useRef(new Set<string>());

  useEffect(() => {
    setSound(localStorage.getItem('kitchen-sound') === 'on');
  }, []);

  const notifyNewOrder = useCallback(() => {
    if (!sound) return;
    const Audio = window.AudioContext;
    const context = new Audio();
    const oscillator = context.createOscillator();
    oscillator.connect(context.destination);
    oscillator.frequency.value = 660;
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.addEventListener('ended', () => void context.close());
  }, [sound]);

  const loadOrders = useCallback(async () => {
    if (!gateway || !locationId || !navigator.onLine) return;
    setLoading((current) => orders.length === 0 || current);
    const response = await gateway.list(locationId);
    if (response.error) {
      setMessage('Não foi possível atualizar os pedidos.');
      setLoading(false);
      return;
    }
    const parsed = kitchenOrdersSchema.safeParse(response.data);
    if (!parsed.success) {
      setMessage('Não foi possível atualizar os pedidos.');
      setLoading(false);
      return;
    }
    const newConfirmed = parsed.data.some(
      (order) =>
        order.status === 'CONFIRMED' && !knownOrderIds.current.has(order.id),
    );
    if (knownOrderIds.current.size > 0 && newConfirmed) {
      setMessage('Novo pedido recebido.');
      notifyNewOrder();
    } else setMessage('');
    knownOrderIds.current = new Set(parsed.data.map((order) => order.id));
    setOrders(parsed.data);
    setSelectedOrder((selected) =>
      selected
        ? (parsed.data.find((order) => order.id === selected.id) ?? null)
        : null,
    );
    setLoading(false);
  }, [gateway, locationId, notifyNewOrder, orders.length]);

  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
    });
    const { data } = client.auth.onAuthStateChange((_event, session) =>
      setAuthenticated(Boolean(session)),
    );
    return () => data.subscription.unsubscribe();
  }, [client]);

  useEffect(() => {
    if (!client || !authenticated) return;
    void client.rpc('list_my_organizations').then(({ data, error }) => {
      if (error) return setMessage('Você não possui acesso ao Kitchen.');
      const parsed = organizationRowsSchema.safeParse(data);
      if (!parsed.success)
        return setMessage('Não foi possível carregar o acesso.');
      setOrganizations(parsed.data);
      setOrganizationId(parsed.data[0]?.id ?? '');
    });
  }, [authenticated, client]);

  useEffect(() => {
    setLocationId('');
    setOrders([]);
    knownOrderIds.current.clear();
    if (!client || !organizationId) return;
    void client
      .rpc('list_my_locations', { target_organization_id: organizationId })
      .then(({ data, error }) => {
        if (error) return setMessage('Você não possui acesso ao Kitchen.');
        const parsed = locationRowsSchema.safeParse(data);
        if (parsed.success) setLocations(parsed.data);
      });
  }, [client, organizationId]);

  useEffect(() => {
    if (!gateway || !locationId) return;
    setOrders([]);
    knownOrderIds.current.clear();
    void loadOrders();
    const channel = gateway.subscribe(locationId, () => void loadOrders());
    const interval = window.setInterval(() => void loadOrders(), 60_000);
    const recover = () => {
      setConnected(navigator.onLine);
      if (navigator.onLine) void loadOrders();
    };
    window.addEventListener('focus', recover);
    window.addEventListener('online', recover);
    window.addEventListener('offline', recover);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', recover);
      window.removeEventListener('online', recover);
      window.removeEventListener('offline', recover);
      void gateway.unsubscribe(channel);
    };
  }, [gateway, loadOrders, locationId]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) return setMessage('Informe e-mail e senha válidos.');
    const response = await client.auth.signInWithPassword(parsed.data);
    if (response.error) setMessage('Não foi possível entrar.');
  }

  async function transition(order: KitchenOrder) {
    if (!gateway || !connected) return;
    const target = order.status === 'CONFIRMED' ? 'PREPARING' : 'READY';
    const response = await gateway.updateStatus(
      order.id,
      order.revision,
      target,
    );
    if (response.error) {
      if (response.error.message.includes('ORDER_REVISION_CONFLICT')) {
        setMessage('Este pedido foi atualizado em outro dispositivo.');
        await loadOrders();
      } else {
        setMessage(
          `Não foi possível atualizar o Pedido #${order.displayNumber}.`,
        );
      }
      return;
    }
    await loadOrders();
  }

  if (!authenticated)
    return (
      <main className="kitchen-login">
        <form className="login-card" onSubmit={(event) => void signIn(event)}>
          <p className="eyebrow">Operação</p>
          <h1>Kitchen</h1>
          <label>
            E-mail
            <input name="email" type="email" required />
          </label>
          <label>
            Senha
            <input name="password" type="password" required />
          </label>
          <button>Entrar</button>
          <p role="alert">{message}</p>
        </form>
      </main>
    );

  const grouped = groupKitchenOrders(orders);
  const location = locations.find((item) => item.id === locationId);
  return (
    <main className="kitchen-shell">
      <header className="kitchen-header">
        <div>
          <p className="eyebrow">Painel operacional</p>
          <h1>Kitchen</h1>
        </div>
        <label className="location-picker">
          Organização
          <select
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
          >
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="location-picker">
          Unidade
          <select
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">Selecione</option>
            {locations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <span className={`connection ${connected ? '' : 'offline'}`}>
          {connected ? '● Conectado' : '● Sem conexão'}
        </span>
        <button
          className="refresh"
          disabled={!locationId || !connected}
          onClick={() => void loadOrders()}
        >
          Atualizar
        </button>
        <label className="sound-toggle">
          <input
            type="checkbox"
            checked={sound}
            onChange={(event) => {
              setSound(event.target.checked);
              localStorage.setItem(
                'kitchen-sound',
                event.target.checked ? 'on' : 'off',
              );
            }}
          />{' '}
          Som para novos pedidos
        </label>
      </header>

      {!connected && (
        <aside className="notice" role="alert">
          Sem conexão. Os pedidos podem estar desatualizados.{' '}
          <button onClick={() => void loadOrders()}>Tentar novamente</button>
        </aside>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {!locationId ? (
        <section className="welcome">
          <h2>Selecione uma unidade</h2>
          <p>Escolha a operação autorizada para abrir o board.</p>
        </section>
      ) : loading ? (
        <section className="board" aria-label="Carregando pedidos">
          {kitchenColumns.map((column) => (
            <div className="column" key={column.status}>
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          ))}
        </section>
      ) : (
        <section
          aria-label={`Pedidos de ${location?.name ?? 'unidade'}`}
          className="board"
        >
          {kitchenColumns.map((column) => (
            <section
              className={`column column-${column.status.toLowerCase()}`}
              key={column.status}
            >
              <header>
                <h2>{column.label}</h2>
                <span>{grouped[column.status].length} pedidos</span>
              </header>
              {grouped[column.status].length === 0 ? (
                <div className="empty">
                  <strong>Por enquanto, tudo tranquilo.</strong>
                  <span>Os novos pedidos aparecerão aqui automaticamente.</span>
                </div>
              ) : (
                grouped[column.status].map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    now={now}
                    connected={connected}
                    onOpen={setSelectedOrder}
                    onTransition={(value) => void transition(value)}
                  />
                ))
              )}
            </section>
          ))}
        </section>
      )}
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          now={now}
          connected={connected}
          onClose={() => setSelectedOrder(null)}
          onTransition={(value) => void transition(value)}
        />
      )}
    </main>
  );
}

function OrderCard({
  order,
  now,
  connected,
  onOpen,
  onTransition,
}: {
  order: KitchenOrder;
  now: number;
  connected: boolean;
  onOpen: (order: KitchenOrder) => void;
  onTransition: (order: KitchenOrder) => void;
}) {
  const minutes = elapsedMinutes(order.confirmedAt, now);
  return (
    <article
      className="order-card"
      tabIndex={0}
      onClick={() => onOpen(order)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(order);
      }}
    >
      <header>
        <h3>Pedido #{order.displayNumber}</h3>
        <span
          className={
            isOperationallyLate(minutes, lateThresholdMinutes) ? 'late' : ''
          }
        >
          {isOperationallyLate(minutes, lateThresholdMinutes) ? '⚠ ' : ''}
          {minutes} min
        </span>
      </header>
      <p className="fulfillment">
        {order.fulfillmentType === 'DELIVERY' ? 'Entrega' : 'Retirada'}
        {order.scheduledFor ? ' · Agendado' : ''}
      </p>
      <OrderItems order={order} />
      {order.status !== 'READY' && (
        <button
          disabled={!connected}
          onClick={(event) => {
            event.stopPropagation();
            onTransition(order);
          }}
        >
          {order.status === 'CONFIRMED'
            ? 'Iniciar preparo'
            : 'Marcar como pronto'}
        </button>
      )}
    </article>
  );
}

function OrderItems({ order }: { order: KitchenOrder }) {
  return (
    <ul className="items">
      {order.items.map((item, index) => (
        <li key={`${item.name}-${index}`}>
          <strong>{item.quantity}×</strong>{' '}
          <span>
            {item.name}
            {item.variant ? ` · ${item.variant}` : ''}
          </span>
          {item.modifiers.length > 0 && (
            <ul>
              {item.modifiers.map((modifier, modifierIndex) => (
                <li key={`${modifier.name}-${modifierIndex}`}>
                  • {modifier.name}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function OrderDetail({
  order,
  now,
  connected,
  onClose,
  onTransition,
}: {
  order: KitchenOrder;
  now: number;
  connected: boolean;
  onClose: () => void;
  onTransition: (order: KitchenOrder) => void;
}) {
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Pedido ${order.displayNumber}`}
    >
      <section className="detail">
        <button className="close" onClick={onClose}>
          Fechar
        </button>
        <p className="eyebrow">Detalhe da produção</p>
        <h2>Pedido #{order.displayNumber}</h2>
        <p>
          {elapsedMinutes(order.confirmedAt, now)} min ·{' '}
          {order.fulfillmentType === 'DELIVERY' ? 'Entrega' : 'Retirada'}
        </p>
        <OrderItems order={order} />
        {order.status !== 'READY' && (
          <button disabled={!connected} onClick={() => onTransition(order)}>
            {order.status === 'CONFIRMED'
              ? 'Iniciar preparo'
              : 'Marcar como pronto'}
          </button>
        )}
      </section>
    </div>
  );
}
