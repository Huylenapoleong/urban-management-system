import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../infrastructure/config/app-config.service';
import { UrbanTableRepository } from '../../../infrastructure/dynamodb/urban-table.repository';
import { makeGroupPk, makeMembershipSk } from '@urban/shared-utils';
import type { StoredMembership } from '../../../common/storage-records';

/**
 * Kiểm tra quyền truy cập dữ liệu Group cho các tính năng Officer.
 *
 * Trước khi cho phép tóm tắt/báo cáo group chat, service kiểm tra:
 *   1. User có phải Cán bộ không (WARD_OFFICER / PROVINCE_OFFICER / ADMIN)
 *   2. User có phải thành viên (Membership) của Group đó không
 */
@Injectable()
export class ChatbotPrivacyService {
  private readonly logger = new Logger(ChatbotPrivacyService.name);

  constructor(
    private readonly repository: UrbanTableRepository,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Kiểm tra user có nằm trong membership của group hay không.
   * Ném ForbiddenException nếu không thuộc group.
   */
  async ensureUserInGroup(userId: string, groupId: string): Promise<void> {
    const membership = await this.repository.get<StoredMembership>(
      this.config.dynamodbMembershipsTableName,
      makeGroupPk(groupId),
      makeMembershipSk(userId),
    );

    if (!membership || membership.deletedAt) {
      this.logger.warn(
        `Privacy check failed: user=${userId} is not a member of group=${groupId}`,
      );
      throw new ForbiddenException(
        'Bạn không phải thành viên của nhóm này. Không có quyền truy xuất dữ liệu.',
      );
    }
  }

  /**
   * Kiểm tra role có phải Officer/Admin hay không.
   * Citizen không được sử dụng các tính năng Officer Assistant.
   */
  ensureOfficerRole(role: string): void {
    const officerRoles = ['WARD_OFFICER', 'PROVINCE_OFFICER', 'ADMIN'];
    if (!officerRoles.includes(role)) {
      throw new ForbiddenException(
        'Chỉ Cán bộ mới có quyền sử dụng tính năng này.',
      );
    }
  }
}
