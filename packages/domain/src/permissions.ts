export const permissions = [
  'organization.read',
  'organization.update',
  'location.read',
  'location.update',
  'members.read',
  'members.manage',
  'catalog.read',
  'catalog.write',
  'orders.read',
  'orders.update',
  'flow.read',
  'flow.write',
  'flow.publish',
  'inventory.read',
  'inventory.write',
  'analytics.read',
] as const;

export type Permission = (typeof permissions)[number];
export type Role = 'OWNER' | 'CASHIER' | 'KITCHEN';

const rolePermissions: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  OWNER: new Set(permissions),
  CASHIER: new Set([
    'organization.read',
    'location.read',
    'catalog.read',
    'catalog.write',
    'orders.read',
    'orders.update',
    'flow.read',
    'inventory.read',
  ]),
  KITCHEN: new Set([
    'organization.read',
    'location.read',
    'orders.read',
    'orders.update',
    'inventory.read',
  ]),
};

export const hasPermission = (role: Role, permission: Permission): boolean =>
  rolePermissions[role].has(permission);
export const permissionsFor = (role: Role): readonly Permission[] => [
  ...rolePermissions[role],
];
