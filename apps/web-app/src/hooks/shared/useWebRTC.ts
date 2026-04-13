import { useState, useCallback, useRef } from 'react';
import { socketClient } from '../../lib/socket-client';
import { CHAT_SOCKET_EVENTS } from '@urban/shared-constants';

export type CallState = 'IDLE' | 'CALLING' | 'INCOMING' | 'CONNECTED';

export interface CallConfig {
  isVideo: boolean;
  targetUserId?: string;
  callerId?: string;
  callerName?: string;
  conversationId?: string;
}

export function useWebRTC() {
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [activeConfig, setActiveConfig] = useState<CallConfig | null>(null);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  
  // Pop-up/Alert state to show user
  const [callError, setCallError] = useState<string | null>(null);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Configure WebRTC with public STUN/TURN servers
  const getIceServers = () => {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
  };

  const cleanup = useCallback(() => {
    console.log('[WebRTC] Dọn dẹp kết nối');
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
    setCallError(null);
  }, [localStream, remoteStream]);

  // Handle emitting signal via Web Socket
  // Here we fix the buggy silent fail approach from mobile app
  const emitSignal = useCallback(async (event: string, payload: any) => {
    try {
      await socketClient.safeEmitValidated(event, payload);
    } catch (error: any) {
      console.error(`[WebRTC] Góp báo vòng cảnh kết nối gửi tín hiệu ở ${event}`, error);
      setCallError(error.message || 'Lỗi gửi tín hiệu qua máy chủ.');
      // Cleanup to prevent ghost calls if signal can't be established
      cleanup(); 
    }
  }, [cleanup]);

  const setupPeerConnection = useCallback(async (isCaller: boolean, config: CallConfig) => {
    // 1. Kiểm tra kĩ trạng thái kết nối máy chủ trước khi gọi media
    try {
        await socketClient.connect();
    } catch(err) {
        setCallError('Mất kết nối Internet hoặc lỗi Server. Không thể thực hiện cuộc gọi lúc này.');
        throw err;
    }
      
    const pc = new RTCPeerConnection(getIceServers());
    peerConnection.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && config.conversationId) {
        const targetConvId = !isCaller && config.callerId ? `dm:${config.callerId}` : config.conversationId;
        
        // Gửi ICE lên server cho peer đối diện
        emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
          conversationId: targetConvId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      } else {
        setRemoteStream((prevStream) => {
          const stream = prevStream || new MediaStream();
          stream.addTrack(event.track);
          return stream;
        });
      }
    };

    try {
      // 2. Native Browser API (navigator.mediaDevices) thay vì shim
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: config.isVideo ? { facingMode: 'user', width: 640, height: 480 } : false,
      });

      setLocalStream(stream);

      // Thêm các track local vào peerConnection
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

    } catch (error) {
      console.error('[WebRTC] Thiết bị hạn chế quyền hoặc lỗi cam/mic', error);
      setCallError('Cần cấp quyền Microphone và Camera để gọi.');
      throw error;
    }

    return pc;
  }, [emitSignal]);

  const startCall = useCallback(async (config: CallConfig) => {
    setActiveConfig(config);
    setCallState('CALLING');
    setCallError(null);

    try {
      const pc = await setupPeerConnection(true, config);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
        conversationId: config.conversationId,
        targetUserId: config.targetUserId,
        offer,
        isVideo: config.isVideo,
      });
      
    } catch (error) {
      cleanup();
    }
  }, [emitSignal, setupPeerConnection, cleanup]);

  // Các event hàm khác (accept, reject...) tương tự
  const endCall = useCallback(() => {
    if (activeConfig?.conversationId) {
         emitSignal(CHAT_SOCKET_EVENTS.CALL_END as any, { conversationId: activeConfig.conversationId });
    }
    cleanup();
  }, [activeConfig, emitSignal, cleanup]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMicOn(!isMicOn);
    }
  }, [localStream, isMicOn]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOn(!isVideoOn);
    }
  }, [localStream, isVideoOn]);

  return {
    callState,
    activeConfig,
    localStream,
    remoteStream,
    isMicOn,
    isVideoOn,
    callError,
    setCallError,
    startCall,
    endCall,
    toggleMute,
    toggleVideo,
    cleanup,
  };
}
