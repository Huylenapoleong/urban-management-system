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
import { useEffect, useState } from "react";
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [error, setError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [provinces, setProvinces] = useState<LocationProvince[]>([]);
  const [wards, setWards] = useState<LocationWard[]>([]);
  const [selectedProvinceCode, setSelectedProvinceCode] = useState("");
  const [selectedWardCode, setSelectedWardCode] = useState("");
  const [isLoadingProvinces, setIsLoadingProvinces] = useState(true);
  const [isLoadingWards, setIsLoadingWards] = useState(false);

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
    if (formData.password !== confirmPassword) {
      setError("Mật khẩu nhập lại không khớp.");
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
    <div className="min-h-screen w-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4 py-10 overflow-y-auto relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-violet-600/15 blur-[100px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-indigo-500/15 blur-[120px] animate-pulse pointer-events-none [animation-delay:2s]" />

      <div className="max-w-2xl w-full bg-slate-900/95 backdrop-blur-2xl rounded-2xl premium-shadow-lg overflow-hidden animate-slide-up relative z-10 border border-white/10 mt-4 mb-4">
        <div className="p-6 text-center border-b border-white/5 bg-white/5">
          <h1 className="text-2xl font-bold tracking-tight gradient-text-purple bg-gradient-to-r from-violet-400 to-indigo-300">
            Urban Management System
          </h1>
          <p className="text-slate-300 mt-1.5 text-sm font-medium">
            {step === "register"
              ? "Đăng ký tài khoản hệ thống"
              : "Xác thực mã OTP đăng ký"}
          </p>
        </div>

        <div className="p-8">
          {error && (
            <div className="bg-red-950/50 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm mb-4 font-medium animate-fade-in">
              {error}
            </div>
          )}

          {locationError && (
            <div className="bg-amber-950/50 border border-amber-500/30 text-amber-400 p-3 rounded-xl text-sm mb-4 font-medium animate-fade-in">
              {locationError}
            </div>
          )}

          {otpMessage && (
            <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-sm mb-4 font-medium animate-fade-in">
              {otpMessage}
            </div>
          )}

          {step === "register" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white">
                    Họ và tên (*)
                  </label>
                  <Input
                    type="text"
                    placeholder="Nguyễn Văn A"
                    value={formData.fullName}
                    onChange={(e) =>
                      setFormData({ ...formData, fullName: e.target.value })
                    }
                    className="w-full bg-slate-950/60 border-white/15 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white">
                    Số điện thoại
                  </label>
                  <Input
                    type="tel"
                    placeholder="09xx xxx xxx"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    className="w-full bg-slate-950/60 border-white/15 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">
                  Email (*)
                </label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full bg-slate-950/60 border-white/15 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white">
                    Tỉnh / Thành (*)
                  </label>
                  <select
                    value={selectedProvinceCode}
                    onChange={(e) => {
                      setSelectedProvinceCode(e.target.value);
                      setSelectedWardCode("");
                    }}
                    disabled={isLoadingProvinces}
                    className="flex h-12 w-full rounded-xl border border-white/15 bg-slate-950/60 text-white px-3 py-2 text-sm focus:outline-none focus:border-violet-500 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="" className="bg-slate-950 text-slate-400">
                      {isLoadingProvinces ? "Đang tải..." : "Chọn tỉnh/thành"}
                    </option>
                    {provinces.map((province) => (
                      <option key={province.code} value={province.code} className="bg-slate-950 text-white">
                        {province.fullName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white">
                    Phường / Xã (*)
                  </label>
                  <select
                    value={selectedWardCode}
                    onChange={(e) => setSelectedWardCode(e.target.value)}
                    disabled={!selectedProvinceCode || isLoadingWards}
                    className="flex h-12 w-full rounded-xl border border-white/15 bg-slate-950/60 text-white px-3 py-2 text-sm focus:outline-none focus:border-violet-500 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="" className="bg-slate-950 text-slate-400">
                      {!selectedProvinceCode
                        ? "Chọn tỉnh/thành trước"
                        : isLoadingWards
                          ? "Đang tải..."
                          : "Chọn phường/xã"}
                    </option>
                    {wards.map((ward) => (
                      <option key={ward.code} value={ward.code} className="bg-slate-950 text-white">
                        {ward.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white">
                    Mật khẩu (*)
                  </label>
                  <Input
                    type="password"
                    placeholder="Nhập mật khẩu"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                    className="w-full bg-slate-950/60 border-white/15 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12 text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-white">
                    Nhập lại mật khẩu (*)
                  </label>
                  <Input
                    type="password"
                    placeholder="Xác nhận lại mật khẩu"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-950/60 border-white/15 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12 text-sm"
                  />
                </div>
              </div>

              <div className="text-[11px] text-slate-400 space-y-1 bg-slate-950/40 p-3 rounded-xl border border-white/5 font-medium leading-relaxed mt-1">
                <p className="text-slate-300 font-semibold mb-0.5">Yêu cầu mật khẩu:</p>
                <ul className="list-disc pl-3.5 space-y-1 text-slate-300">
                  <li>Độ dài 10 - 64 ký tự; gồm ít nhất 3 nhóm: chữ thường, chữ hoa, số hoặc ký tự đặc biệt</li>
                  <li>Không chứa khoảng trắng, ký tự lặp liên tiếp hơn 3 lần hoặc chứa thông tin cá nhân</li>
                </ul>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white mt-4 h-12 rounded-xl shadow-lg shadow-violet-500/10 custom-button-pulse font-semibold text-sm"
                disabled={requestOtpMutation.isPending}
              >
                {requestOtpMutation.isPending ? "Đang gửi OTP..." : "Đăng ký"}
              </Button>

              <div className="text-center text-xs text-slate-400 mt-3.5">
                Đã có tài khoản?{" "}
                <Link
                  to="/login"
                  className="text-violet-400 font-semibold hover:text-violet-300 hover:underline"
                >
                  Đăng nhập
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">
                  Mã xác thực OTP
                </label>
                <Input
                  type="text"
                  maxLength={6}
                  placeholder="Nhập mã OTP 6 chữ số"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  className="w-full text-center text-lg tracking-widest font-bold bg-slate-950/60 border-white/15 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white mt-4 rounded-xl shadow-lg shadow-violet-500/10 custom-button-pulse font-semibold"
                disabled={verifyOtpMutation.isPending}
              >
                {verifyOtpMutation.isPending ? "Đang xác minh..." : "Xác nhận"}
              </Button>

              <div className="flex flex-col space-y-2 mt-4 text-center">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={requestOtpMutation.isPending}
                  className="text-sm text-violet-400 hover:text-violet-300 hover:underline font-semibold"
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
                  className="text-xs text-slate-400 hover:text-slate-300 hover:underline"
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
