import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useMutation } from "@tanstack/react-query"
import { register, type RegisterRequest } from "@/services/auth.api"
import { useAuth } from "@/providers/AuthProvider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function RegisterPage() {
  const navigate = useNavigate()
  const { login: authenticate } = useAuth()
  const [formData, setFormData] = useState<RegisterRequest>({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    locationCode: "",
  })
  const [error, setError] = useState("")

  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: (data) => {
      if (data.tokens?.accessToken) {
        authenticate(data.tokens.accessToken)
        navigate("/")
      } else {
        setError("Token đăng nhập không được tìm thấy.")
      }
    },
    onError: (err: { message?: string }) => {
      setError(err?.message || "Đăng ký thất bại. Vui lòng kiểm tra lại thông tin.")
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!formData.fullName || !formData.password || !formData.locationCode) {
      setError("Vui lòng nhập đầy đủ thông tin bắt buộc (*)")
      return
    }
    if (!formData.email && !formData.phone) {
      setError("Vui lòng cung cấp ít nhất Email hoặc Số điện thoại")
      return
    }

    registerMutation.mutate(formData)
  }

  return (
    <div className="min-h-screen w-screen bg-slate-100 flex items-center justify-center p-4 py-10 overflow-y-auto">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden mt-8 mb-8">
        <div className="bg-blue-600 p-6 text-center text-white">
          <h1 className="text-2xl font-bold">Urban Management OTT</h1>
          <p className="text-blue-100 mt-2 text-sm">Đăng ký tài khoản hệ thống</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Họ và tên (*)</label>
            <Input
              type="text"
              placeholder="Nguyễn Văn A"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Số điện thoại</label>
            <Input
              type="tel"
              placeholder="09xx xxx xxx"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <Input
              type="email"
              placeholder="email@example.com"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Mã Khu Vực (*)</label>
            <Input
              type="text"
              placeholder="Ví dụ: VN-HCM-BQ1-P01"
              value={formData.locationCode}
              onChange={(e) => setFormData({ ...formData, locationCode: e.target.value })}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Mật khẩu (*)</label>
            <Input
              type="password"
              placeholder="Nhập mật khẩu"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full"
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white mt-4"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? "Đang xử lý..." : "Đăng ký"}
          </Button>

          <div className="text-center text-sm text-gray-500 mt-4">
            Đã có tài khoản? <Link to="/login" className="text-blue-600 font-medium hover:underline">Đăng nhập</Link>
          </div>
        </form>
      </div>
    </div>
  )
}