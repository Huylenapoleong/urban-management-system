import { createContext, useContext } from "react";
import type {
  CallEndedSummary,
  CallState,
  RemoteParticipant,
} from "../hooks/shared/useWebRTC";

export interface WebRTCContextValue {
  callState: CallState;
  activeConfig: any;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteParticipants: RemoteParticipant[];
  activeGroupCalls: Set<string>;
  isMicOn: boolean;
  startCall: (
    isVideo: boolean,
    convId: string,
    targetId: string,
  ) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  isVideoOn: boolean;
  callError: string | null;
  lastEndedCall: CallEndedSummary | null;
  callDurationSeconds: number;
  clearLastEndedCall: () => void;
}

export const WebRTCContext = createContext<WebRTCContextValue | null>(null);

export const useWebRTCContext = () => {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error("useWebRTCContext must be used within a WebRTCProvider");
  }
  return context;
};
