import { AuthorizationService } from './authorization.service';
import type { StoredGroup, StoredReport, StoredUser } from './storage-records';

describe('AuthorizationService', () => {
  const service = new AuthorizationService();

  const citizenActor = {
    id: 'citizen-1',
    role: 'CITIZEN' as const,
    locationCode: 'VN-HCM-BQ1-P01',
    fullName: 'Citizen A',
    status: 'ACTIVE' as const,
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  };

  const wardOfficerActor = {
    ...citizenActor,
    id: 'officer-actor',
    role: 'WARD_OFFICER' as const,
    fullName: 'Ward Officer',
  };

  const provinceOfficerActor = {
    ...citizenActor,
    id: 'province-officer',
    role: 'PROVINCE_OFFICER' as const,
    fullName: 'Province Officer',
  };

  const targetUser: StoredUser = {
    PK: 'USER#citizen-2',
    SK: 'PROFILE',
    entityType: 'USER_PROFILE',
    GSI1SK: 'USER',
    userId: 'citizen-2',
    phone: '+84901234567',
    email: 'citizen-2@example.com',
    passwordHash: 'hashed',
    fullName: 'Citizen B',
    role: 'CITIZEN',
    locationCode: 'VN-HCM-BQ1-P01',
    unit: undefined,
    avatarUrl: undefined,
    status: 'ACTIVE',
    deletedAt: null,
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  };

  const scopedOfficer: StoredUser = {
    ...targetUser,
    PK: 'USER#officer-1',
    userId: 'officer-1',
    fullName: 'Ward Officer One',
    role: 'WARD_OFFICER',
    status: 'ACTIVE',
  };

  const provinceOfficer: StoredUser = {
    ...scopedOfficer,
    PK: 'USER#officer-2',
    userId: 'officer-2',
    fullName: 'Province Officer Two',
    role: 'PROVINCE_OFFICER',
    locationCode: 'VN-HCM-BQ9-P09',
  };

  const group: StoredGroup = {
    PK: 'GROUP#group-1',
    SK: 'METADATA',
    entityType: 'GROUP_METADATA',
    GSI1PK: 'TYPE#AREA#LOC#VN-HCM-BQ1-P01',
    groupId: 'group-1',
    groupName: 'Ward Group',
    groupType: 'AREA',
    locationCode: 'VN-HCM-BQ1-P01',
    createdBy: 'owner-1',
    description: undefined,
    memberCount: 2,
    isOfficial: false,
    deletedAt: null,
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  };

  const report: StoredReport = {
    PK: 'REPORT#report-1',
    SK: 'METADATA',
    entityType: 'REPORT',
    GSI1PK: 'CAT#INFRASTRUCTURE#LOC#VN-HCM-BQ1-P01',
    GSI2PK: 'STATUS#NEW#LOC#VN-HCM-BQ1-P01',
    reportId: 'report-1',
    userId: citizenActor.id,
    groupId: undefined,
    title: 'Broken streetlight',
    description: 'Lamp is out',
    category: 'INFRASTRUCTURE',
    locationCode: 'VN-HCM-BQ1-P01',
    status: 'NEW',
    priority: 'MEDIUM',
    mediaUrls: [],
    assignedOfficerId: undefined,
    deletedAt: null,
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-20T00:00:00.000Z',
  };

  it('does not allow citizens to read other user profiles in the same ward', () => {
    expect(service.canReadUser(citizenActor, targetUser)).toBe(false);
  });

  it('allows citizens to read only their own profile', () => {
    expect(
      service.canReadUser(citizenActor, {
        ...targetUser,
        userId: citizenActor.id,
      }),
    ).toBe(true);
  });

  it('allows only owners or admins to delete a group', () => {
    expect(service.canDeleteGroup(citizenActor, group, 'OFFICER')).toBe(false);
    expect(service.canDeleteGroup(citizenActor, group, 'OWNER')).toBe(true);
  });

  it('does not allow non-member staff to manage a public group', () => {
    expect(service.canManageGroup(wardOfficerActor, group)).toBe(false);
  });

  it('allows owner or officer members to manage a group', () => {
    expect(service.canManageGroup(wardOfficerActor, group, 'OWNER')).toBe(true);
    expect(service.canManageGroup(wardOfficerActor, group, 'OFFICER')).toBe(
      true,
    );
  });

  it('does not allow assigning a report to an inactive officer', () => {
    expect(
      service.canAssignReport(wardOfficerActor, report, {
        ...scopedOfficer,
        status: 'LOCKED',
      }),
    ).toBe(false);
  });

  it('does not allow assigning a report outside the target officer scope', () => {
    expect(
      service.canAssignReport(provinceOfficerActor, report, {
        ...scopedOfficer,
        locationCode: 'VN-HCM-BQ2-P03',
      }),
    ).toBe(false);
  });

  it('allows valid staff report transitions and blocks invalid terminal transitions', () => {
    expect(
      service.canTransitionReport(wardOfficerActor, report, 'IN_PROGRESS'),
    ).toBe(true);
    expect(
      service.canTransitionReport(
        wardOfficerActor,
        {
          ...report,
          status: 'CLOSED',
        },
        'IN_PROGRESS',
      ),
    ).toBe(false);
  });

  it('allows citizens to close only their own resolved reports', () => {
    expect(
      service.canTransitionReport(
        citizenActor,
        {
          ...report,
          status: 'RESOLVED',
        },
        'CLOSED',
      ),
    ).toBe(true);
    expect(service.canTransitionReport(citizenActor, report, 'CLOSED')).toBe(
      false,
    );
  });

  it('does not allow citizen to start a direct conversation with another citizen', () => {
    expect(service.canAccessDirectConversation(citizenActor, targetUser)).toBe(
      false,
    );
  });

  it('allows citizen to start a direct conversation with an in-scope officer', () => {
    expect(
      service.canAccessDirectConversation(citizenActor, scopedOfficer),
    ).toBe(true);
  });

  it('allows cross-scope staff direct conversation only when scopes overlap', () => {
    expect(
      service.canAccessDirectConversation(wardOfficerActor, provinceOfficer),
    ).toBe(true);
    expect(
      service.canAccessDirectConversation(wardOfficerActor, {
        ...scopedOfficer,
        userId: 'other-ward',
        locationCode: 'VN-HCM-BQ2-P03',
      }),
    ).toBe(false);
  });
});
