import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import { submitReport } from "@/services/report.api";

type FormValues = {
  title: string;
  description: string;
  categoryId: string;
  locationCode: string;
  isAnonymous: boolean;
};

export default function NewReportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      isAnonymous: false,
    }
  });

  const mutation = useMutation({
    mutationFn: submitReport,
    onMutate: () => setIsSubmitting(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Gửi báo cáo thành công!");
      navigate("/reports");
    },
    onError: () => {
      toast.error("Không thể gửi báo cáo lúc này.");
    },
    onSettled: () => setIsSubmitting(false),
  });

  const onSubmit = (data: FormValues) => {
    mutation.mutate(data);
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
              <p className="text-sm text-gray-500 mt-1">Thông tin của bạn sẽ được gửi đến cơ quan quản lý.</p>
            </div>
         </div>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tiêu đề *</label>
          <input
            {...register("title", { required: "Vui lòng nhập tiêu đề" })}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ví dụ: Cây đổ chắn ngang đường"
          />
          {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mô tả *</label>
          <textarea
            {...register("description", { required: "Vui lòng nhập mô tả" })}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]"
            placeholder="Mô tả chi tiết sự cố..."
          />
          {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Danh mục *</label>
            <select
              {...register("categoryId", { required: "Vui lòng chọn danh mục" })}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Chọn danh mục</option>
              <option value="INFRASTRUCTURE">Hạ tầng</option>
              <option value="ENVIRONMENT">Môi trường</option>
              <option value="SECURITY">An ninh</option>
              <option value="OTHER">Khác</option>
            </select>
            {errors.categoryId && <p className="text-red-500 text-xs mt-1">{errors.categoryId.message}</p>}
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mã khu vực *</label>
            <input
              {...register("locationCode", { required: "Vui lòng nhập mã khu vực" })}
               className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="VD: Q1-PBN"
            />
            {errors.locationCode && <p className="text-red-500 text-xs mt-1">{errors.locationCode.message}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          <input 
            type="checkbox" 
            id="isAnonymous"
            {...register("isAnonymous")}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="isAnonymous" className="text-sm font-medium text-gray-700 dark:text-gray-300">
             Gửi ẩn danh
          </label>
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
            disabled={isSubmitting}
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