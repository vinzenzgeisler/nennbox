import type { ExternalIdentity, MembershipRole } from './providers.js';
import type { RequestContext } from './context.js';

export interface TeamInvitationInput {
  email: string;
  role: MembershipRole;
  lifetimeSeconds?: number | undefined;
}
export interface TeamSnapshot {
  members: Record<string, unknown>[];
  invitations: Record<string, unknown>[];
  history: Record<string, unknown>[];
}
export type TeamChange =
  | { kind: 'role'; role: MembershipRole }
  | { kind: 'status'; status: 'active' | 'disabled' };
export interface TeamRepository {
  list(context: RequestContext): Promise<TeamSnapshot>;
  invite(context: RequestContext, input: TeamInvitationInput): Promise<string>;
  revoke(context: RequestContext, id: string): Promise<void>;
  resend(context: RequestContext, id: string): Promise<void>;
  change(
    context: RequestContext,
    identityId: string,
    change: TeamChange,
  ): Promise<void>;
  redeem(
    context: RequestContext,
    identity: ExternalIdentity,
    token: string,
  ): Promise<void>;
}
export interface InvitationLifetime {
  defaultSeconds: number;
  minimumSeconds: number;
  maximumSeconds: number;
}
export const defaultInvitationLifetime: InvitationLifetime = {
  defaultSeconds: 7 * 86400,
  minimumSeconds: 3600,
  maximumSeconds: 30 * 86400,
};
