import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users, Plus, ShieldCheck, MessageCircle, LogOut, X } from "lucide-react";
import { createGroup, getGroups, joinGroup, leaveGroup } from "@/services/group.api";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import type { GroupType } from "@urban/shared-constants";

type GroupFormState = {
  groupName: string;
  description: string;
  groupType: GroupType;
  locationCode: string;
};

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const accountLocationCode = user?.locationCode?.trim() ?? "";
  const canCreateOfficialGroup = user?.role === "OFFICIAL" || user?.role === "ADMIN";

  const [isJoining, setIsJoining] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formState, setFormState] = useState<GroupFormState>({
    groupName: "",
    description: "",
    groupType: "AREA",
    locationCode: user?.locationCode ?? "",
  });

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["groups", "all"],
    queryFn: () => getGroups(),
  });

  const { data: joinedGroups = [] } = useQuery({
    queryKey: ["groups", "mine"],
    queryFn: () => getGroups({ mine: true }),
  });

  const joinedGroupIds = useMemo(() => new Set(joinedGroups.map((item) => item.id)), [joinedGroups]);

  const joinGroupMutation = useMutation({
    mutationFn: joinGroup,
    onMutate: (id) => setIsJoining(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Đã tham gia nhóm thành công!");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Không thể tham gia nhóm lúc này.");
    },
    onSettled: () => setIsJoining(null),
  });

  const leaveGroupMutation = useMutation({
    mutationFn: leaveGroup,
    onMutate: (id) => setIsLeaving(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Đã rời nhóm.");
    },
    onError: (error: any) => {
      toast.error(error?.message || "Không thể rời nhóm lúc này.");
    },
    onSettled: () => setIsLeaving(null),
  });

  const createGroupMutation = useMutation({
    mutationFn: createGroup,
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      toast.success("Tạo nhóm thành công!");
      setIsCreateOpen(false);
      setFormState((prev) => ({
        ...prev,
        groupName: "",
        description: "",
      }));
      navigate("/chat", {
        state: {
          conversationId: `group:${group.id}`,
          displayName: group.groupName,
        },
      });
    },
    onError: (error: any) => {
      toast.error(error?.message || "Không thể tạo nhóm.");
    },
  });

  const handleOpenCreate = () => {
    setFormState({
      groupName: "",
      description: "",
      groupType: "AREA",
      locationCode: user?.locationCode ?? "",
    });
    setIsCreateOpen(true);
  };

  useEffect(() => {
    if (!isCreateOpen || !user?.locationCode) {
      return;
    }

    setFormState((prev) => {
      if (prev.locationCode === user.locationCode) {
        return prev;
      }

      return {
        ...prev,
        locationCode: user.locationCode,
      };
    });
  }, [isCreateOpen, user?.locationCode]);

  const handleCreateGroup = (event: React.FormEvent) => {
    event.preventDefault();

    if (!formState.groupName.trim()) {
      toast.error("Vui lòng nhập tên nhóm.");
      return;
    }

    if (!accountLocationCode) {
      toast.error("Vui lòng nhập mã khu vực.");
      return;
    }

    if (!canCreateOfficialGroup && formState.groupType === "OFFICIAL") {
      toast.error("Tài khoản hiện tại không thể tạo nhóm OFFICIAL.");
      return;
    }

    createGroupMutation.mutate({
      groupName: formState.groupName.trim(),
      description: formState.description.trim() || undefined,
      groupType: formState.groupType,
      locationCode: accountLocationCode,
    });
  };

  const openChat = (groupId: string, groupName: string) => {
    navigate("/chat", {
      state: {
        conversationId: `group:${groupId}`,
        displayName: groupName,
      },
    });
  };

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
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tạo nhóm
        </button>
      </header>

      {isCreateOpen ? (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Tạo nhóm mới</h2>
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreateGroup}>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Tên nhóm</label>
              <input
                value={formState.groupName}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, groupName: event.target.value }))
                }
                placeholder="Ví dụ: Hạ tầng phường 1"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Loại nhóm</label>
              <select
                value={formState.groupType}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, groupType: event.target.value as GroupType }))
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="AREA">AREA</option>
                <option value="TOPIC">TOPIC</option>
                {canCreateOfficialGroup ? <option value="OFFICIAL">OFFICIAL</option> : null}
                <option value="PRIVATE">PRIVATE</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Mã khu vực</label>
              <input
                value={formState.locationCode}
                placeholder="VN-HCM-BQ1-P01"
                readOnly
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Mô tả</label>
              <textarea
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, description: event.target.value }))
                }
                rows={3}
                placeholder="Mô tả mục tiêu nhóm"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={createGroupMutation.isPending}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {createGroupMutation.isPending ? "Đang tạo..." : "Tạo nhóm"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {groups.map((group) => (
          <div
            key={group.id}
            className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col justify-between h-full"
          >
            <div>
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{group.groupName}</h3>
                {group.groupType !== "PRIVATE" && (
                  <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full dark:bg-green-900 dark:text-green-200">
                    Công khai
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">{group.description}</p>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
                <Users className="w-4 h-4" />
                <span>{group.memberCount || 0} thành viên</span>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2">
              {joinedGroupIds.has(group.id) ? (
                <>
                  <button
                    onClick={() => openChat(group.id, group.groupName)}
                    className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Mở chat nhóm
                  </button>
                  <button
                    onClick={() => leaveGroupMutation.mutate(group.id)}
                    disabled={isLeaving === group.id}
                    className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isLeaving === group.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                    {isLeaving === group.id ? "Đang xử lý..." : "Rời nhóm"}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => joinGroupMutation.mutate(group.id)}
                  disabled={isJoining === group.id}
                  className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isJoining === group.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {isJoining === group.id ? "Đang xử lý..." : "Tham gia nhóm"}
                </button>
              )}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="col-span-1 sm:col-span-2 text-center py-12 text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
            Hiện tại chưa có nhóm nào.
          </div>
        )}
      </div>
    </div>
  );
}