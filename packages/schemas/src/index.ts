import { z } from 'zod';

const name = z.string().trim().min(2).max(120);
export const createOrganizationSchema = z.object({ name });
export const createLocationSchema = z.object({
  organizationId: z.string().uuid(),
  name,
});
export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export const organizationRowsSchema = z.array(
  z.object({
    id: z.string().uuid(),
    name,
    role: z.enum(['OWNER', 'CASHIER', 'KITCHEN']),
  }),
);
export const locationRowsSchema = z.array(
  z.object({ id: z.string().uuid(), organization_id: z.string().uuid(), name }),
);
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type OrganizationRow = z.infer<typeof organizationRowsSchema>[number];
export type LocationRow = z.infer<typeof locationRowsSchema>[number];

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);
export const categoryInputSchema = z.object({
  locationId: z.string().uuid(),
  name,
  slug,
  description: z.string().trim().max(2000).nullable().default(null),
});
export const productInputSchema = z.object({
  locationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name,
  slug,
  description: z.string().trim().max(4000).nullable().default(null),
  imageReference: z.string().trim().max(500).nullable().default(null),
  basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
});
export const variantInputSchema = z.object({
  productId: z.string().uuid(),
  name,
  price: z.string().regex(/^\d+(\.\d{1,2})?$/),
  isDefault: z.boolean().default(false),
});
export const modifierGroupInputSchema = z
  .object({
    productId: z.string().uuid(),
    name,
    minSelections: z.number().int().min(0),
    maxSelections: z.number().int().min(0),
    isRequired: z.boolean(),
  })
  .refine((v) => v.maxSelections >= v.minSelections)
  .refine((v) => v.isRequired === v.minSelections > 0);
export const modifierOptionInputSchema = z.object({
  modifierGroupId: z.string().uuid(),
  name,
  priceDelta: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
});

const uuid = z.string().uuid();
export const flowNodeConfigSchema = z.union([
  z.object({ type: z.literal('START') }).strict(),
  z.object({ type: z.literal('CART') }).strict(),
  z.object({ type: z.literal('DELIVERY') }).strict(),
  z.object({ type: z.literal('CHECKOUT') }).strict(),
  z.object({
    type: z.literal('TEXT'),
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().max(4000).optional(),
  }),
  z
    .object({
      type: z.literal('CHOICE'),
      title: z.string().trim().min(1).max(200),
      options: z
        .array(
          z.object({
            key: z.string().trim().min(1).max(80),
            label: z.string().trim().min(1).max(200),
          }),
        )
        .min(1),
    })
    .refine(
      (v) => new Set(v.options.map((o) => o.key)).size === v.options.length,
    ),
  z.object({ type: z.literal('CATEGORY'), categoryIds: z.array(uuid).min(1) }),
  z
    .object({
      type: z.literal('PRODUCT_LIST'),
      categoryId: uuid.optional(),
      productIds: z.array(uuid).min(1).optional(),
    })
    .refine((v) => Boolean(v.categoryId || v.productIds?.length)),
  z.object({ type: z.literal('PRODUCT'), productId: uuid }),
  z.object({ type: z.literal('UPSELL'), productIds: z.array(uuid).min(1) }),
  z.object({
    type: z.literal('END'),
    title: z.string().trim().min(1).max(200).optional(),
  }),
]);
export const flowConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ALWAYS') }),
  z.object({
    type: z.literal('CHOICE_EQUALS'),
    choiceKey: z.string().trim().min(1).max(80),
  }),
]);
export const createFlowSchema = z.object({ locationId: uuid, name, slug });
export const flowNodeInputSchema = z.object({
  flowVersionId: uuid,
  name: z.string().trim().min(1).max(120).optional(),
  config: flowNodeConfigSchema,
  position: z
    .object({ x: z.number().finite(), y: z.number().finite() })
    .optional(),
});
export const flowEdgeInputSchema = z.object({
  flowVersionId: uuid,
  sourceNodeId: uuid,
  targetNodeId: uuid,
  condition: flowConditionSchema,
  sortOrder: z.number().int().min(0).default(0),
});
export const startFlowSessionSchema = z.object({
  locationId: uuid,
  flowSlug: slug,
});
export const advanceFlowSessionSchema = z.object({
  locationId: uuid,
  publicToken: z.string().regex(/^[a-f0-9]{64}$/),
  expectedRevision: z.number().int().min(0),
  idempotencyKey: z.string().min(8).max(200),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('CONTINUE') }),
    z.object({
      type: z.literal('SELECT_CHOICE'),
      choiceKey: z.string().trim().min(1).max(80),
    }),
  ]),
});
export const publicFlowStartSchema = z.object({
  locationSlug: slug,
  flowSlug: slug,
});
export const publicFlowAdvanceSchema = z.object({
  publicToken: z.string().regex(/^[a-f0-9]{64}$/),
  expectedRevision: z.number().int().min(0),
  idempotencyKey: z.string().uuid(),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('CONTINUE') }),
    z.object({
      type: z.literal('SELECT_CHOICE'),
      choiceKey: z.string().trim().min(1).max(80),
    }),
  ]),
});
export const publicFlowDefinitionSchema = z.object({
  flowId: uuid,
  versionId: uuid,
  locationId: uuid,
  schemaVersion: z.number().int().positive(),
  nodes: z.array(
    z.object({
      id: uuid,
      flowVersionId: uuid,
      type: z.enum([
        'START',
        'TEXT',
        'CHOICE',
        'CATEGORY',
        'PRODUCT_LIST',
        'PRODUCT',
        'UPSELL',
        'CART',
        'DELIVERY',
        'CHECKOUT',
        'END',
      ]),
      name: z.string().nullable().optional(),
      config: flowNodeConfigSchema,
    }),
  ),
  edges: z.array(
    z.object({
      id: uuid,
      flowVersionId: uuid,
      sourceNodeId: uuid,
      targetNodeId: uuid,
      condition: flowConditionSchema,
      sortOrder: z.number().int(),
    }),
  ),
  catalog: z.object({
    categories: z.array(z.object({ id: uuid, name: z.string() })),
    products: z.array(
      z.object({
        id: uuid,
        name: z.string(),
        price: z.string(),
        categoryId: uuid,
        available: z.boolean(),
        description: z.string().nullable().optional(),
        imageReference: z.string().nullable().optional(),
      }),
    ),
  }),
});

export const publicCartCreateSchema = z.object({ locationSlug: slug });
export const publicCartTokenSchema = z.object({
  publicToken: z.string().regex(/^[a-f0-9]{64}$/),
});
export const publicCartMutationSchema = z.object({
  publicToken: z.string().regex(/^[a-f0-9]{64}$/),
  expectedRevision: z.number().int().min(0),
  idempotencyKey: z.string().uuid(),
  action: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('ADD'),
      productId: uuid,
      variantId: uuid.nullable().optional(),
      modifierOptionIds: z.array(uuid).max(50),
      quantity: z.number().int().min(1).max(99),
    }),
    z.object({
      type: z.literal('UPDATE'),
      itemId: uuid,
      productId: uuid,
      variantId: uuid.nullable().optional(),
      modifierOptionIds: z.array(uuid).max(50),
      quantity: z.number().int().min(1).max(99),
    }),
    z.object({ type: z.literal('REMOVE'), itemId: uuid }),
  ]),
});
