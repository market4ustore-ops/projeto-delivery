export type OrganizationId = string & { readonly __brand: 'OrganizationId' };
export type LocationId = string & { readonly __brand: 'LocationId' };
export type UserId = string & { readonly __brand: 'UserId' };

export type Organization = Readonly<{
  id: OrganizationId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export type Location = Readonly<{
  id: LocationId;
  organizationId: OrganizationId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}>;

export const normalizeName = (value: string): string => {
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120)
    throw new Error('Name must contain between 2 and 120 characters');
  return name;
};
