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
