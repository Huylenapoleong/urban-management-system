import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, X } from "lucide-react";
import { useWebRTC } from "@/hooks/shared/useWebRTC";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getUserById } from "@/services/user.api";

function RemotePeerVideo({ peerId, stream, isVideoOn, fallbackName, fallbackAvatar }: { peerId: string, stream: MediaStream, isVideoOn: boolean, fallbackName?: string, fallbackAvatar?: string }) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleVideoRef = (node: HTMLVideoElement | null) => {
    if (node && node.srcObject !== stream) {
      node.srcObject = stream;
      void node.play().catch(() => {});
    }
  };

  const handleAudioRef = (node: HTMLAudioElement | null) => {
    if (node && node.srcObject !== stream) {
      node.srcObject = stream;
      void node.play().catch(() => {});
    }
  };

  useEffect(() => {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let animationFrame = 0;

    const detectSpeaking = () => {
      analyser.getByteFrequencyData(data);
      const total = data.reduce((sum, value) => sum + value, 0);
      const average = total / data.length;
      setIsSpeaking(average > 16);
      animationFrame = window.requestAnimationFrame(detectSpeaking);
    };

    void audioContext.resume().catch(() => {});
    detectSpeaking();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close().catch(() => {});
      setIsSpeaking(false);
    };
  }, [stream]);

  const hasVideoTrack = stream.getVideoTracks().length > 0;
  const displayName = fallbackName || `Thành viên (${peerId.slice(0,4)})`;

  return (
    <div className={`relative w-full h-full flex flex-col items-center justify-center bg-slate-900 border border-slate-800/50 rounded-xl overflow-hidden transition-all duration-300 ${isSpeaking ? "ring-2 ring-emerald-400" : ""}`}>
      <audio ref={handleAudioRef} autoPlay playsInline />
      {hasVideoTrack ? (
        <video ref={handleVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Avatar className={`h-16 w-16 border border-slate-700 bg-slate-800 ${isSpeaking ? "ring-4 ring-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]" : ""}`}>
            {fallbackAvatar && <AvatarImage src={fallbackAvatar} alt={displayName} />}
            <AvatarFallback className="bg-slate-800 text-lg font-semibold text-slate-100">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white max-w-[90%] truncate backdrop-blur-md">
        {displayName}
      </div>
    </div>
  );
}

interface CallModalProps {
  rtc: ReturnType<typeof useWebRTC>;
}

export function CallModal({ rtc }: CallModalProps) {
  const { callState, activeConfig, isMicOn, isVideoOn, localStream, remoteStreams, toggleMute, toggleVideo, endCall, acceptCall, rejectCall, callError, setCallError, callDurationSeconds } = rtc;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});

  const peerName = activeConfig?.peerName || activeConfig?.callerName || "Người dùng";
  const title = callState === "CALLING" ? "Đang gọi" : callState === "INCOMING" ? "Cuộc gọi đến" : "Đang trò chuyện";
  const isGroup = /^(group:|grp#|group#)/i.test(activeConfig?.conversationId || "");

  useEffect(() => {
    if (!isGroup || callState === "IDLE") return;
    
    // Helper to fetch and update name
    const fetchName = (id: string) => {
      if (!peerNames[id]) {
        getUserById(id).then(user => {
          setPeerNames(prev => ({ ...prev, [id]: user.fullName || user.username || id }));
        }).catch(() => {});
      }
    };

    // Fetch for all current remote peers
    Array.from(remoteStreams.keys()).forEach(fetchName);

    // Fetch for activeConfig targets/callers if they are peer IDs
    if (activeConfig?.callerId && activeConfig.callerId !== rtc.user?.sub) {
      fetchName(activeConfig.callerId);
    }
  }, [remoteStreams, isGroup, peerNames, callState, activeConfig?.callerId, rtc.user?.sub]);

  const getPeerName = (peerId: string, fallbackName?: string) => {
    if (!isGroup) return fallbackName || peerName;
    if (peerNames[peerId]) return peerNames[peerId];
    return `Thành viên (${peerId.slice(0, 4)})`;
  };

  const hasLocalVideoTrack = Boolean(localStream?.getVideoTracks().length);
  const remoteEntries = Array.from(remoteStreams.entries());

  useEffect(() => {
    if (callState === "IDLE") setDragPosition(null);
  }, [callState]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current || !panelRef.current) return;
      const panel = panelRef.current;
      const nextX = event.clientX - dragOffsetRef.current.x;
      const nextY = event.clientY - dragOffsetRef.current.y;
      const maxX = Math.max(16, window.innerWidth - panel.offsetWidth - 16);
      const maxY = Math.max(16, window.innerHeight - panel.offsetHeight - 16);
      setDragPosition({ x: Math.min(Math.max(16, nextX), maxX), y: Math.min(Math.max(16, nextY), maxY) });
    };

    const handlePointerUp = () => isDraggingRef.current = false;

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (!dragPosition) setDragPosition({ x: rect.left, y: rect.top });
    isDraggingRef.current = true;
  };

  const badgeLabel = callState === "CALLING" ? "Đang kết nối" : callState === "INCOMING" ? "Đang đổ chuông" : "Đã kết nối";
  const formatCallDuration = (totalSeconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    return `${Math.floor(safeSeconds / 60).toString().padStart(2, "0")}:${(safeSeconds % 60).toString().padStart(2, "0")}`;
  };

  if (callError) {
    return (
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 bg-red-500 text-white p-4 rounded-xl shadow-2xl z-50 flex flex-col items-center gap-4">
        <p className="font-semibold text-center">{callError}</p>
        <Button variant="outline" className="text-black" onClick={() => { setCallError(null); rtc.cleanup(); }}>Đóng</Button>
      </div>
    );
  }

  if (callState === "IDLE") return null;

  // Layout calculations
  const totalVideos = remoteEntries.length + (localStream && activeConfig?.isVideo ? 1 : 0);
  const isGridLayout = isGroup && totalVideos > 1;

  let gridCols = "grid-cols-1";
  if (isGridLayout) {
    if (totalVideos === 2) gridCols = "grid-cols-2";
    else if (totalVideos <= 4) gridCols = "grid-cols-2 grid-rows-2";
    else if (totalVideos <= 6) gridCols = "grid-cols-3 grid-rows-2";
    else gridCols = "grid-cols-3 grid-rows-3";
  }

  const modalWidth = isGridLayout ? "w-[90vw] max-w-[800px]" : "w-[350px] sm:w-[380px] max-w-[calc(100vw-20px)]";

  return (
    <div
      ref={panelRef}
      className={`absolute z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-600/70 bg-slate-950/95 text-white shadow-[0_24px_60px_rgba(2,6,23,0.55)] backdrop-blur-xl transition-all duration-300 ${modalWidth}`}
      style={dragPosition ? { left: dragPosition.x, top: dragPosition.y } : { top: 72, right: 16 }}
    >
      <div onPointerDown={handleDragStart} className="cursor-grab select-none border-b border-slate-700/80 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-2.5 active:cursor-grabbing">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{title} {isGroup ? "nhóm" : `với ${peerName}`}</p>
            <p className="text-xs text-slate-300">
              {callState === "CONNECTED" ? `Đang gọi ${formatCallDuration(callDurationSeconds)}` : "Kéo thanh này để di chuyển"}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            {badgeLabel}
          </span>
        </div>
      </div>

      <div className={`relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-2 gap-2 w-full flex ${isGridLayout ? `grid ${gridCols} h-[60vh] min-h-[400px]` : 'h-[228px] sm:h-[248px]'}`}>
        {remoteEntries.map(([peerId, stream]) => (
          <div key={peerId} className={isGridLayout ? "w-full h-full" : "absolute inset-0"}>
             <RemotePeerVideo 
                peerId={peerId} 
                stream={stream} 
                isVideoOn={true} 
                fallbackName={getPeerName(peerId, !isGroup ? peerName : undefined)}
                fallbackAvatar={!isGroup ? activeConfig?.peerAvatarUrl : undefined}
             />
          </div>
        ))}
        
        {remoteEntries.length === 0 && callState !== "INCOMING" && (
           <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
             <Avatar className="h-20 w-20 mb-4 border border-slate-700 bg-slate-800/80">
                {activeConfig?.peerAvatarUrl ? <AvatarImage src={activeConfig?.peerAvatarUrl} /> : null}
                <AvatarFallback>{peerName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
             <p className="text-sm">Chờ mọi người tham gia...</p>
           </div>
        )}

        {localStream && activeConfig?.isVideo && (
          <div className={`${isGridLayout ? "relative w-full h-full rounded-xl overflow-hidden border border-slate-800/50" : "absolute bottom-3 right-3 h-28 w-20 overflow-hidden rounded-xl border border-slate-600/70 bg-slate-800 shadow-lg"}`}>
            <video ref={localVideoRef} autoPlay playsInline muted className="h-full w-full scale-x-[-1] object-cover" />
            {isGridLayout && <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white">Bạn</div>}
          </div>
        )}

        {activeConfig?.isVideo && !hasLocalVideoTrack && !isGridLayout && (
          <div className="absolute bottom-3 left-3 rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-amber-100 shadow-sm z-10">
            Camera chưa sẵn sàng
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-slate-700/80 bg-slate-900/95 p-3.5">
        {callState === "INCOMING" ? (
          <>
            <Button variant="secondary" className="h-10 rounded-full border border-slate-600 bg-slate-700/60 px-4 hover:bg-slate-600 text-white" onClick={rejectCall}>
              <X size={16} className="mr-2" /> Từ chối
            </Button>
            <Button variant="default" className="h-10 rounded-full bg-emerald-600 px-4 hover:bg-emerald-700 text-white" onClick={acceptCall}>
              <Phone size={16} className="mr-2" /> Nhận cuộc gọi
            </Button>
          </>
        ) : (
          <>
            <Button variant={isMicOn ? "secondary" : "destructive"} size="icon" className="h-10 w-10 rounded-full border border-slate-600 bg-slate-700/60 hover:bg-slate-600 text-white" onClick={toggleMute}>
              {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
            </Button>
            {activeConfig?.isVideo && (
              <Button variant={isVideoOn ? "secondary" : "destructive"} size="icon" className="h-10 w-10 rounded-full border border-slate-600 bg-slate-700/60 hover:bg-slate-600 text-white" onClick={toggleVideo}>
                {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
              </Button>
            )}
            <Button variant="destructive" size="icon" className="mx-1 h-11 w-11 rounded-full bg-red-600 hover:bg-red-700 text-white" onClick={endCall}>
              <PhoneOff size={24} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
