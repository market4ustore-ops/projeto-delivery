import { describe, expect, it, vi } from 'vitest';
import {
  createLocation,
  ForbiddenError,
  type ActorContext,
  type LocationRepository,
} from './index.js';
import type {
  Location,
  LocationId,
  OrganizationId,
  UserId,
} from '@delivery/domain';

const actor: ActorContext = {
  userId: '00000000-0000-0000-0000-000000000001' as UserId,
  organizationId: '10000000-0000-0000-0000-000000000001' as OrganizationId,
  role: 'OWNER',
};
const location: Location = {
  id: '20000000-0000-0000-0000-000000000001' as LocationId,
  organizationId: actor.organizationId!,
  name: 'Centro',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('createLocation', () => {
  it('uses organization from trusted actor context', async () => {
    const create = vi.fn().mockResolvedValue(location);
    const repo: LocationRepository = { create, listForUser: vi.fn() };
    await createLocation(repo, actor, ' Centro ');
    expect(create).toHaveBeenCalledWith({
      organizationId: actor.organizationId,
      name: 'Centro',
      actorId: actor.userId,
    });
  });
  it('rejects a role without location.update', async () => {
    const repo: LocationRepository = { create: vi.fn(), listForUser: vi.fn() };
    await expect(
      createLocation(repo, { ...actor, role: 'KITCHEN' }, 'Centro'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
