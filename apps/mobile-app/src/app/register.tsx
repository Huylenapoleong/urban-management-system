import React, { useMemo, useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { Text, TextInput, Button, Surface, HelperText, Chip } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '../providers/AuthProvider';
import { OtpVerificationModal } from '../components/auth/OtpVerificationModal';
import colors from '@/constants/colors';

type WardOption = {
  code: string;
  label: string;
};

type DistrictOption = {
  code: string;
  label: string;
  wards: WardOption[];
};

type ProvinceOption = {
  code: string;
  label: string;
  districts: DistrictOption[];
};

const LOCATION_OPTIONS: ProvinceOption[] = [
  {
    code: 'HCM',
    label: 'TP Ho Chi Minh',
    districts: [
      {
        code: 'BQ1',
        label: 'Quan 1',
        wards: [
          { code: 'P01', label: 'Phuong 1' },
          { code: 'P02', label: 'Phuong 2' },
          { code: 'P03', label: 'Phuong 3' },
        ],
      },
      {
        code: 'BQ3',
        label: 'Quan 3',
        wards: [
          { code: 'P01', label: 'Phuong 1' },
          { code: 'P02', label: 'Phuong 2' },
          { code: 'P03', label: 'Phuong 3' },
        ],
      },
    ],
  },
  {
    code: 'HN',
    label: 'Ha Noi',
    districts: [
      {
        code: 'BD',
        label: 'Ba Dinh',
        wards: [
          { code: 'P01', label: 'Phuong 1' },
          { code: 'P02', label: 'Phuong 2' },
        ],
      },
      {
        code: 'CG',
        label: 'Cau Giay',
        wards: [
          { code: 'P01', label: 'Phuong 1' },
          { code: 'P02', label: 'Phuong 2' },
        ],
      },
    ],
  },
];

type RegisterForm = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  selectedProvince: string;
  selectedDistrict: string;
  selectedWard: string;
};

