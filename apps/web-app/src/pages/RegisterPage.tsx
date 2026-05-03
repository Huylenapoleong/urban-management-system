import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/providers/auth-context";
import { register, type RegisterRequest } from "@/services/auth.api";
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
              : "Khong the tai danh sach tinh/thanh.",
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
              : "Khong the tai danh sach phuong/xa.",
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

  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: (data) => {
      if (data.tokens?.accessToken) {
        authenticate(data.tokens.accessToken);
        navigate("/");
      } else {
        setError("Token dang nhap khong duoc tim thay.");
      }
    },
    onError: (err: { message?: string }) => {
      setError(
        err?.message || "Dang ky that bai. Vui long kiem tra lai thong tin.",
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.fullName || !formData.password) {
      setError("Vui long nhap day du thong tin bat buoc (*)");
      return;
    }
    if (!formData.email && !formData.phone) {
      setError("Vui long cung cap it nhat Email hoac So dien thoai");
      return;
    }
    if (!selectedProvinceCode || !selectedWardCode || !formData.locationCode) {
      setError("Vui long chon day du Tinh/Thanh va Phuong/Xa.");
      return;
    }

    registerMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen w-screen bg-slate-100 flex items-center justify-center p-4 py-10 overflow-y-auto">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden mt-8 mb-8">
        <div className="bg-blue-600 p-6 text-center text-white">
          <h1 className="text-2xl font-bold">Urban Management OTT</h1>
          <p className="text-blue-100 mt-2 text-sm">
            Dang ky tai khoan he thong
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {locationError && (
            <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-sm">
              {locationError}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Ho va ten (*)
            </label>
            <Input
              type="text"
              placeholder="Nguyen Van A"
              value={formData.fullName}
              onChange={(e) =>
                setFormData({ ...formData, fullName: e.target.value })
              }
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              So dien thoai
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
            <label className="text-sm font-medium text-gray-700">Email</label>
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
                Tinh / Thanh (*)
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
                  {isLoadingProvinces ? "Dang tai..." : "Chon tinh/thanh"}
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
                Phuong / Xa (*)
              </label>
              <select
                value={selectedWardCode}
                onChange={(e) => setSelectedWardCode(e.target.value)}
                disabled={!selectedProvinceCode || isLoadingWards}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">
                  {!selectedProvinceCode
                    ? "Chon tinh/thanh truoc"
                    : isLoadingWards
                      ? "Dang tai..."
                      : "Chon phuong/xa"}
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
              Dia ban se gui len backend
            </p>
            <p className="mt-1 text-xs">
              {selectedWard?.fullName ||
                selectedProvince?.fullName ||
                "Se duoc xac dinh sau khi chon day du tinh/thanh va phuong/xa"}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Mat khau (*)
            </label>
            <Input
              type="password"
              placeholder="Nhap mat khau"
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
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? "Dang xu ly..." : "Dang ky"}
          </Button>

          <div className="text-center text-sm text-gray-500 mt-4">
            Da co tai khoan?{" "}
            <Link
              to="/login"
              className="text-blue-600 font-medium hover:underline"
            >
              Dang nhap
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
