import {
  nextOrderRevision,
  transitionOrder,
  type OrderStatus,
} from '@delivery/domain';
import { authorize, type ActorContext } from './index.js';
export interface OrderCommandPort {
  createFromCheckout(input: {
    checkoutToken: string;
    idempotencyKey: string;
  }): Promise<unknown>;
  current(orderId: string): Promise<{
    status: OrderStatus;
    revision: number;
    fulfillment: 'DELIVERY' | 'PICKUP';
    locationId: string;
  } | null>;
  updateStatus(input: {
    orderId: string;
    status: OrderStatus;
    nextRevision: number;
    reason?: string;
    actorId: string;
  }): Promise<unknown>;
}
export const createOrderFromCheckout = (
  port: OrderCommandPort,
  input: { checkoutToken: string; idempotencyKey: string },
) => port.createFromCheckout(input);

export interface KitchenOrderQueryPort {
  listKitchen(locationId: string): Promise<unknown>;
}

export function listKitchenOrders(
  port: KitchenOrderQueryPort,
  actor: ActorContext,
  locationId: string,
) {
  authorize(actor, 'orders.read');
  if (actor.locationId !== locationId)
    throw new Error('CROSS_LOCATION_REFERENCE');
  return port.listKitchen(locationId);
}

export const startOrderPreparation = (
  port: OrderCommandPort,
  actor: ActorContext,
  input: { orderId: string; expectedRevision: number },
) => updateOrderStatus(port, actor, { ...input, status: 'PREPARING' });

export const markOrderReady = (
  port: OrderCommandPort,
  actor: ActorContext,
  input: { orderId: string; expectedRevision: number },
) => updateOrderStatus(port, actor, { ...input, status: 'READY' });
export async function updateOrderStatus(
  port: OrderCommandPort,
  actor: ActorContext,
  input: {
    orderId: string;
    status: OrderStatus;
    expectedRevision: number;
    reason?: string;
  },
) {
  authorize(actor, 'orders.update');
  const current = await port.current(input.orderId);
  if (!current) throw new Error('ORDER_NOT_FOUND');
  if (actor.locationId !== current.locationId)
    throw new Error('CROSS_LOCATION_REFERENCE');
  const status = transitionOrder(
      current.status,
      input.status,
      current.fulfillment,
    ),
    nextRevision = nextOrderRevision(current.revision, input.expectedRevision);
  return port.updateStatus({
    orderId: input.orderId,
    status,
    nextRevision,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    actorId: actor.userId,
  });
}
