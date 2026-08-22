import { NextResponse } from 'next/server';
import { publicCartTokenSchema } from '@delivery/schemas';
import { z } from 'zod';
import { publicDatabase } from '../../runtime';
const messageOf = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  'message' in value &&
  typeof value.message === 'string'
    ? value.message
    : 'DATABASE_ERROR';
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = publicCartTokenSchema.parse({
      publicToken: url.searchParams.get('token'),
    }).publicToken;
    const productId = z
      .string()
      .uuid()
      .parse(url.searchParams.get('productId'));
    const result = await publicDatabase().rpc(
      'get_public_product_configuration',
      { public_token: token, target_product_id: productId },
    );
    const data: unknown = result.data as unknown;
    const error: unknown = result.error;
    if (error) throw new Error(messageOf(error));
    if (!data) throw new Error();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      { error: 'PRODUCT_NOT_AVAILABLE' },
      { status: 404 },
    );
  }
}
