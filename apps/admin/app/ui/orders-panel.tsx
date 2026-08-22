'use client';

import {
  createOrderGateway,
  type BrowserDatabaseClient,
} from '@delivery/database';
import { adminOrdersSchema } from '@delivery/schemas';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Order = (typeof adminOrdersSchema)['_output'][number];

export function OrdersPanel({
  client,
  locationId,
}: {
  client: BrowserDatabaseClient;
  locationId: string;
}) {
  const gateway = useMemo(() => createOrderGateway(client), [client]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const response = await gateway.list(locationId);
    if (response.error) return setMessage(response.error.message);
    const parsed = adminOrdersSchema.safeParse(response.data);
    if (!parsed.success) return setMessage('Resposta de pedidos inválida.');
    setOrders(parsed.data);
  }, [gateway, locationId]);
  useEffect(() => void load(), [load]);

  async function startPreparing(order: Order) {
    const response = await gateway.updateStatus(
      order.id,
      order.revision,
      'PREPARING',
    );
    setMessage(response.error?.message ?? 'Pedido atualizado.');
    await load();
  }

  return (
    <article className="card" data-testid="orders-panel">
      <h2>Pedidos</h2>
      <button className="secondary" onClick={() => void load()}>
        Atualizar pedidos
      </button>
      <p>{message}</p>
      {orders.length === 0 ? (
        <p>Nenhum pedido.</p>
      ) : (
        orders.map((order) => (
          <section key={order.id}>
            <h3>Pedido #{order.displayNumber}</h3>
            <p>
              {order.status} · R$ {order.total} · {order.fulfillmentType}
            </p>
            <ul>
              {order.items.map((item) => (
                <li key={item.id}>
                  {item.quantity} × {item.name}
                </li>
              ))}
            </ul>
            {order.status === 'CONFIRMED' && (
              <button onClick={() => void startPreparing(order)}>
                Iniciar preparo
              </button>
            )}
          </section>
        ))
      )}
    </article>
  );
}
