import 'package:flutter/material.dart';
import '../../../services/location_service.dart';

/// Widget chọn địa điểm V2 (tỉnh → phường/xã).
/// Trả về locationCode dạng "VN-{provinceCode}-{wardCode}".
class LocationPickerWidget extends StatefulWidget {
  final LocationService locationService;
  final String? initialLocationCode;
  final ValueChanged<String> onLocationSelected;
  final bool enabled;

  const LocationPickerWidget({
    super.key,
    required this.locationService,
    required this.onLocationSelected,
    this.initialLocationCode,
    this.enabled = true,
  });

  @override
  State<LocationPickerWidget> createState() => _LocationPickerWidgetState();
}

class _LocationPickerWidgetState extends State<LocationPickerWidget> {
  List<ProvinceItem> _provinces = [];
  List<WardItem> _wards = [];

  ProvinceItem? _selectedProvince;
  WardItem? _selectedWard;

  bool _loadingProvinces = true;
  bool _loadingWards = false;
  String? _resolvedDisplay;

  @override
  void initState() {
    super.initState();
    _loadProvinces();
  }

  Future<void> _loadProvinces() async {
    try {
      final provinces = await widget.locationService.listProvinces();
      if (!mounted) return;
      setState(() {
        _provinces = provinces;
        _loadingProvinces = false;
      });
      // Nếu có initialLocationCode, giải mã và pre-select
      if (widget.initialLocationCode != null && widget.initialLocationCode!.isNotEmpty) {
        _resolveInitial(widget.initialLocationCode!);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingProvinces = false);
    }
  }

  Future<void> _resolveInitial(String locationCode) async {
    try {
      final resolved = await widget.locationService.resolveLocationCode(locationCode);
      if (!mounted) return;

      if (resolved.province != null) {
        final province = _provinces.firstWhere(
          (p) => p.code == resolved.province!.code,
          orElse: () => resolved.province!,
        );
        setState(() {
          _selectedProvince = province;
          _resolvedDisplay = resolved.displayName;
        });

        if (resolved.ward != null) {
          await _loadWards(province.code);
          if (!mounted) return;
          final ward = _wards.firstWhere(
            (w) => w.code == resolved.ward!.code,
            orElse: () => resolved.ward!,
          );
          setState(() => _selectedWard = ward);
        }
      } else if (resolved.isLegacy) {
        setState(() => _resolvedDisplay = resolved.displayName);
      }
    } catch (_) {}
  }

  Future<void> _loadWards(String provinceCode) async {
    setState(() => _loadingWards = true);
    try {
      final wards = await widget.locationService.listWards(provinceCode);
      if (!mounted) return;
      setState(() {
        _wards = wards;
        _loadingWards = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loadingWards = false);
    }
  }

  void _onProvinceChanged(ProvinceItem? province) {
    if (province == null) return;
    setState(() {
      _selectedProvince = province;
      _selectedWard = null;
      _wards = [];
    });
    _loadWards(province.code);
    // Emit province-level code ngay khi chọn tỉnh
    widget.onLocationSelected(province.locationCode);
  }

  void _onWardChanged(WardItem? ward) {
    if (ward == null) return;
    setState(() => _selectedWard = ward);
    widget.onLocationSelected(ward.locationCode);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primaryColor = const Color(0xFF7C3AED);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Label
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Text(
            'Địa điểm *',
            style: theme.textTheme.labelLarge?.copyWith(
              color: Colors.grey.shade700,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),

        // Province dropdown
        _buildDropdownField<ProvinceItem>(
          hint: _loadingProvinces ? 'Đang tải tỉnh/thành...' : 'Chọn Tỉnh / Thành phố',
          value: _selectedProvince,
          items: _provinces,
          label: (p) => p.fullName,
          onChanged: widget.enabled ? _onProvinceChanged : null,
          prefixIcon: Icons.location_city_outlined,
          primaryColor: primaryColor,
        ),

        const SizedBox(height: 10),

        // Ward dropdown
        _buildDropdownField<WardItem>(
          hint: _selectedProvince == null
              ? 'Chọn tỉnh trước'
              : _loadingWards
                  ? 'Đang tải phường/xã...'
                  : 'Chọn Phường / Xã (tuỳ chọn)',
          value: _selectedWard,
          items: _wards,
          label: (w) => w.fullName,
          onChanged: (widget.enabled && _selectedProvince != null && !_loadingWards)
              ? _onWardChanged
              : null,
          prefixIcon: Icons.place_outlined,
          primaryColor: primaryColor,
        ),

        // Hiển thị locationCode đã chọn
        if (_selectedProvince != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              children: [
                Icon(Icons.check_circle_outline, size: 14, color: primaryColor),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    _selectedWard != null
                        ? '${_selectedWard!.fullName}, ${_selectedProvince!.fullName}'
                        : _selectedProvince!.fullName,
                    style: TextStyle(
                      fontSize: 12,
                      color: primaryColor,
                      fontWeight: FontWeight.w500,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildDropdownField<T>({
    required String hint,
    required T? value,
    required List<T> items,
    required String Function(T) label,
    required ValueChanged<T?>? onChanged,
    required IconData prefixIcon,
    required Color primaryColor,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: value != null ? primaryColor.withOpacity(0.6) : Colors.grey.shade300,
          width: value != null ? 1.5 : 1,
        ),
        boxShadow: [
          if (value != null)
            BoxShadow(
              color: primaryColor.withOpacity(0.06),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
        ],
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<T>(
          value: value,
          hint: Row(
            children: [
              Icon(prefixIcon, size: 18, color: Colors.grey.shade400),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  hint,
                  style: TextStyle(color: Colors.grey.shade500, fontSize: 14),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          isExpanded: true,
          icon: Icon(Icons.keyboard_arrow_down_rounded, color: Colors.grey.shade500),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          borderRadius: BorderRadius.circular(14),
          items: items.map((item) {
            return DropdownMenuItem<T>(
              value: item,
              child: Text(
                label(item),
                style: const TextStyle(fontSize: 14),
                overflow: TextOverflow.ellipsis,
              ),
            );
          }).toList(),
          onChanged: onChanged,
        ),
      ),
    );
  }
}
