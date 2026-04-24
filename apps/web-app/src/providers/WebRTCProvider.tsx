import { CallModal } from "@/components/CallModal";
import { useWebRTC } from "@/hooks/shared/useWebRTC";
import type { ReactNode } from "react";
import { WebRTCContext } from "./webrtc-context";

export function WebRTCProvider({ children }: { children: ReactNode }) {
  const rtc = useWebRTC();

  return (
    <WebRTCContext.Provider value={rtc}>
      {children}
      <CallModal rtc={rtc} />
    </WebRTCContext.Provider>
  );
}
