import { parseLocationCode } from '@urban/shared-utils';

describe('parseLocationCode', () => {
  it('parses v2 province scope codes', () => {
    expect(parseLocationCode('VN-79')).toEqual({
      country: 'VN',
      province: '79',
      district: '',
      ward: '',
    });
  });

  it('parses v2 ward scope codes', () => {
    expect(parseLocationCode('VN-79-26734')).toEqual({
      country: 'VN',
      province: '79',
      district: '',
      ward: '26734',
    });
  });

  it('keeps legacy four-segment parsing intact', () => {
    expect(parseLocationCode('VN-HCM-BQ1-P01')).toEqual({
      country: 'VN',
      province: 'HCM',
      district: 'BQ1',
      ward: 'P01',
    });
  });
});
