import { NextResponse } from 'next/server';
import {
  publicCartCreateSchema,
  publicCartMutationSchema,
  publicCartTokenSchema,
} from '@delivery/schemas';
import { publicDatabase } from '../runtime';
const noStore = { headers: { 'Cache-Control': 'no-store' } };
const messageOf = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  'message' in value &&
  typeof value.message === 'string'
    ? value.message
    : 'DATABASE_ERROR';
const error = (value: unknown) => {
  const m = value instanceof Error ? value.message : String(value);
  const code =
    [
      'CART_NOT_ACTIVE',
      'CART_EXPIRED',
      'CART_REVISION_CONFLICT',
      'PRODUCT_NOT_AVAILABLE',
      'INVALID_VARIANT',
      'INVALID_MODIFIER_OPTION',
      'MODIFIER_MIN_NOT_MET',
      'MODIFIER_MAX_EXCEEDED',
      'INVALID_QUANTITY',
      'CROSS_LOCATION_REFERENCE',
      'NEGATIVE_ITEM_TOTAL',
    ].find((x) => m.includes(x)) ?? 'CART_NOT_FOUND';
  return NextResponse.json(
    { error: code },
    {
      status:
        code === 'CART_REVISION_CONFLICT'
          ? 409
          : code === 'CART_NOT_FOUND'
            ? 404
            : 422,
      ...noStore,
    },
  );
};
export async function POST(request: Request) {
  try {
    const body = publicCartCreateSchema.parse(await request.json());
    const result = await publicDatabase().rpc('create_public_cart', {
      location_slug: body.locationSlug,
    });
    const data: unknown = result.data as unknown;
    const e: unknown = result.error;
    if (e) throw new Error(messageOf(e));
    if (!data) throw new Error('CART_NOT_FOUND');
    return NextResponse.json(data, noStore);
  } catch (e) {
    return error(e);
  }
}
export async function GET(request: Request) {
  try {
    const body = publicCartTokenSchema.parse({
      publicToken: new URL(request.url).searchParams.get('token'),
    });
    const result = await publicDatabase().rpc('get_public_cart', {
      public_token: body.publicToken,
    });
    const data: unknown = result.data as unknown;
    const e: unknown = result.error;
    if (e) throw new Error(messageOf(e));
    if (!data) throw new Error('CART_NOT_FOUND');
    return NextResponse.json(data, noStore);
  } catch (e) {
    return error(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const body = publicCartMutationSchema.parse(await request.json());
    const result = await publicDatabase().rpc('mutate_public_cart', {
      public_token: body.publicToken,
      expected_revision: body.expectedRevision,
      target_idempotency_key: body.idempotencyKey,
      action: body.action,
    });
    const data: unknown = result.data as unknown;
    const e: unknown = result.error;
    if (e) throw new Error(messageOf(e));
    return NextResponse.json(data, noStore);
  } catch (e) {
    return error(e);
  }
}
