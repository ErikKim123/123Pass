// Design Ref: §3.1 / §7.2 — audit events store metadata only, never plaintext credentials.

export type AuditEventType =
  | 'login'
  | 'login_failed'
  | 'item_created'
  | 'item_updated'
  | 'item_deleted'
  | 'share_created'
  | 'share_accepted'
  | 'master_pw_changed'
  | 'recovery_used';

export interface AuditEvent {
  id: string;
  userId: string;
  eventType: AuditEventType;
  ipHash: string | null; // hashed for privacy
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}
