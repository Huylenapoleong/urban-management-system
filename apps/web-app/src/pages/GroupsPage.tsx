import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users, Plus, ShieldCheck } from "lucide-react";
import { getGroups, joinGroup } from "@/services/group.api";
import { toast } from "react-hot-toast";

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const [isJoining, setIsJoining] = useState<string | null>(null);

  const { data: groups, isLoading } = useQuery({
    queryKey: ["groups"],
    queryFn: () => getGroups(),
  });

  const joinGroupMutation = useMutation({
    mutationFn: joinGroup,
    onMutate: (id) => setIsJoining(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Đã tham gia nhóm thành công!");
    },
    onError: () => {
      toast.error("Không thể tham gia nhóm lúc này.");
    },
    onSettled: () => setIsJoining(null),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            Nhóm cộng đồng
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Tham gia các nhóm để nhận thông báo và trao đổi.</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          <Plus className="w-4 h-4" />
          Tạo nhóm
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {groups?.map((group: any) => (
          <div
            key={group.id}
            className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between h-full"
          >
            <div>
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{group.name}</h3>
                {group.visibility === "PUBLIC" && (
                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full dark:bg-green-900 dark:text-green-200">
                    Công khai
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">{group.description}</p>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
                <Users className="w-4 h-4" />
                <span>{group.membersCount || 0} thành viên</span>
              </div>
            </div>
            
            <button
              onClick={() => joinGroupMutation.mutate(group.id)}
              disabled={isJoining === group.id}
              className="w-full mt-2 flex justify-center items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors disabled:opacity-50"
            >
              {isJoining === group.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {isJoining === group.id ? "Đang xử lý..." : "Tham gia nhóm"}
            </button>
          </div>
        ))}
        {groups?.length === 0 && (
          <div className="col-span-1 sm:col-span-2 text-center py-12 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
            Hiện tại chưa có nhóm nào.
          </div>
        )}
      </div>
    </div>
  );
}