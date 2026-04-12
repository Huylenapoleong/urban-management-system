import { BadRequestException } from '@nestjs/common';
import { ensureLocationCode } from './validation';

describe('ensureLocationCode', () => {
  it('accepts and normalizes supported location code depths', () => {
    expect(ensureLocationCode('vn-hcm')).toBe('VN-HCM');
    expect(ensureLocationCode('VN-HCM-BQ1')).toBe('VN-HCM-BQ1');
    expect(ensureLocationCode('VN-HCM-BQ1-P01')).toBe('VN-HCM-BQ1-P01');
    expect(ensureLocationCode('vn-79-760-26734')).toBe('VN-79-760-26734');
  });

  it('rejects malformed location codes', () => {
    expect(() => ensureLocationCode('HCM-BQ1-P01')).toThrow(
      new BadRequestException('locationCode is invalid.'),
    );
    expect(() => ensureLocationCode('VN')).toThrow(
      new BadRequestException('locationCode is invalid.'),
    );
    expect(() => ensureLocationCode('VN-HCM-BQ1-P01-EXTRA')).toThrow(
      new BadRequestException('locationCode is invalid.'),
    );
  });
});
