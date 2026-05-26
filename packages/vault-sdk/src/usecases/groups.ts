// Group lifecycle UseCases.
// Group master key is a 32-byte random secret. It is wrapped under each member's public key
// via ECDH ephemeral. Server only sees `wrapped_group_key` blobs.

import {
  decrypt,
  deriveSharedKey,
  encrypt,
  generateKeyPair,
  getRandomBytes,
  publicKeyFromBase64,
  publicKeyToBase64,
} from '@123pass/core-crypto';
import { HKDF_INFO_WRAP } from '@123pass/shared';

import { VaultError } from '../domain/errors';

import type { UnlockedSession } from './unlock-vault';
import type { VaultRepository, WrappedKey } from '../domain/repository';


export interface GroupSummary {
  id: string;
  name: string;
  ownerId: string;
  role: 'owner' | 'admin' | 'member';
  /** Group master key already unwrapped under the caller's session. */
  groupKey: Uint8Array;
}

function wrapKeyForMember(
  groupKey: Uint8Array,
  memberPublicKey: Uint8Array,
): WrappedKey {
  const ephemeral = generateKeyPair();
  const sharedKey = deriveSharedKey({
    privateKey: ephemeral.privateKey,
    peerPublicKey: memberPublicKey,
    info: HKDF_INFO_WRAP,
  });
  const wrapped = encrypt(sharedKey, groupKey);
  return {
    ciphertext: wrapped.ciphertext,
    iv: wrapped.iv,
    authTag: wrapped.authTag,
    ephemeralPublicKey: publicKeyToBase64(ephemeral.publicKey),
  };
}

function unwrapKeyForMember(
  wrapped: WrappedKey,
  recipientPrivateKey: Uint8Array,
): Uint8Array {
  const sharedKey = deriveSharedKey({
    privateKey: recipientPrivateKey,
    peerPublicKey: publicKeyFromBase64(wrapped.ephemeralPublicKey),
    info: HKDF_INFO_WRAP,
  });
  return decrypt(sharedKey, {
    ciphertext: wrapped.ciphertext,
    iv: wrapped.iv,
    authTag: wrapped.authTag,
  });
}

export interface CreateGroupArgs {
  repo: VaultRepository;
  session: UnlockedSession;
  name: string;
}

export async function createGroup(args: CreateGroupArgs): Promise<GroupSummary> {
  const groupKey = getRandomBytes(32);
  const wrappedForOwner = wrapKeyForMember(groupKey, args.session.publicKey);
  const { group, member } = await args.repo.createGroup({
    name: args.name,
    ownerWrappedGroupKey: wrappedForOwner,
  });
  return {
    id: group.id,
    name: group.name,
    ownerId: group.owner_id,
    role: member.role,
    groupKey,
  };
}

export interface InviteGroupMemberArgs {
  repo: VaultRepository;
  session: UnlockedSession;
  groupId: string;
  recipientEmail: string;
  role: 'admin' | 'member';
  /** Caller MUST be a group member; their wrapped key is unwrapped to obtain the group key. */
  callerWrappedGroupKey: WrappedKey;
}

export async function inviteGroupMember(args: InviteGroupMemberArgs): Promise<void> {
  const recipient = await args.repo.getUserDirectoryEntry(args.recipientEmail);
  if (!recipient) {
    throw new VaultError('SHARE_RECIPIENT_NOT_FOUND', `Recipient ${args.recipientEmail} not found`);
  }
  // Unwrap the caller's group key, then wrap it again for the new member.
  const groupKey = unwrapKeyForMember(args.callerWrappedGroupKey, args.session.privateKey);
  const wrappedForRecipient = wrapKeyForMember(
    groupKey,
    publicKeyFromBase64(recipient.publicKey),
  );
  await args.repo.inviteGroupMember({
    groupId: args.groupId,
    userId: recipient.id,
    role: args.role,
    wrappedGroupKey: wrappedForRecipient,
  });
}

export interface AcceptGroupInviteArgs {
  session: UnlockedSession;
  wrappedGroupKey: WrappedKey;
}

/** Recipient: unwraps the group key into memory. No server call — the row was already inserted by the inviter. */
export function acceptGroupInvite(args: AcceptGroupInviteArgs): Uint8Array {
  return unwrapKeyForMember(args.wrappedGroupKey, args.session.privateKey);
}

export interface ListMyGroupsArgs {
  repo: VaultRepository;
  session: UnlockedSession;
}

export async function listMyGroups(args: ListMyGroupsArgs): Promise<GroupSummary[]> {
  const rows = await args.repo.listGroups();
  const out: GroupSummary[] = [];
  for (const { group, member } of rows) {
    try {
      const groupKey = unwrapKeyForMember(
        member.wrapped_group_key as WrappedKey,
        args.session.privateKey,
      );
      out.push({
        id: group.id,
        name: group.name,
        ownerId: group.owner_id,
        role: member.role,
        groupKey,
      });
    } catch {
      // Skip groups whose key cannot be unwrapped (data corruption / removed member).
    }
  }
  return out;
}
