import { NextResponse } from 'next/server';
import {
  createOrderFromCheckoutSchema,
  publicOrderStatusSchema,
} from '@delivery/schemas';
import { publicDatabase } from '../runtime';
const noStore = { headers: { 'Cache-Control': 'no-store' } };
const message = (v: unknown) =>
  typeof v === 'object' &&
  v !== null &&
  'message' in v &&
  typeof v.message === 'string'
    ? v.message
    : 'ORDER_NOT_FOUND';
const safe = (e: unknown) => {
  const m = message(e),
    codes = ['ORDER_NOT_FOUND', 'CHECKOUT_NOT_READY', 'CHECKOUT_STALE'],
    code = codes.find((x) => m.includes(x)) ?? 'ORDER_NOT_FOUND';
  return NextResponse.json(
    { error: code },
    { status: code === 'ORDER_NOT_FOUND' ? 404 : 422, ...noStore },
  );
};
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await publicDatabase().rpc(name, args);
  if (r.error) throw new Error(r.error.message);
  return r.data as unknown;
}
export async function POST(request: Request) {
  try {
    const b = createOrderFromCheckoutSchema.parse(await request.json());
    return NextResponse.json(
      await rpc('create_order_from_checkout', {
        cart_token: b.cartToken,
        target_idempotency_key: b.idempotencyKey,
      }),
      noStore,
    );
  } catch (e) {
    return safe(e);
  }
}
export async function GET(request: Request) {
  try {
    const b = publicOrderStatusSchema.parse({
      cartToken: new URL(request.url).searchParams.get('token'),
    });
    const data = await rpc('get_public_order_status', {
      cart_token: b.cartToken,
    });
    if (!data) throw new Error('ORDER_NOT_FOUND');
    return NextResponse.json(data, noStore);
  } catch (e) {
    return safe(e);
  }
}
