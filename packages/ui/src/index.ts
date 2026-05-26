// @123pass/ui — shared React components for web/extension apps.

export { useVaultStore, type VaultStore } from './stores/vault-store';
export { useFilteredItems, useAutoRefresh } from './hooks/use-vault';
export { useTotpTick, type TotpTick } from './hooks/use-totp-tick';

export { LockScreen, type LockScreenProps } from './lock/LockScreen';
export { VaultSidebar, type VaultSidebarProps, type SidebarFilter } from './sidebar/VaultSidebar';
export { VaultItemList, type VaultItemListProps } from './list/VaultItemList';
export { VaultItemDetail, type VaultItemDetailProps } from './detail/VaultItemDetail';
export {
  PasswordGenerator,
  generatePassword,
  type PasswordGeneratorProps,
} from './generator/PasswordGenerator';
export { TotpDisplay, type TotpDisplayProps } from './totp/TotpDisplay';
export {
  SecurityAudit,
  computeAudit,
  type SecurityAuditProps,
  type AuditFindings,
} from './audit/SecurityAudit';
export { RecoveryFlow, type RecoveryFlowProps } from './recovery/RecoveryFlow';

// Sharing + groups (module-10)
export { ShareDialog, type ShareDialogProps } from './share/ShareDialog';
export {
  IncomingSharesList,
  type IncomingSharesListProps,
} from './share/IncomingSharesList';
export { GroupList, type GroupListProps } from './groups/GroupList';
export {
  CreateGroupDialog,
  type CreateGroupDialogProps,
} from './groups/CreateGroupDialog';
export {
  GroupMembersPanel,
  type GroupMembersPanelProps,
} from './groups/GroupMembersPanel';
export {
  InviteMemberDialog,
  type InviteMemberDialogProps,
} from './groups/InviteMemberDialog';
