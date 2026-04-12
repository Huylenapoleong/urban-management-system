import { BadRequestException } from '@nestjs/common';
import { PasswordPolicyService } from './password-policy.service';

describe('PasswordPolicyService', () => {
  function buildService(
    overrides: Partial<{
      passwordBlocklistEnabled: boolean;
      passwordBlocklistTerms: string[];
      passwordMaxLength: number;
      passwordMinCharacterClasses: number;
      passwordMinLength: number;
      passwordPrivilegedMinCharacterClasses: number;
      passwordPrivilegedMinLength: number;
      passwordPrivilegedRequireSymbol: boolean;
      passwordRequireSymbol: boolean;
    }> = {},
  ): PasswordPolicyService {
    return new PasswordPolicyService({
      passwordMinLength: 10,
      passwordMaxLength: 64,
      passwordMinCharacterClasses: 3,
      passwordRequireSymbol: false,
      passwordPrivilegedMinLength: 12,
      passwordPrivilegedMinCharacterClasses: 4,
      passwordPrivilegedRequireSymbol: true,
      passwordBlocklistEnabled: true,
      passwordBlocklistTerms: [],
      ...overrides,
    } as never);
  }

  it('accepts a standard password with 3 character classes', () => {
    const service = buildService();

    expect(() =>
      service.validateOrThrow('Alpha12345', {
        email: 'citizen.one@example.com',
        phone: '0901234567',
        fullName: 'Citizen One',
      }),
    ).not.toThrow();
  });

  it('rejects password with insufficient character classes', () => {
    const service = buildService();

    expect(() => service.validateOrThrow('citizenabcd')).toThrow(
      new BadRequestException(
        'password must include at least 3 of: uppercase, lowercase, number, special character.',
      ),
    );
  });

  it('rejects password containing email local-part', () => {
    const service = buildService();

    expect(() =>
      service.validateOrThrow('CitizenOne123!', {
        email: 'citizen.one@example.com',
      }),
    ).toThrow(
      new BadRequestException(
        'password must not contain your personal account information.',
      ),
    );
  });

  it('rejects weak passwords from built-in blocklist', () => {
    const service = buildService();

    expect(() => service.validateOrThrow('Password123!')).toThrow(
      new BadRequestException('password is too common or predictable.'),
    );
  });

  it('enforces privileged policy with mandatory symbol', () => {
    const service = buildService();

    expect(() =>
      service.validateOrThrow('OfficerPass123', {}, 'privileged'),
    ).toThrow(
      new BadRequestException(
        'password must include at least 4 of: uppercase, lowercase, number, special character.',
      ),
    );
    expect(() =>
      service.validateOrThrow('OfficerPass123!', {}, 'privileged'),
    ).not.toThrow();
  });
});
