import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProfile, updateProfile } from "@/services/user.api";
import { changePasswordWithOtp, requestChangePasswordOtp } from "@/services/auth.api";
import { uploadMedia } from "@/services/upload.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^(\+?84|0)\d{9,10}$/;

function normalizePhone(value: string): string {
  return value.replace(/[\s.-]/g, "");
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
  });

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordStep, setPasswordStep] = useState<"otp" | "password">("otp");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ text: "", type: "" });
  const [passwordMessage, setPasswordMessage] = useState({ text: "", type: "" });

  useEffect(() => {
    if (profile) {
      setFormData({
        fullName: profile.fullName || "",
        phone: profile.phone || "",
        email: profile.email || "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const profileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updatedContext) => {
      queryClient.setQueryData(["profile"], updatedContext);
      queryClient.setQueryData(["profile", "me"], updatedContext);
      setProfileMessage({ text: "Cập nhật hồ sơ thành công", type: "success" });
    },
    onError: (err: { message?: string }) => {
      setProfileMessage({ text: err?.message || "Lỗi khi cập nhật hồ sơ", type: "error" });
    },
  });

  const requestOtpMutation = useMutation({
    mutationFn: requestChangePasswordOtp,
    onSuccess: (data) => {
      setMaskedEmail(data.maskedEmail || "email đã đăng ký");
      setPasswordStep("otp");
      setOtpCode("");
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setPasswordMessage({ text: "OTP đã được gửi, vui lòng kiểm tra email.", type: "success" });
      setPasswordModalOpen(true);
    },
    onError: (err: { message?: string }) => {
      setPasswordMessage({ text: err?.message || "Không thể gửi OTP đổi mật khẩu", type: "error" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: changePasswordWithOtp,
    onSuccess: () => {
      setPasswordMessage({ text: "Đổi mật khẩu thành công", type: "success" });
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setOtpCode("");
      setPasswordModalOpen(false);
      setPasswordStep("otp");
    },
    onError: (err: { message?: string }) => {
      setPasswordMessage({ text: err?.message || "Lỗi khi đổi mật khẩu", type: "error" });
      if ((err?.message || "").toLowerCase().includes("otp")) {
        setPasswordStep("otp");
      }
    },
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      setAvatarUploading(true);
      const res = await uploadMedia({ file, target: "AVATAR" });
      if (!res.key) throw new Error("Không nhận được khóa avatar sau khi upload");
      return updateProfile({ avatarKey: res.key });
    },
    onSuccess: (updatedContext) => {
      queryClient.setQueryData(["profile"], updatedContext);
      queryClient.setQueryData(["profile", "me"], updatedContext);
      setAvatarUploading(false);
      setProfileMessage({ text: "Cập nhật ảnh đại diện thành công", type: "success" });
    },
    onError: (err: { message?: string }) => {
      setAvatarUploading(false);
      setProfileMessage({ text: err?.message || "Lỗi khi cập nhật ảnh đại diện", type: "error" });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage({ text: "", type: "" });

    const normalizedFullName = formData.fullName.trim();
    const normalizedEmail = formData.email.trim();
    const normalizedPhone = normalizePhone(formData.phone.trim());

    if (normalizedFullName.length < 2) {
      setProfileMessage({ text: "Họ và tên cần ít nhất 2 ký tự.", type: "error" });
      return;
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setProfileMessage({ text: "Email không đúng định dạng.", type: "error" });
      return;
    }

    if (!PHONE_REGEX.test(normalizedPhone)) {
      setProfileMessage({ text: "Số điện thoại không hợp lệ.", type: "error" });
      return;
    }

    profileMutation.mutate({
      fullName: normalizedFullName,
      email: normalizedEmail,
      phone: normalizedPhone,
    });
  };

  const handleOpenPasswordModal = () => {
    setPasswordMessage({ text: "", type: "" });
    requestOtpMutation.mutate();
  };

  const handleOtpStepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage({ text: "", type: "" });
    const otp = otpCode.trim();
    if (!otp) {
      setPasswordMessage({ text: "Vui lòng nhập mã OTP", type: "error" });
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setPasswordMessage({ text: "Mã OTP phải gồm đúng 6 chữ số.", type: "error" });
      return;
    }
    setPasswordStep("password");
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage({ text: "", type: "" });
    if (!otpCode.trim()) {
      setPasswordMessage({ text: "Thiếu mã OTP, vui lòng nhập lại", type: "error" });
      setPasswordStep("otp");
      return;
    }
    if (passwordData.currentPassword.trim().length < 8) {
      setPasswordMessage({ text: "Mật khẩu hiện tại phải có ít nhất 8 ký tự.", type: "error" });
      return;
    }
    if (passwordData.newPassword.trim().length < 8) {
      setPasswordMessage({ text: "Mật khẩu mới phải có ít nhất 8 ký tự.", type: "error" });
      return;
    }
    if (passwordData.newPassword === passwordData.currentPassword) {
      setPasswordMessage({ text: "Mật khẩu mới phải khác mật khẩu hiện tại.", type: "error" });
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ text: "Mật khẩu xác nhận không khớp", type: "error" });
      return;
    }

    passwordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
      otpCode: otpCode.trim(),
    });
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      avatarMutation.mutate(file);
    }
  };

  if (isLoading) return <div className="p-8 text-slate-700 dark:text-slate-300">Đang tải hồ sơ...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-8 text-slate-900 dark:text-slate-100">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Cài đặt tài khoản</h1>
        <p className="text-gray-500 dark:text-slate-400 mt-1">Quản lý thông tin cá nhân và bảo mật của bạn</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="p-6 md:p-8">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-6">Hồ sơ cá nhân</h2>
          
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex flex-col items-center gap-4">
              <Avatar className="w-32 h-32 border-4 border-white dark:border-slate-700 shadow-lg">
                {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} />}
                <AvatarFallback className="bg-blue-100 text-blue-700 text-3xl font-semibold">
                  {profile?.fullName?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <input 
                type="file" 
                ref={fileInputRef}
                className="hidden" 
                accept="image/*"
                onChange={handleAvatarChange}
              />
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
              >
                {avatarUploading ? "Đang xử lý..." : "Đổi ảnh đại diện"}
              </Button>
            </div>

            <div className="flex-1">
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                {profileMessage.text && (
                  <div className={`p-3 rounded-lg text-sm ${profileMessage.type === "error" ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"}`}>
                    {profileMessage.text}
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Họ và tên</label>
                    <Input
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="Nhập họ và tên"
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Số điện thoại</label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="09xx xxx xxx"
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Email</label>
                    <Input
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@example.com"
                      type="email"
                      className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={profileMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                    {profileMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 border-t border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/40">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-6">Đổi mật khẩu</h2>

          {passwordMessage.text && !passwordModalOpen && (
            <div className={`mb-4 max-w-md p-3 rounded-lg text-sm ${passwordMessage.type === "error" ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"}`}>
              {passwordMessage.text}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            disabled={requestOtpMutation.isPending}
            onClick={handleOpenPasswordModal}
          >
            {requestOtpMutation.isPending ? "Đang gửi OTP..." : "Đổi mật khẩu"}
          </Button>
        </div>
      </div>

      <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
        <DialogContent className="sm:max-w-md dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100">
          {passwordStep === "otp" ? (
            <form onSubmit={handleOtpStepSubmit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Xác thực OTP</DialogTitle>
                <DialogDescription>
                  Mã OTP đã được gửi đến {maskedEmail || "email đã đăng ký"}. Nhập OTP để tiếp tục đổi mật khẩu.
                </DialogDescription>
              </DialogHeader>

              {passwordMessage.text && (
                <div className={`p-3 rounded-lg text-sm ${passwordMessage.type === "error" ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"}`}>
                  {passwordMessage.text}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Mã OTP</label>
                <Input
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Nhập mã OTP"
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => requestOtpMutation.mutate()}
                  disabled={requestOtpMutation.isPending}
                >
                  {requestOtpMutation.isPending ? "Đang gửi..." : "Gửi lại OTP"}
                </Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">
                  Xác thực OTP
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Đổi mật khẩu</DialogTitle>
                <DialogDescription>
                  OTP đã nhập: {otpCode}. Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.
                </DialogDescription>
              </DialogHeader>

              {passwordMessage.text && (
                <div className={`p-3 rounded-lg text-sm ${passwordMessage.type === "error" ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"}`}>
                  {passwordMessage.text}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Mật khẩu hiện tại</label>
                <Input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  placeholder="Nhập mật khẩu hiện tại"
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Mật khẩu mới</label>
                <Input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  placeholder="Nhập mật khẩu mới"
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Xác nhận mật khẩu mới</label>
                <Input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  placeholder="Xác nhận lại mật khẩu mới"
                  className="dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setPasswordStep("otp")}>
                  Quay lại OTP
                </Button>
                <Button type="submit" disabled={passwordMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {passwordMutation.isPending ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}