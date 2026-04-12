import { BadRequestException, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

const DEFAULT_WEAK_PASSWORD_TERMS = [
  'password',
  '123456',
  '12345678',
  'qwerty',
  'admin',
  'letmein',
  'welcome',
  'abc123',
  '111111',
];

export type PasswordPolicyProfile = 'standard' | 'privileged';

interface PasswordPolicyContext {
  email?: string;
  fullName?: string;
  phone?: string;
}

interface ResolvedPasswordPolicy {
  maxLength: number;
  minCharacterClasses: number;
  minLength: number;
  requireSymbol: boolean;
}

@Injectable()
export class PasswordPolicyService {
  private readonly weakPasswordTerms: string[];

  constructor(private readonly config: AppConfigService) {
    this.weakPasswordTerms = Array.from(
      new Set(
        [...DEFAULT_WEAK_PASSWORD_TERMS, ...this.config.passwordBlocklistTerms]
          .map((term) => this.normalizeForComparison(term))
          .filter((term) => term.length >= 3),
      ),
    );
  }

  validateOrThrow(
    password: string,
    context: PasswordPolicyContext = {},
    profile: PasswordPolicyProfile = 'standard',
  ): void {
    const policy = this.resolvePolicy(profile);
    const normalizedPassword = password.normalize('NFKC');
    const characterLength = Array.from(normalizedPassword).length;
    const byteLength = Buffer.byteLength(normalizedPassword, 'utf8');

    if (
      characterLength < policy.minLength ||
      characterLength > policy.maxLength
    ) {
      throw new BadRequestException(
        `password must be between ${policy.minLength} and ${policy.maxLength} characters.`,
      );
    }

    if (byteLength > 72) {
      throw new BadRequestException(
        'password exceeds bcrypt input size limit (72 bytes).',
      );
    }

    if (/\s/.test(normalizedPassword)) {
      throw new BadRequestException('password must not contain whitespace.');
    }

    if (/(.)\1{3,}/.test(normalizedPassword)) {
      throw new BadRequestException(
        'password must not contain repeated characters (4+ in a row).',
      );
    }

    const hasLowercase = /[a-z]/.test(normalizedPassword);
    const hasUppercase = /[A-Z]/.test(normalizedPassword);
    const hasDigit = /\d/.test(normalizedPassword);
    const hasSymbol = /[^A-Za-z0-9]/.test(normalizedPassword);
    const classCount = [hasLowercase, hasUppercase, hasDigit, hasSymbol].filter(
      Boolean,
    ).length;

    if (classCount < policy.minCharacterClasses) {
      throw new BadRequestException(
        `password must include at least ${policy.minCharacterClasses} of: uppercase, lowercase, number, special character.`,
      );
    }

    if (policy.requireSymbol && !hasSymbol) {
      throw new BadRequestException(
        'password must include at least one special character.',
      );
    }

    if (this.config.passwordBlocklistEnabled && this.isWeakPassword(password)) {
      throw new BadRequestException('password is too common or predictable.');
    }

    if (this.containsPersonalInfo(password, context)) {
      throw new BadRequestException(
        'password must not contain your personal account information.',
      );
    }
  }

  private resolvePolicy(
    profile: PasswordPolicyProfile,
  ): ResolvedPasswordPolicy {
    if (profile === 'privileged') {
      return {
        minLength: this.config.passwordPrivilegedMinLength,
        maxLength: this.config.passwordMaxLength,
        minCharacterClasses: this.config.passwordPrivilegedMinCharacterClasses,
        requireSymbol: this.config.passwordPrivilegedRequireSymbol,
      };
    }

    return {
      minLength: this.config.passwordMinLength,
      maxLength: this.config.passwordMaxLength,
      minCharacterClasses: this.config.passwordMinCharacterClasses,
      requireSymbol: this.config.passwordRequireSymbol,
    };
  }

  private isWeakPassword(password: string): boolean {
    const normalizedPassword = this.normalizeForComparison(password);
    const compactPassword = normalizedPassword.replace(/[^a-z0-9]/g, '');

    for (const term of this.weakPasswordTerms) {
      if (
        normalizedPassword === term ||
        compactPassword === term ||
        (term.length >= 6 &&
          (normalizedPassword.includes(term) || compactPassword.includes(term)))
      ) {
        return true;
      }
    }

    return false;
  }

  private containsPersonalInfo(
    password: string,
    context: PasswordPolicyContext,
  ): boolean {
    const normalizedPassword = this.normalizeForComparison(password);
    const compactPassword = normalizedPassword.replace(/[^a-z0-9]/g, '');
    const numericPassword = password.replace(/\D/g, '');

    const identifiers: string[] = [];
    const emailLocalPart = context.email?.split('@')[0];
    if (emailLocalPart) {
      identifiers.push(emailLocalPart);
    }

    if (context.fullName) {
      identifiers.push(...this.extractNameTokens(context.fullName));
    }

    for (const identifier of identifiers) {
      const normalizedIdentifier = this.normalizeForComparison(identifier);
      if (normalizedIdentifier.length < 3) {
        continue;
      }

      const compactIdentifier = normalizedIdentifier.replace(/[^a-z0-9]/g, '');
      if (
        normalizedPassword.includes(normalizedIdentifier) ||
        compactPassword.includes(compactIdentifier)
      ) {
        return true;
      }
    }

    const phoneDigits = context.phone?.replace(/\D/g, '') ?? '';
    if (phoneDigits.length >= 6) {
      const lastSixDigits = phoneDigits.slice(-6);
      if (
        numericPassword.includes(phoneDigits) ||
        numericPassword.includes(lastSixDigits)
      ) {
        return true;
      }
    }

    return false;
  }

  private extractNameTokens(fullName: string): string[] {
    return fullName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3);
  }

  private normalizeForComparison(value: string): string {
    return value.normalize('NFKC').trim().toLowerCase();
  }
}
