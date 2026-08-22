import { NextResponse } from 'next/server';
import {
  publicCheckoutMutationSchema,
  publicCheckoutStartSchema,
  publicCheckoutTokenSchema,
} from '@delivery/schemas';
import { publicDatabase } from '../runtime';
const noStore = { headers: { 'Cache-Control': 'no-store' } };
const messageOf = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  'message' in value &&
  typeof value.message === 'string'
    ? value.message
    : 'CHECKOUT_NOT_FOUND';
const codes = [
  'CHECKOUT_NOT_FOUND',
  'CHECKOUT_NOT_ACTIVE',
  'CHECKOUT_EXPIRED',
  'CHECKOUT_REVISION_CONFLICT',
  'CART_NOT_ACTIVE',
  'CART_CHANGED',
  'PRICE_CHANGED',
  'PRODUCT_NOT_AVAILABLE',
  'VARIANT_NOT_AVAILABLE',
  'MODIFIER_NOT_AVAILABLE',
  'CUSTOMER_INFO_REQUIRED',
  'FULFILLMENT_REQUIRED',
  'ADDRESS_REQUIRED',
  'DELIVERY_NOT_AVAILABLE',
  'INVALID_ADDRESS',
];
const safeError = (value: unknown) => {
  const message = messageOf(value),
    code = codes.find((x) => message.includes(x)) ?? 'CHECKOUT_NOT_FOUND';
  return NextResponse.json(
    { error: code },
    {
      status:
        code === 'CHECKOUT_REVISION_CONFLICT'
          ? 409
          : code === 'CHECKOUT_NOT_FOUND'
            ? 404
            : 422,
      ...noStore,
    },
  );
};
async function rpc(name: string, args: Record<string, unknown>) {
  const result = await publicDatabase().rpc(name, args);
  const error: unknown = result.error;
  if (error) throw new Error(messageOf(error));
  return result.data as unknown;
}
export async function POST(request: Request) {
  try {
    const body = publicCheckoutStartSchema.parse(await request.json());
    return NextResponse.json(
      await rpc('start_public_checkout', {
        cart_token: body.cartToken,
        target_idempotency_key: body.idempotencyKey,
      }),
      noStore,
    );
  } catch (e) {
    return safeError(e);
  }
}
export async function GET(request: Request) {
  try {
    const body = publicCheckoutTokenSchema.parse({
      cartToken: new URL(request.url).searchParams.get('token'),
    });
    const data = await rpc('get_public_checkout', {
      cart_token: body.cartToken,
    });
    if (!data) throw new Error('CHECKOUT_NOT_FOUND');
    return NextResponse.json(data, noStore);
  } catch (e) {
    return safeError(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const body = publicCheckoutMutationSchema.parse(await request.json());
    return NextResponse.json(
      await rpc('mutate_public_checkout', {
        cart_token: body.cartToken,
        expected_revision: body.expectedRevision,
        target_idempotency_key: body.idempotencyKey,
        action: body.action,
      }),
      noStore,
    );
  } catch (e) {
    return safeError(e);
  }
}
