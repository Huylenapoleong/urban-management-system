import { BadRequestException } from '@nestjs/common';
import { ensureLocationCode } from './validation';

describe('ensureLocationCode', () => {
  it('accepts and normalizes supported location code depths', () => {
    expect(ensureLocationCode('vn-79')).toBe('VN-79');
    expect(ensureLocationCode('vn-79-25747')).toBe('VN-79-25747');
  });

  it('rejects malformed location codes', () => {
    expect(() => ensureLocationCode('79-25747')).toThrow(
      new BadRequestException('locationCode is invalid.'),
    );
    expect(() => ensureLocationCode('VN')).toThrow(
      new BadRequestException('locationCode is invalid.'),
    );
    expect(() => ensureLocationCode('VN-79--25747')).toThrow(
      new BadRequestException('locationCode is invalid.'),
    );
  });
});
