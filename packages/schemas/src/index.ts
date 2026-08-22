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
