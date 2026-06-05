import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmForgotPassword,
  requestForgotPasswordOtp,
  type ForgotPasswordConfirmRequest,
  type ForgotPasswordRequest,
} from "@/services/auth.api";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

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

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [requestForm, setRequestForm] = useState<ForgotPasswordRequest>({
    login: "",
  });
  const [confirmForm, setConfirmForm] = useState<ForgotPasswordConfirmRequest>({
    login: "",
    otpCode: "",
    newPassword: "",
  });
  const [otpRequested, setOtpRequested] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const requestOtpMutation = useMutation({
    mutationFn: requestForgotPasswordOtp,
    onSuccess: () => {
      setOtpRequested(true);
      setError("");
      setMessage("OTP đã được gửi nếu tài khoản hợp lệ và có email.");
      setConfirmForm((prev) => ({ ...prev, login: requestForm.login.trim() }));
    },
    onError: (err: unknown) => {
      setError(getErrorMessage(err, "Không thể gửi OTP. Vui lòng thử lại."));
      setMessage("");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: confirmForgotPassword,
    onSuccess: () => {
      setError("");
      setMessage("Đặt lại mật khẩu thành công. Đang chuyển sang đăng nhập...");
      setTimeout(() => {
        navigate("/login");
      }, 1200);
    },
    onError: (err: unknown) => {
      setError(getErrorMessage(err, "OTP không hợp lệ hoặc đã hết hạn."));
      setMessage("");
    },
  });

  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!requestForm.login.trim()) {
      setError("Vui lòng nhập email hoặc số điện thoại.");
      return;
    }

    requestOtpMutation.mutate({ login: requestForm.login.trim() });
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (
      !confirmForm.login.trim() ||
      !confirmForm.otpCode.trim() ||
      !confirmForm.newPassword
    ) {
      setError("Vui lòng nhập đầy đủ thông tin.");
      return;
    }

    confirmMutation.mutate({
      login: confirmForm.login.trim(),
      otpCode: confirmForm.otpCode.trim(),
      newPassword: confirmForm.newPassword,
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
            Quên mật khẩu
          </h1>
          <p className="text-slate-300 mt-2 text-sm font-medium">
            Lấy lại quyền truy cập tài khoản
          </p>
        </div>

        <div className="p-8 space-y-4">
          {message && (
            <div className="bg-emerald-950/50 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-sm font-medium">
              {message}
            </div>
          )}
          {error && (
            <div className="bg-red-950/50 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          {!otpRequested ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">
                  Email hoặc số điện thoại
                </label>
                <Input
                  type="text"
                  placeholder="Nhập email hoặc số điện thoại"
                  value={requestForm.login}
                  onChange={(e) => setRequestForm({ login: e.target.value })}
                  className="w-full bg-slate-950/60 border-white/15 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12 text-sm"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white mt-4 h-12 rounded-xl shadow-lg shadow-violet-500/10 custom-button-pulse font-semibold text-sm"
                disabled={requestOtpMutation.isPending}
              >
                {requestOtpMutation.isPending ? "Đang gửi OTP..." : "Gửi OTP"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">
                  Email hoặc số điện thoại
                </label>
                <Input
                  type="text"
                  value={confirmForm.login}
                  onChange={(e) =>
                    setConfirmForm({ ...confirmForm, login: e.target.value })
                  }
                  className="w-full bg-slate-950/60 border-white/15 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">
                  Mã OTP
                </label>
                <Input
                  type="text"
                  placeholder="Nhập mã OTP"
                  value={confirmForm.otpCode}
                  onChange={(e) =>
                    setConfirmForm({ ...confirmForm, otpCode: e.target.value })
                  }
                  className="w-full bg-slate-950/60 border-white/15 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12 text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-white">
                  Mật khẩu mới
                </label>
                <Input
                  type="password"
                  placeholder="Tối thiểu 10 ký tự"
                  value={confirmForm.newPassword}
                  onChange={(e) =>
                    setConfirmForm({
                      ...confirmForm,
                      newPassword: e.target.value,
                    })
                  }
                  className="w-full bg-slate-950/60 border-white/15 focus:bg-slate-950/80 focus:border-violet-500 focus:ring-violet-500/20 text-white rounded-xl placeholder:text-slate-400 h-12 text-sm"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white mt-4 h-12 rounded-xl shadow-lg shadow-violet-500/10 custom-button-pulse font-semibold text-sm"
                disabled={confirmMutation.isPending}
              >
                {confirmMutation.isPending
                  ? "Đang xác nhận..."
                  : "Đặt lại mật khẩu"}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full border-white/10 bg-transparent text-slate-300 hover:bg-white/5 hover:text-white rounded-xl mt-2 h-12 text-sm font-semibold"
                onClick={() => {
                  setOtpRequested(false);
                  setError("");
                  setMessage("");
                }}
              >
                Gửi OTP lại
              </Button>
            </form>
          )}

          <div className="text-center text-sm text-slate-400 mt-4">
            Quay lại{" "}
            <Link
              to="/login"
              className="text-violet-400 font-semibold hover:text-violet-300 hover:underline"
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
