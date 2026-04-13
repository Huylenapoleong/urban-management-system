import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProfile, updateProfile, changePassword } from "@/services/user.api";
import { uploadMedia } from "@/services/upload.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

  const [passwordData, setPasswordData] = useState({
    oldPassword: "",
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
      setProfileMessage({ text: "Cập nhật hồ sơ thành công", type: "success" });
    },
    onError: (err: { message?: string }) => {
      setProfileMessage({ text: err?.message || "Lỗi khi cập nhật hồ sơ", type: "error" });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setPasswordMessage({ text: "Đổi mật khẩu thành công", type: "success" });
      setPasswordData({ oldPassword: "", newPassword: "", confirmPassword: "" });
    },
    onError: (err: { message?: string }) => {
      setPasswordMessage({ text: err?.message || "Lỗi khi đổi mật khẩu", type: "error" });
    },
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      setAvatarUploading(true);
      const res = await uploadMedia({ file, target: "AVATAR" });
      if (!res.url) throw new Error("Không nhận được URL sau khi upload");
      return updateProfile({ avatarUrl: res.url });
    },
    onSuccess: (updatedContext) => {
      queryClient.setQueryData(["profile"], updatedContext);
      setAvatarUploading(false);
    },
    onError: (err: { message?: string }) => {
      setAvatarUploading(false);
      setProfileMessage({ text: err?.message || "Lỗi khi cập nhật ảnh đại diện", type: "error" });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage({ text: "", type: "" });
    profileMutation.mutate(formData);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage({ text: "", type: "" });
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ text: "Mật khẩu xác nhận không khớp", type: "error" });
      return;
    }
    passwordMutation.mutate({
      currentPassword: passwordData.oldPassword,
      newPassword: passwordData.newPassword,
    });
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      avatarMutation.mutate(file);
    }
  };

  if (isLoading) return <div className="p-8">Đang tải hồ sơ...</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cài đặt tài khoản</h1>
        <p className="text-gray-500 mt-1">Quản lý thông tin cá nhân và bảo mật của bạn</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 md:p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Hồ sơ cá nhân</h2>
          
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex flex-col items-center gap-4">
              <Avatar className="w-32 h-32 border-4 border-white shadow-lg">
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
                    <label className="text-sm font-medium text-gray-700">Họ và tên</label>
                    <Input
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="Nhập họ và tên"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Số điện thoại</label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="09xx xxx xxx"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-gray-700">Email</label>
                    <Input
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@example.com"
                      type="email"
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

        <div className="p-6 md:p-8 border-t border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Đổi mật khẩu</h2>
          
          <form onSubmit={handlePasswordSubmit} className="max-w-md space-y-4">
            {passwordMessage.text && (
              <div className={`p-3 rounded-lg text-sm ${passwordMessage.type === "error" ? "bg-red-50 text-red-500" : "bg-green-50 text-green-600"}`}>
                {passwordMessage.text}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Mật khẩu hiện tại</label>
              <Input
                type="password"
                value={passwordData.oldPassword}
                onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                placeholder="Nhập mật khẩu hiện tại"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Mật khẩu mới</label>
              <Input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                placeholder="Nhập mật khẩu mới"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Xác nhận mật khẩu mới</label>
              <Input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                placeholder="Xác nhận lại mật khẩu mới"
              />
            </div>

            <div className="pt-4">
              <Button type="submit" disabled={passwordMutation.isPending} variant="outline" className="border-gray-300">
                {passwordMutation.isPending ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}