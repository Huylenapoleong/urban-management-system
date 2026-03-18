import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class PasswordService {
  constructor(private readonly config: AppConfigService) {}

  async hashPassword(password: string): Promise<string> {
    return hash(password, this.config.bcryptRounds);
  }

  async verifyPassword(
    password: string,
    passwordHash: string,
  ): Promise<boolean> {
    return compare(password, passwordHash);
  }
}
