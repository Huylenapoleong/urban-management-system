import React, { ReactNode } from 'react';
import { useWebRTC } from '../hooks/shared/useWebRTC';
import CallScreen from '../components/CallScreen';
import { WebRTCContext } from './WebRTCContext';

export const WebRTCProvider = ({ children }: { children: ReactNode }) => {
  const webrtc = useWebRTC();

  return (
    <WebRTCContext.Provider value={webrtc}>
      {children}
      {webrtc.callState !== 'IDLE' && <CallScreen />}
    </WebRTCContext.Provider>
  );
};
