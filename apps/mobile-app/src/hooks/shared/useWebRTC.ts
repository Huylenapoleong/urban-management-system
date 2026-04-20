import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
} from './WebRTCShim';
import { socketClient } from '../../lib/socket-client';
import { CHAT_SOCKET_EVENTS } from '@urban/shared-constants';
import { useAuth } from '../../providers/AuthProvider';

export type CallState = 'IDLE' | 'CALLING' | 'INCOMING' | 'CONNECTED';

interface CallConfig {
  isVideo: boolean;
  targetUserId?: string;
  callerId?: string;
  callerName?: string;
  conversationId?: string;
}

export const useWebRTC = (conversationId?: string) => {
  const { user } = useAuth();

  const safeEmit = useCallback((event: string, payload: any) => {
    void socketClient.emitWithAck(event, payload).catch((error) => {
      console.warn(`[useWebRTC] ${event} skipped: socket unavailable`, error);
    });
  }, []);
  
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [activeConfig, setActiveConfig] = useState<CallConfig | null>(null);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<any[]>([]);

  const flushPendingIceCandidates = useCallback(async () => {
    const pc = peerConnection.current;
    if (!pc || !pc.remoteDescription || pendingIceCandidatesRef.current.length === 0) {
      return;
    }

    const queued = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];

    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('[useWebRTC] Failed to apply queued ice candidate', e);
      }
    }
  }, []);

  // Configuration for ICE servers
  const getIceServers = () => {
    const turnUsername = process.env.EXPO_PUBLIC_TURN_USERNAME || process.env.VITE_TURN_USERNAME || '2fec29a1e9f3a53983b8e5fd';
    const turnPassword = process.env.EXPO_PUBLIC_TURN_PASSWORD || process.env.VITE_TURN_PASSWORD || 'MmdvU+k086vCyro2';

    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.relay.metered.ca:80' },
        {
          urls: 'turn:global.relay.metered.ca:80',
          username: turnUsername,
          credential: turnPassword,
        },
        {
          urls: 'turn:global.relay.metered.ca:80?transport=tcp',
          username: turnUsername,
          credential: turnPassword,
        },
        {
          urls: 'turn:global.relay.metered.ca:443',
          username: turnUsername,
          credential: turnPassword,
        },
        {
          urls: 'turns:global.relay.metered.ca:443?transport=tcp',
          username: turnUsername,
          credential: turnPassword,
        },
      ],
    };
  };

  const cleanup = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    pendingIceCandidatesRef.current = [];
    setCallState('IDLE');
    setActiveConfig(null);
  }, [localStream, remoteStream]);

  const setupPeerConnection = useCallback(async (isCaller: boolean, config: CallConfig) => {
    console.log('[useWebRTC] Setting up PeerConnection');
    const pc = new RTCPeerConnection(getIceServers());
    peerConnection.current = pc;

    // @ts-ignore
    pc.onicecandidate = (event: any) => {
      if (event.candidate && config.conversationId) {
        const targetConvId = !isCaller && config.callerId ? `dm:${config.callerId}` : config.conversationId;
        safeEmit(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
          conversationId: targetConvId,
          candidate: event.candidate,
        });
      }
    };

    // @ts-ignore
    pc.ontrack = (event: any) => {
      console.log('[useWebRTC] Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        console.log('[useWebRTC] Setting remote stream from event.streams[0]');
        setRemoteStream(event.streams[0]);
      } else {
        console.log('[useWebRTC] Creating new MediaStream for remote track');
        setRemoteStream((prevStream) => {
          const stream = prevStream || new MediaStream();
          stream.addTrack(event.track);
          return stream;
        });
      }
    };

    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: config.isVideo ? { 
          facingMode: 'user',
          width: 640,
          height: 480,
          frameRate: 30
        } : false,
      });
      setLocalStream(stream);
      
      stream.getTracks().forEach((track: any) => {
        pc.addTrack(track, stream);
      });
    } catch (e) {
      console.error('[useWebRTC] Failed to get local stream', e);
    }

    if (isCaller) {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      
      safeEmit(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
        conversationId: config.conversationId,
        offer,
      });
    }

    return pc;
  }, []);

  // Make a Call
  const startCall = async (isVideo: boolean, convId: string, targetId: string) => {
    if (callState !== 'IDLE') return;

    try {
      await socketClient.connect();
    } catch (error) {
      console.error('[useWebRTC] Cannot start call because socket is not connected', error);
      Alert.alert('Thong bao', 'Khong the ket noi de thuc hien cuoc goi. Vui long thu lai.');
      cleanup();
      return;
    }

    setCallState('CALLING');
    
    const config = { isVideo, targetUserId: targetId, conversationId: convId };
    setActiveConfig(config);

    try {
      await socketClient.emitWithAck(CHAT_SOCKET_EVENTS.CALL_INIT, {
        conversationId: convId,
        callerId: user?.sub,
        callerName: (user as any)?.fullName || 'Người gọi',
        isVideo,
      });
    } catch (error) {
      console.error('[useWebRTC] CALL_INIT failed', error);
      Alert.alert('Thong bao', 'Khong the bat dau cuoc goi luc nay. Vui long thu lai.');
      cleanup();
    }
  };

  // Accept a Call
  const acceptCall = async () => {
    if (callState !== 'INCOMING' || !activeConfig) return;
    setCallState('CONNECTED');
    
    // For incoming call, the signalling target is the Caller
    const targetConvId = activeConfig.callerId ? `dm:${activeConfig.callerId}` : activeConfig.conversationId;

    safeEmit(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
      conversationId: targetConvId,
      calleeId: user?.sub,
    });

    // Create RTCPeerConnection (Callee)
    await setupPeerConnection(false, activeConfig);
  };

  // Reject a Call
  const rejectCall = () => {
    if (activeConfig?.conversationId) {
      const targetConvId = activeConfig.callerId ? `dm:${activeConfig.callerId}` : activeConfig.conversationId;
      safeEmit(CHAT_SOCKET_EVENTS.CALL_REJECT, {
        conversationId: targetConvId,
        calleeId: user?.sub,
      });
    }
    cleanup();
  };

  // End an Active Call
  const endCall = () => {
    if (activeConfig?.conversationId) {
      const targetConvId = activeConfig.callerId ? `dm:${activeConfig.callerId}` : activeConfig.conversationId;
      safeEmit(CHAT_SOCKET_EVENTS.CALL_END, {
        conversationId: targetConvId,
        userId: user?.sub,
      });
    }
    cleanup();
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      const firstTrack = localStream.getAudioTracks()[0];
      if (firstTrack) {
        setIsMicOn(firstTrack.enabled);
      }
    }
  };

  const toggleVideo = async () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
      } else {
        // Nếu chưa có video track, thử lấy lại stream với video
        try {
          const newStream = await mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: true
          });
          const newVideoTrack = newStream.getVideoTracks()[0];
          if (newVideoTrack && peerConnection.current) {
            localStream.addTrack(newVideoTrack);
            peerConnection.current.addTrack(newVideoTrack, localStream);
            // Có thể cần tạo offer mới nếu renegotiation được hỗ trợ
          }
        } catch (e) {
          console.error('[useWebRTC] Failed to enable video', e);
        }
      }
    }
  };

  // Listen for Socket Events
  useEffect(() => {
    console.log('[useWebRTC] Listeners mounted for conv:', conversationId);

    const onCallInit = (data: any) => {
      // If we are not the caller
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
      // If we are the caller and callee accepted
      const targetMatches = activeConfig?.targetUserId === data.calleeId || activeConfig?.targetUserId === `dm:${data.calleeId}`;
      const isMatch = activeConfig?.conversationId === data.conversationId || targetMatches;

      if (isMatch && callState === 'CALLING') {
        setCallState('CONNECTED');
        await setupPeerConnection(true, activeConfig!);
      }
    };

    const onCallReject = (data: any) => {
      cleanup();
    };

    const onCallEnd = (data: any) => {
      cleanup();
    };

    const onOffer = async (data: any) => {
      if (!peerConnection.current) return;
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.offer));
      await flushPendingIceCandidates();
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      
      const targetConvId = activeConfig?.callerId ? `dm:${activeConfig.callerId}` : data.conversationId;

      safeEmit(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, {
        conversationId: targetConvId,
        answer,
      });
    };

    const onAnswer = async (data: any) => {
      if (!peerConnection.current) return;
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      await flushPendingIceCandidates();
    };

    const onIceCandidate = async (data: any) => {
      if (!peerConnection.current || !data.candidate) return;

      if (!peerConnection.current.remoteDescription) {
        pendingIceCandidatesRef.current.push(data.candidate);
        return;
      }

      try {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('[useWebRTC] Error adding received ice candidate', e);
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
  }, [callState, activeConfig, user?.sub, setupPeerConnection, cleanup, flushPendingIceCandidates, safeEmit]);

  return {
    callState,
    activeConfig,
    localStream,
    remoteStream,
    isMicOn,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
  };
};
