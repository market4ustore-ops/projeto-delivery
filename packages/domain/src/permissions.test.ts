import { describe, expect, it } from 'vitest';
import { hasPermission, permissionsFor } from './permissions.js';

describe('permission policy', () => {
  it('grants every declared permission to OWNER', () =>
    expect(permissionsFor('OWNER')).toHaveLength(16));
  it('does not grant member management to KITCHEN', () =>
    expect(hasPermission('KITCHEN', 'members.manage')).toBe(false));
  it('grants operational order updates to KITCHEN', () =>
    expect(hasPermission('KITCHEN', 'orders.update')).toBe(true));
});
