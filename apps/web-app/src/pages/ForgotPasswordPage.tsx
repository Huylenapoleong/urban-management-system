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
  return typeof message === "string" && message.trim() ? message : fallback;
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
    <div className="min-h-screen w-screen bg-slate-100 flex items-center justify-center p-4 py-10 overflow-y-auto">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-6 text-center text-white">
          <h1 className="text-2xl font-bold">Quên mật khẩu</h1>
          <p className="text-blue-100 mt-2 text-sm">
            Lấy lại quyền truy cập tài khoản
          </p>
        </div>

        <div className="p-6 space-y-4">
          {message && (
            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-sm">
              {message}
            </div>
          )}
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {!otpRequested ? (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Email hoặc số điện thoại
                </label>
                <Input
                  type="text"
                  placeholder="Nhập email hoặc số điện thoại"
                  value={requestForm.login}
                  onChange={(e) => setRequestForm({ login: e.target.value })}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={requestOtpMutation.isPending}
              >
                {requestOtpMutation.isPending ? "Đang gửi OTP..." : "Gửi OTP"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Email hoặc số điện thoại
                </label>
                <Input
                  type="text"
                  value={confirmForm.login}
                  onChange={(e) =>
                    setConfirmForm({ ...confirmForm, login: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Mã OTP
                </label>
                <Input
                  type="text"
                  placeholder="Nhập mã OTP"
                  value={confirmForm.otpCode}
                  onChange={(e) =>
                    setConfirmForm({ ...confirmForm, otpCode: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
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
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={confirmMutation.isPending}
              >
                {confirmMutation.isPending
                  ? "Đang xác nhận..."
                  : "Đặt lại mật khẩu"}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
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

          <div className="text-center text-sm text-gray-500 mt-4">
            Quay lại{" "}
            <Link
              to="/login"
              className="text-blue-600 font-medium hover:underline"
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
