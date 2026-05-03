import { useWebRTC } from "@/hooks/shared/useWebRTC";
import { createContext, useContext } from "react";

export type WebRTCRuntime = ReturnType<typeof useWebRTC>;

export const WebRTCContext = createContext<WebRTCRuntime | null>(null);

export function useWebRTCRuntime(): WebRTCRuntime {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error("useWebRTCRuntime must be used within WebRTCProvider");
  }

  return context;
}
