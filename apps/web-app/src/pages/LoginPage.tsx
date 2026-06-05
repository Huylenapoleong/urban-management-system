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
  if (typeof message === "string" && message.trim()) {
    const msg = message.trim();
    if (msg.includes("Invalid credential")) return "Tài khoản hoặc mật khẩu không đúng.";
    if (msg.includes("Invalid OTP")) return "Mã OTP không hợp lệ hoặc đã hết hạn.";
    if (msg.includes("Current password is invalid")) return "Mật khẩu hiện tại không đúng.";
    if (msg.includes("unavailable")) return "Tài khoản đã bị khóa hoặc không tồn tại.";
    if (msg.includes("phone already exists")) return "Số điện thoại đã được đăng ký.";
    if (msg.includes("email already exists")) return "Email đã được đăng ký.";
    if (msg.includes("already exists")) return "Thông tin đã tồn tại trong hệ thống.";
    if (msg.includes("Session not found")) return "Phiên đăng nhập không tồn tại.";
    return msg;
  }
  return fallback;
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
    <div className="min-h-screen w-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4 py-10 overflow-y-auto relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-violet-600/15 blur-[100px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-indigo-500/15 blur-[120px] animate-pulse pointer-events-none [animation-delay:2s]" />

      <div className="max-w-md w-full bg-slate-900/95 backdrop-blur-2xl rounded-2xl premium-shadow-lg overflow-hidden animate-slide-up relative z-10 border border-white/10">
        <div className="p-8 text-center border-b border-white/5 bg-white/5">
          <h1 className="text-2xl font-bold tracking-tight gradient-text-purple bg-gradient-to-r from-violet-400 to-indigo-300">
            Urban Management System
          </h1>
          <p className="text-slate-300 mt-2 text-sm font-medium">
            {step === "login"
              ? "Đăng nhập tài khoản của bạn"
              : "Xác thực mã OTP đăng nhập"}
          </p>
        </div>

        <div className="p-8">
          {error && (
            <div className="bg-red-950/50 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm mb-4 font-medium">
              {error}
            </div>
          )}

          {otpMessage && (
            <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-sm mb-4 font-medium">
              {otpMessage}
            </div>
          )}

          {step === "login" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">
                  Tên đăng nhập / Email
                </label>
                <Input
                  type="text"
                  placeholder="Nhập email hoặc số điện thoại"
                  value={formData.login}
                  onChange={(e) =>
                    setFormData({ ...formData, login: e.target.value })
                  }
                  className="w-full bg-slate-950/60 border-white/10 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12 text-sm"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-white">
                    Mật khẩu
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold text-violet-400 hover:text-violet-300 hover:underline"
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
                  className="w-full bg-slate-950/60 border-white/10 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12 text-sm"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white mt-4 h-12 rounded-xl shadow-lg shadow-violet-500/10 custom-button-pulse font-semibold text-sm"
                disabled={requestOtpMutation.isPending}
              >
                {requestOtpMutation.isPending ? "Đang xử lý..." : "Đăng nhập"}
              </Button>

              <div className="text-center text-sm text-slate-400 mt-4">
                Chưa có tài khoản?{" "}
                <Link
                  to="/register"
                  className="text-violet-400 font-semibold hover:text-violet-300 hover:underline"
                >
                  Đăng ký ngay
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
                  className="w-full text-center text-lg tracking-widest font-bold bg-slate-950/60 border-white/10 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white mt-4 h-12 rounded-xl shadow-lg shadow-violet-500/10 custom-button-pulse font-semibold text-sm"
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
                    setStep("login");
                    setError("");
                    setOtpMessage("");
                  }}
                  className="text-xs text-slate-400 hover:text-slate-300 hover:underline"
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
