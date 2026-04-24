import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LocationsService } from './locations.service';

describe('LocationsService', () => {
  const service = new LocationsService();

  it('loads the local location snapshot', () => {
    const provinces = service.listProvinces();

    expect(provinces.length).toBe(34);
    expect(provinces.some((province) => province.code === '79')).toBe(true);
  });

  it('lists wards by province code', () => {
    const wards = service.listWards('79');

    expect(wards.length).toBeGreaterThan(0);
    expect(wards.every((ward) => ward.provinceCode === '79')).toBe(true);
  });

  it('validates v2 location codes against the snapshot', () => {
    const ward = service.listWards('79')[0];

    expect(service.ensureKnownLocationCode('VN-79')).toBe('VN-79');
    expect(service.ensureKnownLocationCode(`VN-79-${ward.code}`)).toBe(
      `VN-79-${ward.code}`,
    );
  });

  it('rejects legacy location codes for write validation', () => {
    expect(() => service.ensureKnownLocationCode('VN-HCM-BQ1-P01')).toThrow(
      new BadRequestException('locationCode must use v2 province/ward codes.'),
    );
  });

  it('rejects unknown province or ward codes', () => {
    expect(() => service.ensureKnownLocationCode('VN-00')).toThrow(
      new BadRequestException('locationCode does not exist.'),
    );
    expect(() => service.ensureKnownLocationCode('VN-79-99999')).toThrow(
      new BadRequestException('locationCode does not exist.'),
    );
  });

  it('resolves a v2 location code into display labels', () => {
    const ward = service.listWards('79')[0];
    const resolved = service.resolveLocationCode(`VN-79-${ward.code}`);

    expect(resolved.isLegacy).toBe(false);
    expect(resolved.scope).toBe('WARD');
    expect(resolved.province?.code).toBe('79');
    expect(resolved.ward?.code).toBe(ward.code);
    expect(resolved.displayName).toContain(ward.fullName);
  });

  it('returns a fallback envelope for legacy codes in resolve flow', () => {
    expect(service.resolveLocationCode('VN-HCM-BQ1-P01')).toEqual({
      locationCode: 'VN-HCM-BQ1-P01',
      scope: 'LEGACY',
      isLegacy: true,
      displayName: 'VN-HCM-BQ1-P01',
    });
  });

  it('fails ward listing for unknown provinces', () => {
    expect(() => service.listWards('00')).toThrow(
      new NotFoundException('provinceCode does not exist.'),
    );
  });
});
