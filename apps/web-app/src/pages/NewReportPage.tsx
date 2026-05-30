import { useAuth } from "@/providers/auth-context";
import { resolveLocationCode } from "@/services/location.api";
import { submitReport } from "@/services/report.api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Loader2, MapPinned } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";

type FormValues = {
  title: string;
  description: string;
  category: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
};

function normalizeLocationCode(value: string): string {
  return value.trim().toUpperCase();
}

export default function NewReportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const accountLocationCode = user?.locationCode?.trim() ?? "";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [locationError, setLocationError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      priority: "MEDIUM",
    },
  });

  useEffect(() => {
    if (!accountLocationCode) {
      return;
    }

    let cancelled = false;

    async function loadLocationLabel() {
      setLocationError("");

      try {
        const resolved = await resolveLocationCode(accountLocationCode);
        if (!cancelled) {
          setLocationLabel(resolved.displayName);
        }
      } catch (error) {
        if (!cancelled) {
          setLocationLabel("");
          setLocationError(
            error instanceof Error
              ? error.message
              : "Không thể tải thông tin địa bàn hiện tại.",
          );
        }
      }
    }

    void loadLocationLabel();

    return () => {
      cancelled = true;
    };
  }, [accountLocationCode]);

  const mutation = useMutation({
    mutationFn: submitReport,
    onMutate: () => setIsSubmitting(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Gui bao cao thanh cong!");
      navigate("/reports");
    },
    onError: (error: { message?: string }) => {
      toast.error(error?.message || "Khong the gui bao cao luc nay.");
    },
    onSettled: () => setIsSubmitting(false),
  });

  const onSubmit = (data: FormValues) => {
    if (!accountLocationCode) {
      toast.error("Tài khoản của bạn chưa có địa bàn hợp lệ.");
      return;
    }

    mutation.mutate({
      title: data.title.trim(),
      description: data.description.trim(),
      category: data.category,
      priority: data.priority,
      locationCode: normalizeLocationCode(accountLocationCode),
    });
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl space-y-6">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              Gửi báo cáo sự cố
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Thông tin của bạn sẽ được gửi đến cơ quan quản lý theo địa bàn tài
              khoản.
            </p>
          </div>
        </div>
      </header>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tiêu đề *
          </label>
          <input
            {...register("title", { required: "Vui lòng nhập tiêu đề" })}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ví dụ: Cây đổ chắn ngang đường"
          />
          {errors.title && (
            <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Mô tả *
          </label>
          <textarea
            {...register("description", { required: "Vui lòng nhập mô tả" })}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]"
            placeholder="Mô tả chi tiết sự cố..."
          />
          {errors.description && (
            <p className="text-red-500 text-xs mt-1">
              {errors.description.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Danh mục *
            </label>
            <select
              {...register("category", { required: "Vui lòng chọn danh mục" })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Chọn danh mục</option>
              <option value="INFRASTRUCTURE">Hạ tầng</option>
              <option value="ENVIRONMENT">Môi trường</option>
              <option value="SECURITY">An ninh</option>
            </select>
            {errors.category && (
              <p className="text-red-500 text-xs mt-1">
                {errors.category.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mức độ ưu tiên *
            </label>
            <select
              {...register("priority", {
                required: "Vui lòng chọn mức độ ưu tiên",
              })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="LOW">Thấp</option>
              <option value="MEDIUM">Trung bình</option>
              <option value="HIGH">Cao</option>
              <option value="URGENT">Khẩn cấp</option>
            </select>
            {errors.priority && (
              <p className="text-red-500 text-xs mt-1">
                {errors.priority.message}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <MapPinned className="w-4 h-4" />
            <p className="text-sm font-medium">Địa bàn gửi báo cáo</p>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {accountLocationCode
              ? locationLabel || normalizeLocationCode(accountLocationCode)
              : "Chưa xác định"}
          </p>
          {accountLocationCode && !locationError && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Tự động lấy theo địa bàn của tài khoản.
            </p>
          )}
          {(locationError || !accountLocationCode) && (
            <p className="text-xs text-amber-600">
              {locationError ||
                "Tài khoản của bạn chưa có thông tin địa bàn để gửi báo cáo."}
            </p>
          )}
        </div>

        <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-2 rounded-lg font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !accountLocationCode}
            className="px-6 py-2 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? "Đang gửi..." : "Gửi báo cáo"}
          </button>
        </div>
      </form>
    </div>
  );
}
