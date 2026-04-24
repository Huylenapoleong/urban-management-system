import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/providers/auth-context";
import { login, type LoginRequest } from "@/services/auth.api";
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

export function LoginPage() {
  const navigate = useNavigate();
  const { login: authenticate } = useAuth();
  const [formData, setFormData] = useState<LoginRequest>({
    login: "",
    password: "",
  });
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: login,
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
          "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.",
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
    loginMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen w-screen bg-slate-100 flex items-center justify-center p-4 py-10 overflow-y-auto">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-blue-600 p-6 text-center text-white">
          <h1 className="text-2xl font-bold">Urban Management OTT</h1>
          <p className="text-blue-100 mt-2 text-sm">
            Đăng nhập tài khoản của bạn
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? "Đang xử lý..." : "Đăng nhập"}
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
      </div>
    </div>
  );
}
