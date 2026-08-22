import {
  nextCheckoutRevision,
  validateCheckoutDraft,
  type CheckoutDraft,
  type DeliveryFeeCalculator,
  type Money,
} from '@delivery/domain';
export type CheckoutCommand = {
  expectedRevision: number;
  idempotencyKey: string;
};
export interface CheckoutPort {
  current(): Promise<
    CheckoutDraft & { revision: number; locationId: string; subtotal: Money }
  >;
  save(
    input: CheckoutCommand & {
      nextRevision: number;
      deliveryFee: Money;
      total: Money;
    },
  ): Promise<unknown>;
}
export async function prepareCheckout(
  port: CheckoutPort,
  fees: DeliveryFeeCalculator,
  command: CheckoutCommand,
) {
  const current = await port.current();
  validateCheckoutDraft(current);
  const deliveryFee =
    current.fulfillmentType === 'DELIVERY' && current.address
      ? await fees.calculate({
          locationId: current.locationId,
          address: current.address,
        })
      : { minorUnits: 0n, currency: 'BRL' as const };
  const nextRevision = nextCheckoutRevision(
    current.revision,
    command.expectedRevision,
  );
  return port.save({
    ...command,
    nextRevision,
    deliveryFee,
    total: {
      minorUnits: current.subtotal.minorUnits + deliveryFee.minorUnits,
      currency: 'BRL',
    },
  });
}
