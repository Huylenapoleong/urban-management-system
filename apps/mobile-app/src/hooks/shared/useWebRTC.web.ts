import { useState, useEffect, useRef, useCallback } from 'react';
import { socketClient } from '../../lib/socket-client';
import { CHAT_SOCKET_EVENTS } from '@urban/shared-constants';
import { useAuth } from '../../providers/AuthProvider';

export type CallState = 'IDLE' | 'CALLING' | 'INCOMING' | 'CONNECTED';

export const useWebRTC = (conversationId?: string) => {
  const { user } = useAuth();
  
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [activeConfig, setActiveConfig] = useState<any>(null);
  
  // Note: we use any for streams because DOM MediaStream is slightly different from react-native-webrtc's MediaStream type
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);

  const getIceServers = () => ({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  });

  const cleanup = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      setRemoteStream(null);
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    setCallState('IDLE');
    setActiveConfig(null);
  }, [localStream, remoteStream]);

  const setupPeerConnection = useCallback(async (isCaller: boolean, config: any) => {
    try {
      const pc = new window.RTCPeerConnection(getIceServers());
      peerConnection.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate && config.conversationId) {
          const targetConvId = !isCaller && config.callerId ? `dm:${config.callerId}` : config.conversationId;
          socketClient.emitWithAck(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
            conversationId: targetConvId,
            candidate: event.candidate,
          });
        }
      };

      pc.ontrack = (event) => {
        console.log('[WebRTC-Web] received track');
        setRemoteStream(event.streams[0]);
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: config.isVideo ? true : false,
      });
      
      setLocalStream(stream);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      if (isCaller) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketClient.emitWithAck(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
          conversationId: config.conversationId,
          offer,
        });
      }

      return pc;
    } catch (error) {
      console.error('[WebRTC-Web] Setup failed:', error);
      cleanup();
    }
  }, [cleanup]);

  const startCall = async (isVideo: boolean, convId: string, targetId: string) => {
    if (callState !== 'IDLE') return;
    setCallState('CALLING');
    
    const config = { isVideo, targetUserId: targetId, conversationId: convId };
    setActiveConfig(config);

    socketClient.emitWithAck(CHAT_SOCKET_EVENTS.CALL_INIT, {
      conversationId: convId,
      callerId: user?.sub,
      callerName: (user as any)?.fullName || 'Người gọi',
      isVideo,
    });
  };

  const acceptCall = async () => {
    if (callState !== 'INCOMING' || !activeConfig) return;
    setCallState('CONNECTED');
    
    // For incoming call, the signalling target is the Caller
    const targetConvId = activeConfig.callerId ? `dm:${activeConfig.callerId}` : activeConfig.conversationId;

    socketClient.emitWithAck(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
      conversationId: targetConvId,
      calleeId: user?.sub,
    });

    await setupPeerConnection(false, activeConfig);
  };

  const rejectCall = () => {
    if (activeConfig?.conversationId) {
      const targetConvId = activeConfig.callerId ? `dm:${activeConfig.callerId}` : activeConfig.conversationId;
      socketClient.emitWithAck(CHAT_SOCKET_EVENTS.CALL_REJECT, {
        conversationId: targetConvId,
        calleeId: user?.sub,
      });
    }
    cleanup();
  };

  const endCall = () => {
    if (activeConfig?.conversationId) {
      // If we are currently responding to an INCOMING call that has never fully connected or just ending it
      const targetConvId = activeConfig.callerId ? `dm:${activeConfig.callerId}` : activeConfig.conversationId;
      socketClient.emitWithAck(CHAT_SOCKET_EVENTS.CALL_END, {
        conversationId: targetConvId,
        userId: user?.sub,
      });
    }
    cleanup();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track: MediaStreamTrack) => {
        track.enabled = !track.enabled;
      });
      const firstTrack = localStream.getAudioTracks()[0];
      if (firstTrack) {
        setIsMicOn(firstTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track: MediaStreamTrack) => {
        track.enabled = !track.enabled;
      });
    }
  };

  // Socket Listeners
  useEffect(() => {
    const onCallInit = (data: any) => {
      if (data.callerId !== user?.sub) {
        setCallState('INCOMING');
        setActiveConfig({
          isVideo: data.isVideo,
          callerId: data.callerId,
          callerName: data.callerName,
          conversationId: data.conversationId,
        });
      }
    };

    const onCallAccept = async (data: any) => {
      const targetMatches = activeConfig?.targetUserId === data.calleeId || activeConfig?.targetUserId === `dm:${data.calleeId}`;
      const isMatch = activeConfig?.conversationId === data.conversationId || targetMatches;

      if (isMatch && callState === 'CALLING') {
        setCallState('CONNECTED');
        await setupPeerConnection(true, activeConfig);
      }
    };

    const onCallReject = () => cleanup();
    const onCallEnd = () => cleanup();

    const onOffer = async (data: any) => {
      if (!peerConnection.current) return;
      await peerConnection.current.setRemoteDescription(new window.RTCSessionDescription(data.offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      
      const targetConvId = activeConfig?.callerId ? `dm:${activeConfig.callerId}` : data.conversationId;

      socketClient.emitWithAck(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, {
        conversationId: targetConvId,
        answer,
      });
    };

    const onAnswer = async (data: any) => {
      if (!peerConnection.current) return;
      await peerConnection.current.setRemoteDescription(new window.RTCSessionDescription(data.answer));
    };

    const onIceCandidate = async (data: any) => {
      if (!peerConnection.current || !data.candidate) return;
      try {
        await peerConnection.current.addIceCandidate(new window.RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error(e);
      }
    };

    socketClient.on(CHAT_SOCKET_EVENTS.CALL_INIT, onCallInit);
    socketClient.on(CHAT_SOCKET_EVENTS.CALL_ACCEPT, onCallAccept);
    socketClient.on(CHAT_SOCKET_EVENTS.CALL_REJECT, onCallReject);
    socketClient.on(CHAT_SOCKET_EVENTS.CALL_END, onCallEnd);
    socketClient.on(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, onOffer);
    socketClient.on(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, onAnswer);
    socketClient.on(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, onIceCandidate);

    return () => {
      socketClient.off(CHAT_SOCKET_EVENTS.CALL_INIT, onCallInit);
      socketClient.off(CHAT_SOCKET_EVENTS.CALL_ACCEPT, onCallAccept);
      socketClient.off(CHAT_SOCKET_EVENTS.CALL_REJECT, onCallReject);
      socketClient.off(CHAT_SOCKET_EVENTS.CALL_END, onCallEnd);
      socketClient.off(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, onOffer);
      socketClient.off(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, onAnswer);
      socketClient.off(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, onIceCandidate);
    };
  }, [callState, activeConfig, user?.sub, setupPeerConnection, cleanup]);

  return { callState, activeConfig, localStream, remoteStream, isMicOn, startCall, acceptCall, rejectCall, endCall, toggleMute, toggleVideo };
};
