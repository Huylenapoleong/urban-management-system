import '../core/network/api_client.dart';

class ProvinceItem {
  final String code;
  final String name;
  final String fullName;
  final String unitType;

  const ProvinceItem({
    required this.code,
    required this.name,
    required this.fullName,
    required this.unitType,
  });

  factory ProvinceItem.fromJson(Map<String, dynamic> json) => ProvinceItem(
        code: json['code'] as String,
        name: json['name'] as String,
        fullName: json['fullName'] as String,
        unitType: json['unitType'] as String? ?? 'PROVINCE',
      );

  /// Tạo locationCode V2 cấp tỉnh: VN-{code}
  String get locationCode => 'VN-$code';
}

class WardItem {
  final String code;
  final String name;
  final String fullName;
  final String provinceCode;
  final String unitType;

  const WardItem({
    required this.code,
    required this.name,
    required this.fullName,
    required this.provinceCode,
    required this.unitType,
  });

  factory WardItem.fromJson(Map<String, dynamic> json) => WardItem(
        code: json['code'] as String,
        name: json['name'] as String,
        fullName: json['fullName'] as String,
        provinceCode: json['provinceCode'] as String,
        unitType: json['unitType'] as String? ?? 'WARD',
      );

  /// Tạo locationCode V2 cấp phường/xã: VN-{provinceCode}-{code}
  String get locationCode => 'VN-$provinceCode-$code';
}

class ResolvedLocation {
  final String locationCode;
  final String scope; // 'PROVINCE' | 'WARD' | 'LEGACY'
  final bool isLegacy;
  final String displayName;
  final ProvinceItem? province;
  final WardItem? ward;

  const ResolvedLocation({
    required this.locationCode,
    required this.scope,
    required this.isLegacy,
    required this.displayName,
    this.province,
    this.ward,
  });

  factory ResolvedLocation.fromJson(Map<String, dynamic> json) {
    final provinceJson = json['province'] as Map<String, dynamic>?;
    final wardJson = json['ward'] as Map<String, dynamic>?;
    return ResolvedLocation(
      locationCode: json['locationCode'] as String,
      scope: json['scope'] as String,
      isLegacy: json['isLegacy'] as bool? ?? false,
      displayName: json['displayName'] as String,
      province: provinceJson != null ? ProvinceItem.fromJson(provinceJson) : null,
      ward: wardJson != null ? WardItem.fromJson(wardJson) : null,
    );
  }
}

class LocationService {
  const LocationService({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<List<ProvinceItem>> listProvinces() async {
    final raw = await _apiClient.get('/locations/provinces');
    final List list = raw is List ? raw : (raw as Map)['data'] as List? ?? [];
    return list
        .map((e) => ProvinceItem.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<List<WardItem>> listWards(String provinceCode) async {
    final raw = await _apiClient.get(
      '/locations/wards',
      queryParameters: {'provinceCode': provinceCode},
    );
    final List list = raw is List ? raw : (raw as Map)['data'] as List? ?? [];
    return list
        .map((e) => WardItem.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<List<Map<String, dynamic>>> searchLocations(String query, {int? limit}) async {
    final raw = await _apiClient.get(
      '/locations/search',
      queryParameters: {
        'q': query,
        if (limit != null) 'limit': limit,
      },
    );
    final List list = raw is List ? raw : (raw as Map)['data'] as List? ?? [];
    return list.map((e) => (e as Map).cast<String, dynamic>()).toList();
  }

  Future<ResolvedLocation> resolveLocationCode(String locationCode) async {
    final raw = await _apiClient.get(
      '/locations/resolve',
      queryParameters: {'locationCode': locationCode},
    );
    final data = raw is Map ? raw.cast<String, dynamic>() : raw as Map<String, dynamic>;
    return ResolvedLocation.fromJson(data);
  }
}