export default function RegisterScreen() {
  const router = useRouter();
  const { register, requestRegisterOtp, verifyRegisterOtp } = useAuth();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [form, setForm] = useState<RegisterForm>({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    selectedProvince: '',
    selectedDistrict: '',
    selectedWard: '',
  });

  const hasIdentity = useMemo(() => Boolean(form.phone.trim() || form.email.trim()), [form.phone, form.email]);
  const selectedProvince = useMemo(
    () => LOCATION_OPTIONS.find((item) => item.code === form.selectedProvince),
    [form.selectedProvince],
  );
  const districtOptions = selectedProvince?.districts ?? [];
  const selectedDistrict = useMemo(
    () => districtOptions.find((item) => item.code === form.selectedDistrict),
    [districtOptions, form.selectedDistrict],
  );
  const wardOptions = selectedDistrict?.wards ?? [];

  const locationCode = useMemo(() => {
    const province = form.selectedProvince.trim().toUpperCase();
    const district = form.selectedDistrict.trim().toUpperCase();
    const ward = form.selectedWard.trim().toUpperCase();

    if (!province || !district || !ward) {
      return '';
    }

    return `VN-${province}-${district}-${ward}`;
  }, [form.selectedProvince, form.selectedDistrict, form.selectedWard]);

  const setField = (field: keyof RegisterForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const chooseProvince = (provinceCode: string) => {
    setForm((prev) => ({
      ...prev,
      selectedProvince: provinceCode,
      selectedDistrict: '',
      selectedWard: '',
    }));
  };

  const chooseDistrict = (districtCode: string) => {
    setForm((prev) => ({
      ...prev,
      selectedDistrict: districtCode,
      selectedWard: '',
    }));
  };

  const handleRegister = async () => {
    setErrorMsg('');

    if (!form.fullName.trim() || !form.password) {
      setErrorMsg('Vui lòng nhập họ tên và mật khẩu.');
      return;
    }

    if (!locationCode) {
      setErrorMsg('Vui lòng chọn đủ Tỉnh/TP, Quận/Huyện và Phường/Xã.');
      return;
    }

    if (!hasIdentity) {
      setErrorMsg('Vui lòng nhập ít nhất số điện thoại hoặc email.');
      return;
    }

    if (form.password.length < 10) {
      setErrorMsg('Mật khẩu phải có ít nhất 10 ký tự.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setErrorMsg('Mật khẩu xác nhận không khớp.');
      return;
    }

    try {
      setLoading(true);
      // Initiate OTP flow instead of direct registration
      await requestRegisterOtp(form.email.trim());
      setShowOtpModal(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể gửi mã xác thực. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (otpCode: string) => {
    try {
      setOtpLoading(true);
      await verifyRegisterOtp(form.email.trim(), otpCode);
      // Auth provider will handle navigation after successful registration
    } catch (err: any) {
      throw err; // Modal will handle display
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    await requestRegisterOtp(form.email.trim());
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Surface style={styles.card} elevation={3}>
          <Text variant="headlineSmall" style={styles.title}>Tạo tài khoản cư dân</Text>
          <Text style={styles.subtitle}>Đăng ký dành cho cư dân. Tài khoản cán bộ do quản trị cấp.</Text>

          <TextInput
            mode="outlined"
            label="Họ và tên"
            value={form.fullName}
            onChangeText={(value) => setField('fullName', value)}
            style={styles.input}
            disabled={loading}
          />

          <TextInput
            mode="outlined"
            label="Số điện thoại"
            value={form.phone}
            onChangeText={(value) => setField('phone', value)}
            keyboardType="phone-pad"
            style={styles.input}
            disabled={loading}
          />

          <TextInput
            mode="outlined"
            label="Email"
            value={form.email}
            onChangeText={(value) => setField('email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            disabled={loading}
          />

          <Text style={styles.sectionLabel}>Khu vực cư trú</Text>
          <Text style={styles.optionLabel}>1. Chọn Tỉnh/TP</Text>
          <View style={styles.optionWrap}>
            {LOCATION_OPTIONS.map((province) => (
              <Chip
                key={province.code}
                selected={form.selectedProvince === province.code}
                onPress={() => chooseProvince(province.code)}
                style={styles.optionChip}
                mode="outlined"
              >
                {province.label}
              </Chip>
            ))}
          </View>

          <Text style={styles.optionLabel}>2. Chọn Quận/Huyện</Text>
          <View style={styles.optionWrap}>
            {districtOptions.length > 0 ? (
              districtOptions.map((district) => (
                <Chip
                  key={district.code}
                  selected={form.selectedDistrict === district.code}
                  onPress={() => chooseDistrict(district.code)}
                  style={styles.optionChip}
                  mode="outlined"
                >
                  {district.label}
                </Chip>
              ))
            ) : (
              <Text style={styles.optionHint}>Vui lòng chọn Tỉnh/TP trước.</Text>
            )}
          </View>

          <Text style={styles.optionLabel}>3. Chọn Phường/Xã</Text>
          <View style={styles.optionWrap}>
            {wardOptions.length > 0 ? (
              wardOptions.map((ward) => (
                <Chip
                  key={ward.code}
                  selected={form.selectedWard === ward.code}
                  onPress={() => setField('selectedWard', ward.code)}
                  style={styles.optionChip}
                  mode="outlined"
                >
                  {ward.label}
                </Chip>
              ))
            ) : (
              <Text style={styles.optionHint}>Vui lòng chọn Quận/Huyện trước.</Text>
            )}
          </View>

          <HelperText type="info" visible>
            {locationCode
              ? `Mã khu vực tạo tự động: ${locationCode}`
              : 'Chọn 3 cấp khu vực bên trên, hệ thống sẽ tự tạo mã VN-...'}
          </HelperText>

          <TextInput
            mode="outlined"
            label="Mật khẩu"
            value={form.password}
            onChangeText={(value) => setField('password', value)}
            secureTextEntry
            style={styles.input}
            disabled={loading}
          />

          <TextInput
            mode="outlined"
            label="Nhập lại mật khẩu"
            value={form.confirmPassword}
            onChangeText={(value) => setField('confirmPassword', value)}
            secureTextEntry
            style={styles.input}
            disabled={loading}
          />

          {!!errorMsg && (
            <HelperText type="error" visible={!!errorMsg}>
              {errorMsg}
            </HelperText>
          )}

          <Button mode="contained" onPress={handleRegister} disabled={loading} style={styles.button}>
            Đăng ký cư dân
          </Button>
          <View style={styles.footer}>
            <Text>Bạn đã có tài khoản? </Text>
            <Pressable onPress={() => router.push('/login')}>
              <Text style={styles.link}>Đăng nhập</Text>
            </Pressable>
          </View>
        </Surface>

        <OtpVerificationModal
          visible={showOtpModal}
          onDismiss={() => setShowOtpModal(false)}
          onVerify={handleVerifyOtp}
          onResend={handleResendOtp}
          loading={otpLoading}
          loginIdentifier={form.email}
          subtitle="Chúng tôi đã gửi mã xác thực đến email của bạn."
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 18,
    paddingVertical: 28,
  },
  card: {
    borderRadius: 18,
    backgroundColor: colors.card,
    padding: 18,
  },
  title: {
    fontWeight: '700',
    marginBottom: 6,
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: 16,
  },
  input: {
    marginBottom: 10,
  },
  sectionLabel: {
    marginTop: 4,
    marginBottom: 6,
    color: colors.text,
    fontWeight: '700',
  },
  optionLabel: {
    marginTop: 6,
    marginBottom: 8,
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  optionChip: {
    backgroundColor: colors.card,
  },
  optionHint: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  button: {
    marginTop: 8,
    borderRadius: 12,
  },
  footer: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  link: {
    color: colors.secondary,
    fontWeight: '700',
  },
});
