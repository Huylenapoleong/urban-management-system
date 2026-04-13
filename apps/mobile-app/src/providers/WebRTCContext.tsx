import { createContext, useContext } from 'react';
import { CallState } from '../hooks/shared/useWebRTC';
import { MediaStream } from '../hooks/shared/WebRTCShim';

export interface WebRTCContextValue {
  callState: CallState;
  activeConfig: any;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMicOn: boolean;
  startCall: (isVideo: boolean, convId: string, targetId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
}

export const WebRTCContext = createContext<WebRTCContextValue | null>(null);

export const useWebRTCContext = () => {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTCContext must be used within a WebRTCProvider');
  }
  return context;
};
