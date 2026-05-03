import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureLocationCode } from '../../common/validation';

interface SnapshotWardRecord {
  Code: string;
  FullName: string;
  ProvinceCode: string;
}

interface SnapshotProvinceRecord {
  Code: string;
  FullName: string;
  Wards: SnapshotWardRecord[];
}

export interface LocationProvinceRecord {
  code: string;
  name: string;
  fullName: string;
  unitType: 'MUNICIPALITY' | 'PROVINCE';
}

export interface LocationWardRecord {
  code: string;
  name: string;
  fullName: string;
  provinceCode: string;
  unitType: 'WARD' | 'COMMUNE' | 'SPECIAL_ZONE';
}

export interface LocationSearchItem {
  scope: 'PROVINCE' | 'WARD';
  locationCode: string;
  code: string;
  name: string;
  fullName: string;
  displayName: string;
  provinceCode: string;
}

export interface ResolvedLocationRecord {
  locationCode: string;
  scope: 'PROVINCE' | 'WARD' | 'LEGACY';
  isLegacy: boolean;
  displayName: string;
  province?: LocationProvinceRecord;
  ward?: LocationWardRecord;
}

const LOCATION_SNAPSHOT_FILE = 'data/vietnam-location-v2.snapshot.json';
const V2_LOCATION_CODE_PATTERN = /^VN-(\d{2})(?:-(\d{5}))?$/;

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);
  private readonly provinces: readonly LocationProvinceRecord[];
  private readonly wardsByProvince: ReadonlyMap<
    string,
    readonly LocationWardRecord[]
  >;
  private readonly provinceByCode: ReadonlyMap<string, LocationProvinceRecord>;
  private readonly wardByCode: ReadonlyMap<string, LocationWardRecord>;

  constructor() {
    const snapshot = this.loadSnapshot();
    const provinceByCode = new Map<string, LocationProvinceRecord>();
    const wardByCode = new Map<string, LocationWardRecord>();
    const wardsByProvince = new Map<string, readonly LocationWardRecord[]>();

    const provinces = snapshot
      .map((province) => {
        const provinceRecord = this.toProvinceRecord(province);
        provinceByCode.set(provinceRecord.code, provinceRecord);

        const wardRecords = province.Wards.map((ward) =>
          this.toWardRecord(ward),
        ).sort((left, right) =>
          left.fullName.localeCompare(right.fullName, 'vi', {
            sensitivity: 'base',
          }),
        );

        for (const wardRecord of wardRecords) {
          wardByCode.set(wardRecord.code, wardRecord);
        }

        wardsByProvince.set(provinceRecord.code, wardRecords);
        return provinceRecord;
      })
      .sort((left, right) =>
        left.fullName.localeCompare(right.fullName, 'vi', {
          sensitivity: 'base',
        }),
      );

    this.provinces = provinces;
    this.wardsByProvince = wardsByProvince;
    this.provinceByCode = provinceByCode;
    this.wardByCode = wardByCode;

    this.logger.log(
      `Loaded ${this.provinces.length} provinces/cities and ${this.wardByCode.size} wards from local snapshot.`,
    );
  }

  listProvinces(): readonly LocationProvinceRecord[] {
    return this.provinces;
  }

  listWards(provinceCodeInput: string): readonly LocationWardRecord[] {
    const provinceCode = this.normalizeProvinceCode(provinceCodeInput);
    return this.wardsByProvince.get(provinceCode) ?? [];
  }

  searchLocations(
    queryInput: string,
    limitInput?: number,
  ): LocationSearchItem[] {
    const query = queryInput.trim().toLowerCase();

    if (!query) {
      return [];
    }

    const limit = this.normalizeSearchLimit(limitInput);
    const provinceMatches = this.provinces
      .map<LocationSearchItem>((province) => ({
        scope: 'PROVINCE',
        locationCode: `VN-${province.code}`,
        code: province.code,
        name: province.name,
        fullName: province.fullName,
        displayName: province.fullName,
        provinceCode: province.code,
      }))
      .filter((province) => this.matchesQuery(province, query));

    const wardMatches = Array.from(this.wardByCode.values())
      .map<LocationSearchItem>((ward) => {
        const province = this.provinceByCode.get(ward.provinceCode);
        return {
          scope: 'WARD',
          locationCode: `VN-${ward.provinceCode}-${ward.code}`,
          code: ward.code,
          name: ward.name,
          fullName: ward.fullName,
          displayName: province
            ? `${ward.fullName}, ${province.fullName}`
            : ward.fullName,
          provinceCode: ward.provinceCode,
        };
      })
      .filter((ward) => this.matchesQuery(ward, query));

    return [...provinceMatches, ...wardMatches]
      .sort((left, right) =>
        left.displayName.localeCompare(right.displayName, 'vi', {
          sensitivity: 'base',
        }),
      )
      .slice(0, limit);
  }

  resolveLocationCode(locationCodeInput: string): ResolvedLocationRecord {
    const locationCode = ensureLocationCode(locationCodeInput);
    const v2Match = locationCode.match(V2_LOCATION_CODE_PATTERN);

    if (!v2Match) {
      return {
        locationCode,
        scope: 'LEGACY',
        isLegacy: true,
        displayName: locationCode,
      };
    }

    const [, provinceCode, wardCode] = v2Match;
    const province = this.provinceByCode.get(provinceCode);

    if (!province) {
      throw new NotFoundException('locationCode does not exist.');
    }

    if (!wardCode) {
      return {
        locationCode,
        scope: 'PROVINCE',
        isLegacy: false,
        displayName: province.fullName,
        province,
      };
    }

    const ward = this.wardByCode.get(wardCode);

    if (!ward || ward.provinceCode !== provinceCode) {
      throw new NotFoundException('locationCode does not exist.');
    }

    return {
      locationCode,
      scope: 'WARD',
      isLegacy: false,
      displayName: `${ward.fullName}, ${province.fullName}`,
      province,
      ward,
    };
  }

  ensureKnownLocationCode(
    locationCodeInput: string,
    field = 'locationCode',
  ): string {
    const locationCode = ensureLocationCode(locationCodeInput, field);
    const v2Match = locationCode.match(V2_LOCATION_CODE_PATTERN);

    if (!v2Match) {
      throw new BadRequestException(
        `${field} must use v2 province/ward codes.`,
      );
    }

    const [, provinceCode, wardCode] = v2Match;
    const province = this.provinceByCode.get(provinceCode);

    if (!province) {
      throw new BadRequestException(`${field} does not exist.`);
    }

    if (!wardCode) {
      return locationCode;
    }

    const ward = this.wardByCode.get(wardCode);

    if (!ward || ward.provinceCode !== provinceCode) {
      throw new BadRequestException(`${field} does not exist.`);
    }

    return locationCode;
  }

  private loadSnapshot(): SnapshotProvinceRecord[] {
    const snapshotPath = this.resolveSnapshotPath();
    const fileContent = readFileSync(snapshotPath, 'utf8');
    const parsed = JSON.parse(fileContent) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error('Location snapshot must be an array.');
    }

    return parsed as SnapshotProvinceRecord[];
  }

  private resolveSnapshotPath(): string {
    const cwd = resolve(process.cwd());
    const apiRootCandidates = [
      cwd,
      resolve(cwd, 'apps', 'api'),
      resolve(cwd, '..', 'apps', 'api'),
      resolve(cwd, '..', '..', 'apps', 'api'),
    ];

    const candidatePaths = [join(__dirname, LOCATION_SNAPSHOT_FILE)];

    for (const apiRoot of apiRootCandidates) {
      candidatePaths.push(
        resolve(
          apiRoot,
          'dist',
          'src',
          'modules',
          'locations',
          LOCATION_SNAPSHOT_FILE,
        ),
        resolve(
          apiRoot,
          'dist',
          'modules',
          'locations',
          LOCATION_SNAPSHOT_FILE,
        ),
        resolve(apiRoot, 'src', 'modules', 'locations', LOCATION_SNAPSHOT_FILE),
      );
    }

    const uniqueCandidatePaths = Array.from(new Set(candidatePaths));
    const snapshotPath = uniqueCandidatePaths.find((candidatePath) =>
      existsSync(candidatePath),
    );

    if (!snapshotPath) {
      throw new Error(
        `Location snapshot is missing. Looked in: ${uniqueCandidatePaths.join(', ')}`,
      );
    }

    return snapshotPath;
  }

  private toProvinceRecord(
    record: SnapshotProvinceRecord,
  ): LocationProvinceRecord {
    return {
      code: record.Code,
      name: this.stripProvincePrefix(record.FullName),
      fullName: record.FullName,
      unitType: record.FullName.startsWith('Thành phố')
        ? 'MUNICIPALITY'
        : 'PROVINCE',
    };
  }

  private toWardRecord(record: SnapshotWardRecord): LocationWardRecord {
    return {
      code: record.Code,
      name: this.stripWardPrefix(record.FullName),
      fullName: record.FullName,
      provinceCode: record.ProvinceCode,
      unitType: this.resolveWardUnitType(record.FullName),
    };
  }

  private stripProvincePrefix(fullName: string): string {
    return fullName
      .replace(/^Thành phố\s+/u, '')
      .replace(/^Tỉnh\s+/u, '')
      .trim();
  }

  private stripWardPrefix(fullName: string): string {
    return fullName
      .replace(/^Phường\s+/u, '')
      .replace(/^Xã\s+/u, '')
      .replace(/^Đặc khu\s+/u, '')
      .trim();
  }

  private resolveWardUnitType(
    fullName: string,
  ): 'WARD' | 'COMMUNE' | 'SPECIAL_ZONE' {
    if (fullName.startsWith('Phường ')) {
      return 'WARD';
    }

    if (fullName.startsWith('Đặc khu ')) {
      return 'SPECIAL_ZONE';
    }

    return 'COMMUNE';
  }

  private normalizeProvinceCode(provinceCodeInput: string): string {
    const provinceCode = provinceCodeInput.trim();

    if (!/^\d{2}$/.test(provinceCode)) {
      throw new BadRequestException('provinceCode is invalid.');
    }

    if (!this.provinceByCode.has(provinceCode)) {
      throw new NotFoundException('provinceCode does not exist.');
    }

    return provinceCode;
  }

  private normalizeSearchLimit(limitInput?: number): number {
    if (limitInput === undefined || limitInput === null) {
      return 20;
    }

    if (!Number.isInteger(limitInput) || limitInput <= 0) {
      throw new BadRequestException('limit must be a positive integer.');
    }

    return Math.min(limitInput, 50);
  }

  private matchesQuery(item: LocationSearchItem, query: string): boolean {
    const haystack = [
      item.code,
      item.locationCode,
      item.name,
      item.fullName,
      item.displayName,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  }
}
