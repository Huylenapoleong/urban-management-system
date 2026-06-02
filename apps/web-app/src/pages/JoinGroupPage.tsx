import { useAuth } from "@/providers/auth-context";
import { getGroup, joinGroupByInvite } from "@/services/group.api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "react-hot-toast";

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null || !("message" in error)) {
    return fallback;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export default function JoinGroupPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, isLoading: isAuthLoading } = useAuth();
  const hasAttemptedJoinRef = useRef(false);

  const queryClient = useQueryClient();

  const joinMutation = useMutation({
    mutationFn: (inviteCode: string) => joinGroupByInvite(inviteCode),
    onSuccess: async (data) => {
      // Invalidate conversations to make it show up in the sidebar
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      
      let groupName = "";
      try {
        const group = await getGroup(data.groupId);
        groupName = group.groupName;
      } catch (err) {
        console.error("Failed to fetch group info after joining", err);
      }

      toast.success("Đã tham gia nhóm thành công!");
      navigate("/chat", {
        state: {
          conversationId: `group:${data.groupId}`,
          displayName: groupName,
        },
      });
    },
    onError: (error: unknown) => {
      toast.error(
        getErrorMessage(error, "Mã mời không hợp lệ hoặc đã hết hạn."),
      );
    },
  });
  const isJoining = joinMutation.isPending;

  useEffect(() => {
    // Auto-join if logged in and we haven't tried yet
    if (user && code && !hasAttemptedJoinRef.current) {
      hasAttemptedJoinRef.current = true;
      joinMutation.mutate(code);
    }
  }, [user, code, joinMutation]);

  if (isAuthLoading || (user && isJoining)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
          <div className="relative p-8 rounded-2xl glass border border-slate-200 dark:border-slate-800 shadow-xl">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {isJoining ? "Đang xử lý lời mời gia nhập nhóm..." : "Đang xác thực..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-300">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-center text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-8 -mt-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute bottom-0 left-0 -ml-8 -mb-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md shadow-inner">
            <Users size={40} className="text-white" />
          </div>
          
          <h1 className="text-2xl font-bold">Lời mời tham gia nhóm</h1>
          <p className="text-blue-100 mt-2 text-sm">
            Bạn đã nhận được mã mời tham gia một nhóm cộng đồng trên Urban Management.
          </p>
        </div>

        <div className="p-8 space-y-6">
          <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div className="h-12 w-12 shrink-0 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <ShieldCheck size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Mã mời của bạn</p>
              <p className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100">{code}</p>
            </div>
          </div>

          {!user ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
                <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Bạn cần đăng nhập để có thể tham gia nhóm này.
                </p>
              </div>
              
              <Link
                to="/login"
                state={{ from: { pathname: window.location.pathname } }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white transition-all hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98]"
              >
                Đăng nhập để tham gia
                <ArrowRight size={18} />
              </Link>
              
              <p className="text-center text-xs text-slate-400">
                Chưa có tài khoản? <Link to="/register" className="text-blue-600 font-bold hover:underline">Đăng ký ngay</Link>
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={() => code && joinMutation.mutate(code)}
                disabled={joinMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white transition-all hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-500/25 active:scale-[0.98] disabled:opacity-50"
              >
                {joinMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    Tham gia nhóm ngay
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          )}
          
          <button
            onClick={() => navigate("/")}
            className="w-full text-center text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            QUAY LẠI TRANG CHỦ
          </button>
        </div>
      </div>
    </div>
  );
}
