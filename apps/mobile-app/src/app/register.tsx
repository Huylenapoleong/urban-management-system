import colors from "@/constants/colors";
import {
  listLocationProvinces,
  listLocationWards,
  type LocationProvince,
  type LocationWard,
} from "@/services/api/location.api";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Chip,
  HelperText,
  Surface,
  Text,
  TextInput,
} from "react-native-paper";
import { OtpVerificationModal } from "../components/auth/OtpVerificationModal";
import { useAuth } from "../providers/AuthProvider";

type RegisterForm = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  selectedProvince: string;
  selectedWard: string;
};

export default function RegisterScreen() {
  const router = useRouter();
  const { requestRegisterOtp, verifyRegisterOtp } = useAuth();

  const [loading, setLoading] = useState(false);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingWards, setLoadingWards] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [provinceOptions, setProvinceOptions] = useState<LocationProvince[]>(
    [],
  );
  const [wardOptions, setWardOptions] = useState<LocationWard[]>([]);
  const [form, setForm] = useState<RegisterForm>({
    fullName: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    selectedProvince: "",
    selectedWard: "",
  });

  useEffect(() => {
    let isMounted = true;

    const loadProvinces = async () => {
      try {
        setLoadingProvinces(true);
        const provinces = await listLocationProvinces();

        if (isMounted) {
          setProvinceOptions(provinces);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err?.message || "Khong the tai danh sach tinh/thanh.");
        }
      } finally {
        if (isMounted) {
          setLoadingProvinces(false);
        }
      }
    };

    void loadProvinces();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!form.selectedProvince) {
      setWardOptions([]);
      return () => {
        isMounted = false;
      };
    }

    const loadWards = async () => {
      try {
        setLoadingWards(true);
        const wards = await listLocationWards(form.selectedProvince);

        if (isMounted) {
          setWardOptions(wards);
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err?.message || "Khong the tai danh sach phuong/xa.");
        }
      } finally {
        if (isMounted) {
          setLoadingWards(false);
        }
      }
    };

    void loadWards();

    return () => {
      isMounted = false;
    };
  }, [form.selectedProvince]);

  const selectedProvince = useMemo(
    () => provinceOptions.find((item) => item.code === form.selectedProvince),
    [form.selectedProvince, provinceOptions],
  );

  const locationCode = useMemo(() => {
    const provinceCode = form.selectedProvince.trim();
    const wardCode = form.selectedWard.trim();

    if (!provinceCode || !wardCode) {
      return "";
    }

    return `VN-${provinceCode}-${wardCode}`;
  }, [form.selectedProvince, form.selectedWard]);
  const selectedProvinceLabel = useMemo(
    () =>
      provinceOptions.find(
        (province) => province.code === form.selectedProvince,
      )?.fullName || "",
    [form.selectedProvince, provinceOptions],
  );
  const selectedWardLabel = useMemo(
    () =>
      wardOptions.find((ward) => ward.code === form.selectedWard)?.fullName ||
      "",
    [form.selectedWard, wardOptions],
  );

  const setField = (field: keyof RegisterForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const chooseProvince = (provinceCode: string) => {
    setForm((prev) => ({
      ...prev,
      selectedProvince: provinceCode,
      selectedWard: "",
    }));
  };

  const buildRegisterOtpPayload = () => ({
    fullName: form.fullName.trim(),
    password: form.password,
    locationCode,
    ...(form.email.trim() ? { email: form.email.trim() } : {}),
    ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
  });

  const handleRegister = async () => {
    setErrorMsg("");

    if (!form.fullName.trim() || !form.password) {
      setErrorMsg("Vui long nhap ho ten va mat khau.");
      return;
    }

    if (!locationCode) {
      setErrorMsg("Vui long chon du Tinh/TP va Phuong/Xa.");
      return;
    }

    if (!form.email.trim()) {
      setErrorMsg("Vui long nhap email de nhan OTP dang ky.");
      return;
    }

    if (form.password.length < 10) {
      setErrorMsg("Mat khau phai co it nhat 10 ky tu.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setErrorMsg("Mat khau xac nhan khong khop.");
      return;
    }

    try {
      setLoading(true);
      await requestRegisterOtp(buildRegisterOtpPayload());
      setShowOtpModal(true);
    } catch (err: any) {
      setErrorMsg(
        err?.message || "Khong the gui ma xac thuc. Vui long thu lai.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (otpCode: string) => {
    try {
      setOtpLoading(true);
      await verifyRegisterOtp(form.email.trim(), otpCode);
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    await requestRegisterOtp(buildRegisterOtpPayload());
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Surface style={styles.card} elevation={3}>
          <Text variant="headlineSmall" style={styles.title}>
            Tạo tài khoản cư dân
          </Text>
          <Text style={styles.subtitle}>
            Đăng ký dành cho cư dân. Tài khoản cán bộ do quản trị cấp.
          </Text>

          <TextInput
            mode="outlined"
            label="Họ và tên"
            value={form.fullName}
            onChangeText={(value) => setField("fullName", value)}
            style={styles.input}
            disabled={loading}
          />

          <TextInput
            mode="outlined"
            label="Số điện thoại"
            value={form.phone}
            onChangeText={(value) => setField("phone", value)}
            keyboardType="phone-pad"
            style={styles.input}
            disabled={loading}
          />

          <TextInput
            mode="outlined"
            label="Email"
            value={form.email}
            onChangeText={(value) => setField("email", value)}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            disabled={loading}
          />

          <Text style={styles.sectionLabel}>Khu vực cư trú</Text>
          <Text style={styles.optionLabel}>1. Chọn Tỉnh/TP</Text>
          <View style={styles.optionWrap}>
            {loadingProvinces ? (
              <Text style={styles.optionHint}>
                Dang tai danh sach tinh/thanh...
              </Text>
            ) : (
              provinceOptions.map((province) => (
                <Chip
                  key={province.code}
                  selected={form.selectedProvince === province.code}
                  onPress={() => chooseProvince(province.code)}
                  style={styles.optionChip}
                  mode="outlined"
                >
                  {province.fullName}
                </Chip>
              ))
            )}
          </View>

          <Text style={styles.optionLabel}>2. Chọn Phường/Xã</Text>
          <View style={styles.optionWrap}>
            {!selectedProvince ? (
              <Text style={styles.optionHint}>
                Vui long chon Tinh/TP truoc.
              </Text>
            ) : loadingWards ? (
              <Text style={styles.optionHint}>
                Dang tai danh sach phuong/xa...
              </Text>
            ) : wardOptions.length > 0 ? (
              wardOptions.map((ward) => (
                <Chip
                  key={ward.code}
                  selected={form.selectedWard === ward.code}
                  onPress={() => setField("selectedWard", ward.code)}
                  style={styles.optionChip}
                  mode="outlined"
                >
                  {ward.fullName}
                </Chip>
              ))
            ) : (
              <Text style={styles.optionHint}>
                Khong co phuong/xa kha dung cho tinh/thanh da chon.
              </Text>
            )}
          </View>

          <HelperText type="info" visible>
            {selectedWardLabel ||
              selectedProvinceLabel ||
              "Chon tinh va phuong/xa ben tren, he thong se gan dia ban tu dong."}
          </HelperText>

          <TextInput
            mode="outlined"
            label="Mật khẩu"
            value={form.password}
            onChangeText={(value) => setField("password", value)}
            secureTextEntry
            style={styles.input}
            disabled={loading}
          />

          <TextInput
            mode="outlined"
            label="Nhập lại mật khẩu"
            value={form.confirmPassword}
            onChangeText={(value) => setField("confirmPassword", value)}
            secureTextEntry
            style={styles.input}
            disabled={loading}
          />

          {!!errorMsg && (
            <HelperText type="error" visible={!!errorMsg}>
              {errorMsg}
            </HelperText>
          )}

          <Button
            mode="contained"
            onPress={handleRegister}
            disabled={loading || loadingProvinces}
            style={styles.button}
          >
            Đăng ký cư dân
          </Button>
          <View style={styles.footer}>
            <Text>Bạn đã có tài khoản? </Text>
            <Pressable onPress={() => router.push("/login")}>
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
    fontWeight: "700",
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
    fontWeight: "700",
  },
  optionLabel: {
    marginTop: 6,
    marginBottom: 8,
    color: colors.textSecondary,
    fontWeight: "600",
    fontSize: 13,
  },
  optionWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  link: {
    color: colors.secondary,
    fontWeight: "700",
  },
});
