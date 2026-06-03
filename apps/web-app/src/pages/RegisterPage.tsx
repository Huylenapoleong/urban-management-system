import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/providers/auth-context";
import {
  requestRegisterOtp,
  verifyRegisterOtp,
  type RegisterRequest,
} from "@/services/auth.api";
import {
  listLocationProvinces,
  listLocationWards,
  type LocationProvince,
  type LocationWard,
} from "@/services/location.api";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

function buildWardLocationCode(provinceCode: string, wardCode: string) {
  return `VN-${provinceCode}-${wardCode}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) {
    return fallback;
  }

  const message = (error as { message?: string }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { login: authenticate } = useAuth();
  const [formData, setFormData] = useState<RegisterRequest>({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    locationCode: "",
  });
  const [step, setStep] = useState<"register" | "otp">("register");
  const [otpCode, setOtpCode] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [error, setError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [provinces, setProvinces] = useState<LocationProvince[]>([]);
  const [wards, setWards] = useState<LocationWard[]>([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
  const [selectedWardCode, setSelectedWardCode] = useState("");
  const [isLoadingProvinces, setIsLoadingProvinces] = useState(true);
  const [isLoadingWards, setIsLoadingWards] = useState(false);

  const selectedProvince = useMemo(
    () => provinces.find((province) => province.code === selectedProvinceCode),
    [provinces, selectedProvinceCode],
  );
  const selectedWard = useMemo(
    () => wards.find((ward) => ward.code === selectedWardCode),
    [selectedWardCode, wards],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProvinces() {
      setIsLoadingProvinces(true);
      setLocationError("");

      try {
        const data = await listLocationProvinces();
        if (!cancelled) {
          setProvinces(data);
        }
      } catch (err) {
        if (!cancelled) {
          setLocationError(
            err instanceof Error
              ? err.message
              : "Không thể tải danh sách tỉnh/thành.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProvinces(false);
        }
      }
    }

    void loadProvinces();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedProvinceCode) {
      setWards([]);
      setSelectedWardCode("");
      return;
    }

    let cancelled = false;

    async function loadWards() {
      setIsLoadingWards(true);
      setLocationError("");

      try {
        const data = await listLocationWards(selectedProvinceCode);
        if (!cancelled) {
          setWards(data);
          setSelectedWardCode((currentWardCode) =>
            data.some((ward) => ward.code === currentWardCode)
              ? currentWardCode
              : "",
          );
        }
      } catch (err) {
        if (!cancelled) {
          setWards([]);
          setLocationError(
            err instanceof Error
              ? err.message
              : "Không thể tải danh sách phường/xã.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingWards(false);
        }
      }
    }

    void loadWards();

    return () => {
      cancelled = true;
    };
  }, [selectedProvinceCode]);

  useEffect(() => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      locationCode:
        selectedProvinceCode && selectedWardCode
          ? buildWardLocationCode(selectedProvinceCode, selectedWardCode)
          : "",
    }));
  }, [selectedProvinceCode, selectedWardCode]);

  const requestOtpMutation = useMutation({
    mutationFn: requestRegisterOtp,
    onSuccess: (data) => {
      setStep("otp");
      setError("");
      setOtpMessage(
        `Mã OTP đã được gửi đến email ${data.maskedEmail || formData.email}.`,
      );
    },
    onError: (err: unknown) => {
      setError(
        getErrorMessage(
          err,
          "Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.",
        ),
      );
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: verifyRegisterOtp,
    onSuccess: (data) => {
      if (data.tokens?.accessToken) {
        authenticate(data.tokens.accessToken);
        navigate("/");
      } else {
        setError("Token đăng nhập không được tìm thấy.");
      }
    },
    onError: (err: unknown) => {
      setError(
        getErrorMessage(
          err,
          "Mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại.",
        ),
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.fullName || !formData.password || !formData.email) {
      setError("Vui lòng nhập đầy đủ thông tin bắt buộc (*)");
      return;
    }
    if (!selectedProvinceCode || !selectedWardCode || !formData.locationCode) {
      setError("Vui lòng chọn đầy đủ Tỉnh/Thành và Phường/Xã.");
      return;
    }

    requestOtpMutation.mutate(formData);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOtpMessage("");

    if (!otpCode.trim()) {
      setError("Vui lòng nhập mã OTP.");
      return;
    }
    if (!formData.email) {
      setError("Không tìm thấy thông tin email.");
      return;
    }

    verifyOtpMutation.mutate({
      email: formData.email.trim(),
      otpCode: otpCode.trim(),
    });
  };

  const handleResendOtp = () => {
    setError("");
    setOtpMessage("");
    if (!formData.email) return;
    requestOtpMutation.mutate(formData, {
      onSuccess: (data) => {
        setOtpMessage(
          `Mã OTP đã được gửi lại đến email ${data.maskedEmail || formData.email}.`,
        );
      },
    });
  };

  return (
    <div className="min-h-screen w-screen bg-slate-100 flex items-center justify-center p-4 py-10 overflow-y-auto">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden mt-8 mb-8">
        <div className="bg-blue-600 p-6 text-center text-white">
          <h1 className="text-2xl font-bold">Urban Management System</h1>
          <p className="text-blue-100 mt-2 text-sm">
            {step === "register"
              ? "Đăng ký tài khoản hệ thống"
              : "Xác thực mã OTP đăng ký"}
          </p>
        </div>

        <div className="p-6">
          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {locationError && (
            <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-sm mb-4">
              {locationError}
            </div>
          )}

          {otpMessage && (
            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-sm mb-4">
              {otpMessage}
            </div>
          )}

          {step === "register" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Họ và tên (*)
                </label>
                <Input
                  type="text"
                  placeholder="Nguyễn Văn A"
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Số điện thoại
                </label>
                <Input
                  type="tel"
                  placeholder="09xx xxx xxx"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Email (*)
                </label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Tỉnh / Thành (*)
                  </label>
                  <select
                    value={selectedProvinceCode}
                    onChange={(e) => {
                      setSelectedProvinceCode(e.target.value);
                      setSelectedWardCode("");
                    }}
                    disabled={isLoadingProvinces}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">
                      {isLoadingProvinces ? "Đang tải..." : "Chọn tỉnh/thành"}
                    </option>
                    {provinces.map((province) => (
                      <option key={province.code} value={province.code}>
                        {province.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Phường / Xã (*)
                  </label>
                  <select
                    value={selectedWardCode}
                    onChange={(e) => setSelectedWardCode(e.target.value)}
                    disabled={!selectedProvinceCode || isLoadingWards}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">
                      {!selectedProvinceCode
                        ? "Chọn tỉnh/thành trước"
                        : isLoadingWards
                          ? "Đang tải..."
                          : "Chọn phường/xã"}
                    </option>
                    {wards.map((ward) => (
                      <option key={ward.code} value={ward.code}>
                        {ward.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <p className="font-medium text-slate-700">
                  Địa bàn sẽ gửi lên hệ thống
                </p>
                <p className="mt-1 text-xs">
                  {selectedWard?.fullName ||
                    selectedProvince?.fullName ||
                    "Sẽ được xác định sau khi chọn đầy đủ tỉnh/thành và phường/xã"}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Mật khẩu (*)
                </label>
                <Input
                  type="password"
                  placeholder="Nhập mật khẩu"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="w-full"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4"
                disabled={requestOtpMutation.isPending}
              >
                {requestOtpMutation.isPending ? "Đang gửi OTP..." : "Đăng ký"}
              </Button>

              <div className="text-center text-sm text-gray-500 mt-4">
                Đã có tài khoản?{" "}
                <Link
                  to="/login"
                  className="text-blue-600 font-medium hover:underline"
                >
                  Đăng nhập
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Mã xác thực OTP
                </label>
                <Input
                  type="text"
                  maxLength={6}
                  placeholder="Nhập mã OTP 6 chữ số"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full text-center text-lg tracking-widest font-bold"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4"
                disabled={verifyOtpMutation.isPending}
              >
                {verifyOtpMutation.isPending ? "Đang xác minh..." : "Xác nhận"}
              </Button>

              <div className="flex flex-col space-y-2 mt-4 text-center">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={requestOtpMutation.isPending}
                  className="text-sm text-blue-600 hover:underline font-medium"
                >
                  Gửi lại mã OTP
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("register");
                    setError("");
                    setOtpMessage("");
                  }}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Quay lại chỉnh sửa thông tin
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
