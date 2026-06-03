import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/providers/auth-context";
import {
  requestLoginOtp,
  verifyLoginOtp,
  type LoginRequest,
} from "@/services/auth.api";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) {
    return fallback;
  }

  const message = (error as { message?: string }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function getRedirectPath(state: unknown): string {
  if (typeof state !== "object" || state === null || !("from" in state)) {
    return "/";
  }

  const from = (state as { from?: unknown }).from;
  if (typeof from !== "object" || from === null || !("pathname" in from)) {
    return "/";
  }

  const pathname = (from as { pathname?: unknown }).pathname;
  return typeof pathname === "string" && pathname.trim() ? pathname : "/";
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login: authenticate } = useAuth();
  const [formData, setFormData] = useState<LoginRequest>({
    login: "",
    password: "",
  });
  const [step, setStep] = useState<"login" | "otp">("login");
  const [otpCode, setOtpCode] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
  const [error, setError] = useState("");

  const requestOtpMutation = useMutation({
    mutationFn: requestLoginOtp,
    onSuccess: (data) => {
      setStep("otp");
      setError("");
      setOtpMessage(
        `Mã OTP đã được gửi đến email ${data.maskedEmail || formData.login}.`,
      );
    },
    onError: (err: unknown) => {
      setError(
        getErrorMessage(
          err,
          "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.",
        ),
      );
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: verifyLoginOtp,
    onSuccess: (data) => {
      if (data.tokens?.accessToken) {
        authenticate(data.tokens.accessToken);
        const from = getRedirectPath(location.state);
        navigate(from, { replace: true });
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
    if (!formData.login || !formData.password) {
      setError("Vui lòng nhập tên đăng nhập và mật khẩu");
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

    verifyOtpMutation.mutate({
      login: formData.login.trim(),
      otpCode: otpCode.trim(),
    });
  };

  const handleResendOtp = () => {
    setError("");
    setOtpMessage("");
    requestOtpMutation.mutate(formData, {
      onSuccess: (data) => {
        setOtpMessage(
          `Mã OTP đã được gửi lại đến email ${data.maskedEmail || formData.login}.`,
        );
      },
    });
  };

  return (
    <div className="min-h-screen w-screen bg-slate-100 flex items-center justify-center p-4 py-10 overflow-y-auto">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-6 text-center text-white">
          <h1 className="text-2xl font-bold">Urban Management System</h1>
          <p className="text-blue-100 mt-2 text-sm">
            {step === "login"
              ? "Đăng nhập tài khoản của bạn"
              : "Xác thực mã OTP đăng nhập"}
          </p>
        </div>

        <div className="p-6">
          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {otpMessage && (
            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-sm mb-4">
              {otpMessage}
            </div>
          )}

          {step === "login" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Tên đăng nhập / Email
                </label>
                <Input
                  type="text"
                  placeholder="Nhập email hoặc số điện thoại"
                  value={formData.login}
                  onChange={(e) =>
                    setFormData({ ...formData, login: e.target.value })
                  }
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Mật khẩu
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    Quên mật khẩu?
                  </Link>
                </div>
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
                {requestOtpMutation.isPending ? "Đang xử lý..." : "Đăng nhập"}
              </Button>

              <div className="text-center text-sm text-gray-500 mt-4">
                Chưa có tài khoản?{" "}
                <Link
                  to="/register"
                  className="text-blue-600 font-medium hover:underline"
                >
                  Đăng ký ngay
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
                    setStep("login");
                    setError("");
                    setOtpMessage("");
                  }}
                  className="text-xs text-gray-500 hover:underline"
                >
                  Quay lại đăng nhập bằng mật khẩu
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
