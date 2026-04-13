import { useEffect, useRef } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { useWebRTC } from "@/hooks/shared/useWebRTC";
import { Button } from "@/components/ui/button";

interface CallModalProps {
  rtc: ReturnType<typeof useWebRTC>;
}

export function CallModal({ rtc }: CallModalProps) {
  const { callState, activeConfig, isMicOn, isVideoOn, localStream, remoteStream, toggleMute, toggleVideo, endCall, callError, setCallError } = rtc;
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

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
    <div className="absolute top-4 right-4 w-[360px] bg-slate-900 text-white rounded-xl shadow-2xl overflow-hidden flex flex-col z-50 border border-slate-700">
      <div className="p-4 bg-slate-800 text-center font-medium">
        {callState === "CALLING" ? "Đang gọi..." : "Đang trò chuyện"}
        {activeConfig?.callerName && ` với ${activeConfig.callerName}`}
      </div>
      
      <div className="relative h-[240px] bg-black">
        {/* Remote Stream Video */}
        {remoteStream && activeConfig?.isVideo && (
          <video 
            ref={remoteVideoRef}
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
        )}
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 italic">
            Chờ kết nối...
          </div>
        )}

        {/* Local Stream (PIP) */}
        {localStream && activeConfig?.isVideo && (
          <div className="absolute bottom-4 right-4 w-24 h-32 bg-slate-800 rounded overflow-hidden shadow-lg border border-slate-700">
             <video 
              ref={localVideoRef}
              autoPlay 
              playsInline 
              muted // Cực kỳ quan trọng để ko bị feedback loop giọng mình
              className="w-full h-full object-cover transform scale-x-[-1]"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 p-4 bg-slate-800">
        <Button 
          variant={isMicOn ? "secondary" : "destructive"} 
          size="icon" 
          className="rounded-full" 
          onClick={toggleMute}
        >
          {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
        </Button>
        {activeConfig?.isVideo && (
          <Button 
            variant={isVideoOn ? "secondary" : "destructive"} 
            size="icon" 
            className="rounded-full" 
            onClick={toggleVideo}
          >
            {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
          </Button>
        )}
        <Button 
          variant="destructive" 
          size="icon" 
          className="rounded-full size-12 bg-red-600 hover:bg-red-700 mx-2" 
          onClick={endCall}
        >
          <PhoneOff size={24} />
        </Button>
      </div>
    </div>
  );
}
