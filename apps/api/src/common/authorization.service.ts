import { Injectable } from '@nestjs/common';
import type {
  GroupMemberRole,
  GroupType,
  UserRole,
} from '@urban/shared-constants';
import type { AuthenticatedUser } from '@urban/shared-types';
import { isSameProvince, isSameWard } from '@urban/shared-utils';
import type { StoredGroup, StoredReport, StoredUser } from './storage-records';

@Injectable()
export class AuthorizationService {
  isAdmin(user: AuthenticatedUser): boolean {
    return user.role === 'ADMIN';
  }

  isStaff(user: AuthenticatedUser): boolean {
    return user.role !== 'CITIZEN';
  }

  canAccessLocationScope(
    user: AuthenticatedUser,
    locationCode: string,
  ): boolean {
    switch (user.role) {
      case 'ADMIN':
        return true;
      case 'PROVINCE_OFFICER':
        return isSameProvince(user.locationCode, locationCode);
      case 'WARD_OFFICER':
      case 'CITIZEN':
      default:
        return isSameWard(user.locationCode, locationCode);
    }
  }

  canReadUser(actor: AuthenticatedUser, target: StoredUser): boolean {
    return (
      actor.id === target.userId ||
      this.canAccessLocationScope(actor, target.locationCode)
    );
  }

  canManageUser(actor: AuthenticatedUser, target: StoredUser): boolean {
    if (actor.id === target.userId) {
      return false;
    }

    if (actor.role === 'ADMIN') {
      return true;
    }

    if (
      actor.role === 'PROVINCE_OFFICER' &&
      this.canAccessLocationScope(actor, target.locationCode)
    ) {
      return target.role === 'WARD_OFFICER' || target.role === 'CITIZEN';
    }

    if (
      actor.role === 'WARD_OFFICER' &&
      this.canAccessLocationScope(actor, target.locationCode)
    ) {
      return target.role === 'CITIZEN';
    }

    return false;
  }

  canCreateUserRole(
    actor: AuthenticatedUser,
    role: UserRole,
    locationCode: string,
  ): boolean {
    if (actor.role === 'ADMIN') {
      return true;
    }

    if (actor.role === 'PROVINCE_OFFICER') {
      return (
        role === 'WARD_OFFICER' &&
        this.canAccessLocationScope(actor, locationCode)
      );
    }

    return false;
  }

  canCreateGroup(
    actor: AuthenticatedUser,
    groupType: GroupType,
    locationCode: string,
    isOfficial: boolean,
  ): boolean {
    if (actor.role === 'CITIZEN') {
      return (
        groupType === 'PRIVATE' &&
        !isOfficial &&
        actor.locationCode === locationCode
      );
    }

    return this.canAccessLocationScope(actor, locationCode);
  }

  canReadGroup(
    actor: AuthenticatedUser,
    group: StoredGroup,
    isMember: boolean,
  ): boolean {
    if (group.deletedAt) {
      return false;
    }

    if (actor.role === 'ADMIN' || isMember) {
      return true;
    }

    if (group.groupType === 'PRIVATE') {
      return false;
    }

    return this.canAccessLocationScope(actor, group.locationCode);
  }

  canManageGroup(
    actor: AuthenticatedUser,
    group: StoredGroup,
    roleInGroup?: GroupMemberRole,
  ): boolean {
    if (actor.role === 'ADMIN') {
      return true;
    }

    if (roleInGroup === 'OWNER' || roleInGroup === 'OFFICER') {
      return true;
    }

    if (actor.role === 'CITIZEN') {
      return false;
    }

    return (
      group.groupType !== 'PRIVATE' &&
      this.canAccessLocationScope(actor, group.locationCode)
    );
  }

  canJoinGroup(actor: AuthenticatedUser, group: StoredGroup): boolean {
    if (group.groupType === 'PRIVATE') {
      return false;
    }

    if (actor.role === 'ADMIN') {
      return true;
    }

    return this.canAccessLocationScope(actor, group.locationCode);
  }

  canDeleteGroup(
    actor: AuthenticatedUser,
    group: StoredGroup,
    roleInGroup?: GroupMemberRole,
  ): boolean {
    return this.canManageGroup(actor, group, roleInGroup);
  }

  canReadReport(actor: AuthenticatedUser, report: StoredReport): boolean {
    if (actor.role === 'ADMIN' || actor.id === report.userId) {
      return true;
    }

    if (actor.role === 'CITIZEN') {
      return false;
    }

    return this.canAccessLocationScope(actor, report.locationCode);
  }

  canCreateReport(actor: AuthenticatedUser, locationCode: string): boolean {
    if (actor.role === 'ADMIN') {
      return true;
    }

    if (actor.role === 'CITIZEN') {
      return actor.locationCode === locationCode;
    }

    return this.canAccessLocationScope(actor, locationCode);
  }

  canUpdateOwnReport(actor: AuthenticatedUser, report: StoredReport): boolean {
    return actor.id === report.userId && report.status === 'NEW';
  }

  canManageReport(actor: AuthenticatedUser, report: StoredReport): boolean {
    return actor.role !== 'CITIZEN' && this.canReadReport(actor, report);
  }

  canAssignReport(
    actor: AuthenticatedUser,
    report: StoredReport,
    officer: StoredUser,
  ): boolean {
    if (!this.canManageReport(actor, report)) {
      return false;
    }

    if (officer.role === 'CITIZEN') {
      return false;
    }

    return this.canAccessLocationScope(actor, officer.locationCode);
  }

  canTransitionReport(actor: AuthenticatedUser, report: StoredReport): boolean {
    if (actor.role === 'ADMIN') {
      return true;
    }

    if (actor.role === 'CITIZEN') {
      return actor.id === report.userId && report.status === 'RESOLVED';
    }

    return this.canAccessLocationScope(actor, report.locationCode);
  }

  canDeleteReport(actor: AuthenticatedUser, report: StoredReport): boolean {
    return (
      this.canManageReport(actor, report) ||
      this.canUpdateOwnReport(actor, report)
    );
  }

  canAccessDirectConversation(
    actor: AuthenticatedUser,
    participantIds: string[],
  ): boolean {
    return actor.role === 'ADMIN' || participantIds.includes(actor.id);
  }
}
