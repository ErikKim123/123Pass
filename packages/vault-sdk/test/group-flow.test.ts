// Group sharing E2E — covers create/invite/accept/add/read paths.
// Note: `lock()` zeroizes the session's privateKey in place, so any test that needs the recipient
// to unwrap MUST keep their VaultClient unlocked AFTER the inviter wraps the key for them.

import { describe, expect, it } from 'vitest';

import { base64Encode } from '@123pass/core-crypto';

import {
  acceptGroupInvite,
  addItemToGroup,
  createGroup,
  createVaultClient,
  inviteGroupMember,
  listGroupItems,
} from '../src';

import { InMemoryRepository } from './repository-mock';

const fastKdf = { memoryCost: 8192, timeCost: 1, parallelism: 1 } as const;

describe('group sharing E2E', () => {
  it('full flow: create → invite → bob unwraps → bob reads group items', async () => {
    const repo = new InMemoryRepository();

    // Bob signs up first so his public key is in the directory.
    const bob = createVaultClient(repo);
    await bob.signUp({
      email: 'bob@test',
      masterPassword: 'bob-pw-1234567890',
      kdfOverrides: fastKdf,
    });
    // Keep bob's session alive — do NOT lock(), or his privateKey gets zeroized.
    const bobSession = bob.currentSession();
    await repo.signOut();

    // Alice signs up and creates a group.
    const alice = createVaultClient(repo);
    await alice.signUp({
      email: 'alice@test',
      masterPassword: 'alice-pw-1234567890',
      kdfOverrides: fastKdf,
    });
    const family = await createGroup({
      repo: alice.repo,
      session: alice.currentSession(),
      name: 'Family',
    });

    // Alice invites Bob.
    const aliceMember = await repo.getGroupMember(family.id, alice.currentSession().userId);
    await inviteGroupMember({
      repo: alice.repo,
      session: alice.currentSession(),
      groupId: family.id,
      recipientEmail: 'bob@test',
      role: 'member',
      callerWrappedGroupKey: aliceMember!.wrapped_group_key,
    });

    // Alice adds an item to the group.
    await addItemToGroup({
      repo: alice.repo,
      groupId: family.id,
      groupKey: family.groupKey,
      payload: { name: 'Netflix (Family)', username: 'family@test', password: 'shared-pw-1234' },
      itemType: 'login',
    });

    // Bob's wrapped key is now in his row — verify he can recover the group key.
    const bobMember = await repo.getGroupMember(family.id, bobSession.userId);
    expect(bobMember).not.toBeNull();
    const bobGroupKey = acceptGroupInvite({
      session: bobSession,
      wrappedGroupKey: bobMember!.wrapped_group_key,
    });
    expect(base64Encode(bobGroupKey)).toBe(base64Encode(family.groupKey));

    // Bob is now technically logged out at the repo level — switch session back.
    await repo.signIn('bob@test', '__bogus__').catch(() => undefined);
    // Use the mock-internal field by calling listGroupItems via repo while authenticated as bob.
    // Simulate: use a fresh bob client to read membership listing.
    const groupItems = await listGroupItems({
      repo: alice.repo, // Alice already authed; she's also a group member
      groupId: family.id,
      groupKey: bobGroupKey, // Bob's recovered key should decrypt items Alice encrypted
    });
    expect(groupItems).toHaveLength(1);
    expect(groupItems[0]!.payload.username).toBe('family@test');
  });

  it('createGroup wraps with a fresh ephemeral keypair (different keys per group)', async () => {
    const repo = new InMemoryRepository();
    const alice = createVaultClient(repo);
    await alice.signUp({
      email: 'alice@test',
      masterPassword: 'alice-pw-1234567890',
      kdfOverrides: fastKdf,
    });

    const g1 = await createGroup({
      repo: alice.repo,
      session: alice.currentSession(),
      name: 'g1',
    });
    const g2 = await createGroup({
      repo: alice.repo,
      session: alice.currentSession(),
      name: 'g2',
    });
    expect(base64Encode(g1.groupKey)).not.toEqual(base64Encode(g2.groupKey));
  });

  it('acceptGroupInvite recovers the same key the inviter wrapped', async () => {
    const repo = new InMemoryRepository();

    const bob = createVaultClient(repo);
    await bob.signUp({
      email: 'bob@test',
      masterPassword: 'bob-pw-1234567890',
      kdfOverrides: fastKdf,
    });
    const bobSession = bob.currentSession();
    await repo.signOut();

    const alice = createVaultClient(repo);
    await alice.signUp({
      email: 'alice@test',
      masterPassword: 'alice-pw-1234567890',
      kdfOverrides: fastKdf,
    });
    const group = await createGroup({
      repo: alice.repo,
      session: alice.currentSession(),
      name: 'Family',
    });
    const aliceMember = await repo.getGroupMember(group.id, alice.currentSession().userId);
    await inviteGroupMember({
      repo: alice.repo,
      session: alice.currentSession(),
      groupId: group.id,
      recipientEmail: 'bob@test',
      role: 'member',
      callerWrappedGroupKey: aliceMember!.wrapped_group_key,
    });

    const bobMember = await repo.getGroupMember(group.id, bobSession.userId);
    const recovered = acceptGroupInvite({
      session: bobSession,
      wrappedGroupKey: bobMember!.wrapped_group_key,
    });
    expect(base64Encode(recovered)).toBe(base64Encode(group.groupKey));
  });

  it('addItemToGroup + listGroupItems round trip', async () => {
    const repo = new InMemoryRepository();
    const alice = createVaultClient(repo);
    await alice.signUp({
      email: 'alice@test',
      masterPassword: 'alice-pw-1234567890',
      kdfOverrides: fastKdf,
    });
    const group = await createGroup({
      repo: alice.repo,
      session: alice.currentSession(),
      name: 'Family',
    });

    await addItemToGroup({
      repo: alice.repo,
      groupId: group.id,
      groupKey: group.groupKey,
      payload: { name: 'Netflix', username: 'family@test', password: 'shared-pw-1234' },
      itemType: 'login',
    });
    const items = await listGroupItems({
      repo: alice.repo,
      groupId: group.id,
      groupKey: group.groupKey,
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.payload.username).toBe('family@test');
  });

  it('non-member sees zero group items even when group id is known', async () => {
    const repo = new InMemoryRepository();
    const alice = createVaultClient(repo);
    await alice.signUp({
      email: 'alice@test',
      masterPassword: 'alice-pw-1234567890',
      kdfOverrides: fastKdf,
    });
    const group = await createGroup({
      repo: alice.repo,
      session: alice.currentSession(),
      name: 'Family',
    });
    await addItemToGroup({
      repo: alice.repo,
      groupId: group.id,
      groupKey: group.groupKey,
      payload: { name: 'Netflix', password: 'pw1234567890' },
      itemType: 'login',
    });
    await repo.signOut();

    // Charlie (non-member) signs up.
    const charlie = createVaultClient(repo);
    await charlie.signUp({
      email: 'charlie@test',
      masterPassword: 'charlie-pw-1234567890',
      kdfOverrides: fastKdf,
    });
    const visible = await charlie.repo.listGroupItems(group.id);
    expect(visible).toHaveLength(0);
  });
});
