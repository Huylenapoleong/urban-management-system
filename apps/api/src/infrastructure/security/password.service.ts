import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

let bcryptModulePromise: Promise<typeof import('bcryptjs')> | undefined;

async function loadBcrypt(): Promise<typeof import('bcryptjs')> {
  bcryptModulePromise ??= import('bcryptjs');
  return bcryptModulePromise;
}

@Injectable()
export class PasswordService {
  constructor(private readonly config: AppConfigService) {}

  async hashPassword(password: string): Promise<string> {
    const bcrypt = await loadBcrypt();
    return bcrypt.hash(password, this.config.bcryptRounds);
  }

  async verifyPassword(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    const bcrypt = await loadBcrypt();
    return bcrypt.compare(password, passwordHash);
  }
}
