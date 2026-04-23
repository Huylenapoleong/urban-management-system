import { createContext, useContext, type ReactNode } from "react";
import { CallModal } from "@/components/CallModal";
import { useWebRTC } from "@/hooks/shared/useWebRTC";

const WebRTCContext = createContext<ReturnType<typeof useWebRTC> | null>(null);

export function WebRTCProvider({ children }: { children: ReactNode }) {
  const rtc = useWebRTC();

  return (
    <WebRTCContext.Provider value={rtc}>
      {children}
      <CallModal rtc={rtc} />
    </WebRTCContext.Provider>
  );
}

export function useWebRTCRuntime() {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error("useWebRTCRuntime must be used within WebRTCProvider");
  }

  return context;
}
