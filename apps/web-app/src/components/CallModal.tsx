import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, X } from "lucide-react";
import { useWebRTC } from "@/hooks/shared/useWebRTC";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface CallModalProps {
  rtc: ReturnType<typeof useWebRTC>;
}

export function CallModal({ rtc }: CallModalProps) {
  const { callState, activeConfig, isMicOn, isVideoOn, localStream, remoteStream, toggleMute, toggleVideo, endCall, acceptCall, rejectCall, callError, setCallError } = rtc;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [isPeerSpeaking, setIsPeerSpeaking] = useState(false);

  const peerName = activeConfig?.peerName || activeConfig?.callerName || "Người dùng";
  const peerAvatarUrl = activeConfig?.peerAvatarUrl;
  const title = callState === "CALLING"
    ? "Đang gọi"
    : callState === "INCOMING"
      ? "Cuộc gọi đến"
      : "Đang trò chuyện";
  const canRenderRemoteVideo = Boolean(remoteStream && activeConfig?.isVideo);
  const canRenderLocalVideo = Boolean(localStream && activeConfig?.isVideo);

  useEffect(() => {
    if (callState === "IDLE") {
      setDragPosition(null);
    }
  }, [callState]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      void remoteVideoRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!remoteAudioRef.current) {
      return;
    }

    if (!remoteStream) {
      remoteAudioRef.current.srcObject = null;
      return;
    }

    remoteAudioRef.current.srcObject = remoteStream;
    void remoteAudioRef.current.play().catch(() => {});
  }, [remoteStream]);

  useEffect(() => {
    if (!remoteStream) {
      setIsPeerSpeaking(false);
      return;
    }

    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;
    const source = audioContext.createMediaStreamSource(remoteStream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let animationFrame = 0;

    const detectSpeaking = () => {
      analyser.getByteFrequencyData(data);
      const total = data.reduce((sum, value) => sum + value, 0);
      const average = total / data.length;
      setIsPeerSpeaking(average > 16);
      animationFrame = window.requestAnimationFrame(detectSpeaking);
    };

    void audioContext.resume().catch(() => {});
    detectSpeaking();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close().catch(() => {});
      setIsPeerSpeaking(false);
    };
  }, [remoteStream]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingRef.current) {
        return;
      }

      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      const nextX = event.clientX - dragOffsetRef.current.x;
      const nextY = event.clientY - dragOffsetRef.current.y;
      const maxX = Math.max(16, window.innerWidth - panel.offsetWidth - 16);
      const maxY = Math.max(16, window.innerHeight - panel.offsetHeight - 16);

      setDragPosition({
        x: Math.min(Math.max(16, nextX), maxX),
        y: Math.min(Math.max(16, nextY), maxY),
      });
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const handleDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    if (!dragPosition) {
      setDragPosition({ x: rect.left, y: rect.top });
    }

    isDraggingRef.current = true;
  };

  const badgeLabel = callState === "CALLING"
    ? "Đang kết nối"
    : callState === "INCOMING"
      ? "Đang đổ chuông"
      : "Đã kết nối";
  const waitingLabel = callState === "CONNECTED" && !activeConfig?.isVideo
    ? "Đã kết nối thoại"
    : "Chờ kết nối...";

  // Nếu có lỗi, hiện báo lỗi nhỏ
  if (callError) {
    return (
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 bg-red-500 text-white p-4 rounded-xl shadow-2xl z-50 flex flex-col items-center gap-4">
        <p className="font-semibold text-center">{callError}</p>
        <Button variant="outline" className="text-black" onClick={() => { setCallError(null); rtc.cleanup(); }}>Đóng</Button>
      </div>
    );
  }

  if (callState === "IDLE") return null;

  return (
    <div
      ref={panelRef}
      className="absolute z-50 flex w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 text-white shadow-[0_24px_60px_rgba(2,6,23,0.6)]"
      style={
        dragPosition
          ? { left: dragPosition.x, top: dragPosition.y }
          : { top: 16, right: 16 }
      }
    >
      <div
        onPointerDown={handleDragStart}
        className="cursor-grab select-none bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-4 py-3 active:cursor-grabbing"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{title} với {peerName}</p>
            <p className="text-xs text-slate-300">Kéo thanh này để di chuyển cửa sổ gọi</p>
          </div>
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            {badgeLabel}
          </span>
        </div>
      </div>

      <div className="relative h-[248px] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <audio ref={remoteAudioRef} autoPlay playsInline />
        {/* Remote Stream Video */}
        {canRenderRemoteVideo && (
          <video 
            ref={remoteVideoRef}
            autoPlay 
            playsInline 
            className="h-full w-full object-cover"
          />
        )}
        {!canRenderRemoteVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
            <div className={`rounded-full transition-all duration-150 ${isPeerSpeaking ? "ring-4 ring-emerald-400/80 shadow-[0_0_30px_rgba(16,185,129,0.45)]" : "ring-2 ring-slate-600/80"}`}>
              <Avatar className="h-20 w-20 border border-slate-700 bg-slate-800/80">
                {peerAvatarUrl ? <AvatarImage src={peerAvatarUrl} alt={peerName} /> : null}
                <AvatarFallback className="bg-slate-800 text-xl font-semibold text-slate-100">
                  {peerName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <p className="text-sm italic text-slate-400">{waitingLabel}</p>
          </div>
        )}

        {/* Local Stream (PIP) */}
        {canRenderLocalVideo && (
          <div className="absolute bottom-3 right-3 h-28 w-20 overflow-hidden rounded-xl border border-slate-600/70 bg-slate-800 shadow-lg">
             <video 
              ref={localVideoRef}
              autoPlay 
              playsInline 
              muted // Cực kỳ quan trọng để ko bị feedback loop giọng mình
              className="h-full w-full scale-x-[-1] object-cover"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-slate-700/80 bg-slate-900/95 p-4">
        {callState === "INCOMING" ? (
          <>
            <Button
              variant="secondary"
              className="h-11 rounded-full border border-slate-600 bg-slate-700/60 px-4 text-white hover:bg-slate-600"
              onClick={rejectCall}
            >
              <X size={16} className="mr-2" />
              Từ chối
            </Button>
            <Button
              variant="default"
              className="h-11 rounded-full bg-emerald-600 px-4 text-white hover:bg-emerald-700"
              onClick={acceptCall}
            >
              <Phone size={16} className="mr-2" />
              Nhận cuộc gọi
            </Button>
          </>
        ) : (
          <>
        <Button 
          variant={isMicOn ? "secondary" : "destructive"}
          size="icon" 
          className="h-11 w-11 rounded-full border border-slate-600 bg-slate-700/60 text-white hover:bg-slate-600"
          onClick={toggleMute}
        >
          {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
        </Button>
        {activeConfig?.isVideo && (
          <Button 
            variant={isVideoOn ? "secondary" : "destructive"}
            size="icon" 
            className="h-11 w-11 rounded-full border border-slate-600 bg-slate-700/60 text-white hover:bg-slate-600"
            onClick={toggleVideo}
          >
            {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
          </Button>
        )}
        <Button 
          variant="destructive" 
          size="icon" 
          className="mx-1 h-12 w-12 rounded-full bg-red-600 text-white hover:bg-red-700"
          onClick={endCall}
        >
          <PhoneOff size={24} />
        </Button>
          </>
        )}
      </div>
    </div>
  );
}
