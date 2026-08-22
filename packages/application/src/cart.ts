import {
  nextCartRevision,
  priceProductConfiguration,
  type Money,
  type ProductConfiguration,
  type PricingGroup,
  type PricingModifier,
  type PricingVariant,
} from '@delivery/domain';
export type CartMutationInput = Omit<
  ProductConfiguration,
  'basePrice' | 'available'
> & { expectedRevision: number; idempotencyKey: string; itemId?: string };
export interface CartCommandPort {
  loadPricing(productId: string): Promise<{
    basePrice: Money;
    available: boolean;
    variants: PricingVariant[];
    groups: PricingGroup[];
    modifiers: PricingModifier[];
  }>;
  mutate(
    input: CartMutationInput & {
      unitPrice: Money;
      total: Money;
      nextRevision: number;
    },
  ): Promise<unknown>;
  currentRevision(): Promise<number>;
}
export async function configureCartItem(
  port: CartCommandPort,
  input: CartMutationInput,
) {
  const pricing = await port.loadPricing(input.productId);
  const calculated = priceProductConfiguration(
    { ...input, basePrice: pricing.basePrice, available: pricing.available },
    pricing,
  );
  const nextRevision = nextCartRevision(
    await port.currentRevision(),
    input.expectedRevision,
  );
  return port.mutate({ ...input, ...calculated, nextRevision });
}
