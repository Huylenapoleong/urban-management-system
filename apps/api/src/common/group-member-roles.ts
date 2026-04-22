import {
  GROUP_MEMBER_ROLES,
  type GroupMemberRole,
} from '@urban/shared-constants';

export const LEGACY_GROUP_MEMBER_ROLE = 'OFFICER' as const;

export const GROUP_MEMBER_ROLE_INPUTS = [
  ...GROUP_MEMBER_ROLES,
  LEGACY_GROUP_MEMBER_ROLE,
] as const;

export type GroupMemberRoleInput =
  | GroupMemberRole
  | typeof LEGACY_GROUP_MEMBER_ROLE;

export function normalizeGroupMemberRole(
  role: string | null | undefined,
): GroupMemberRole | undefined {
  if (!role) {
    return undefined;
  }

  if (role === LEGACY_GROUP_MEMBER_ROLE) {
    return 'DEPUTY';
  }

  if (role === 'OWNER' || role === 'DEPUTY' || role === 'MEMBER') {
    return role;
  }

  return undefined;
}
