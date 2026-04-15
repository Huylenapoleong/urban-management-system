import { useState, useCallback, useRef, useEffect } from 'react';
import { socketClient } from '../../lib/socket-client';
import { CHAT_SOCKET_EVENTS } from '@urban/shared-constants';
import { useAuth } from '@/providers/AuthProvider';

export type CallState = 'IDLE' | 'CALLING' | 'INCOMING' | 'CONNECTED';

export interface CallConfig {
  isVideo: boolean;
  targetUserId?: string;
  callerId?: string;
  callerName?: string;
  callerAvatarUrl?: string;
  peerName?: string;
  peerAvatarUrl?: string;
  conversationId?: string;
}

export interface CallEndedSummary {
  conversationId: string;
  peerUserId?: string;
  peerName: string;
  peerAvatarUrl?: string;
  isVideo: boolean;
  durationSeconds: number;
  endedAt: string;
  direction: "incoming" | "outgoing";
}

export function useWebRTC() {
  const { user } = useAuth();
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [activeConfig, setActiveConfig] = useState<CallConfig | null>(null);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [lastEndedCall, setLastEndedCall] = useState<CallEndedSummary | null>(null);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  
  // Pop-up/Alert state to show user
  const [callError, setCallError] = useState<string | null>(null);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const activeConfigRef = useRef<CallConfig | null>(null);
  const callStateRef = useRef<CallState>('IDLE');
  const callStartedAtRef = useRef<number | null>(null);

  // Configure WebRTC with public STUN/TURN servers
  const getIceServers = () => {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
  };

  const cleanup = useCallback((options?: { remoteDurationSeconds?: number }) => {
    console.log('[WebRTC] Dọn dẹp kết nối');
    const currentConfig = activeConfigRef.current;
    const isConnectedCall = callStateRef.current === 'CONNECTED' && Boolean(currentConfig);

    if (isConnectedCall && callStartedAtRef.current) {
      const endedAt = Date.now();
      const computedDuration = Math.max(0, Math.round((endedAt - callStartedAtRef.current) / 1000));
      const durationSeconds = typeof options?.remoteDurationSeconds === 'number'
        ? Math.max(0, Math.round(options.remoteDurationSeconds))
        : computedDuration;
      setLastEndedCall({
        conversationId: currentConfig!.conversationId || '',
        peerUserId: currentConfig?.callerId === user?.sub ? currentConfig?.targetUserId : currentConfig?.callerId,
        peerName: currentConfig?.peerName || currentConfig?.callerName || 'Người dùng',
        peerAvatarUrl: currentConfig?.peerAvatarUrl || currentConfig?.callerAvatarUrl,
        isVideo: Boolean(currentConfig?.isVideo),
        durationSeconds,
        endedAt: new Date(endedAt).toISOString(),
        direction: currentConfig?.callerId === user?.sub ? 'outgoing' : 'incoming',
      });
    }

    callStartedAtRef.current = null;
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
  }, [localStream, remoteStream, user?.sub]);

  useEffect(() => {
    activeConfigRef.current = activeConfig;
  }, [activeConfig]);

  useEffect(() => {
    callStateRef.current = callState;

    if (callState === 'CONNECTED' && !callStartedAtRef.current) {
      callStartedAtRef.current = Date.now();
    }

    if (callState === 'IDLE') {
      callStartedAtRef.current = null;
      setCallDurationSeconds(0);
    }
  }, [callState]);

  useEffect(() => {
    if (callState !== 'CONNECTED' || !callStartedAtRef.current) {
      setCallDurationSeconds(0);
      return;
    }

    const tick = () => {
      setCallDurationSeconds(Math.max(0, Math.floor((Date.now() - callStartedAtRef.current!) / 1000)));
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [callState]);

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

  const flushPendingIceCandidates = useCallback(async () => {
    if (!peerConnection.current || !peerConnection.current.remoteDescription) {
      return;
    }

    for (const candidate of pendingIceCandidatesRef.current) {
      try {
        await peerConnection.current.addIceCandidate(new window.RTCIceCandidate(candidate));
      } catch (error) {
        console.error('[WebRTC] Failed to apply queued ICE candidate', error);
      }
    }
    pendingIceCandidatesRef.current = [];
  }, []);

  const requestLocalMediaStream = useCallback(async (isVideo: boolean) => {
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    if (!isVideo) {
      return {
        stream: audioStream,
        hasVideo: false,
      };
    }

    const videoConstraints = {
      facingMode: { ideal: 'user' },
      width: { ideal: 640 },
      height: { ideal: 480 },
    };

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });

      const combinedStream = new MediaStream();
      audioStream.getAudioTracks().forEach((track) => combinedStream.addTrack(track));
      videoStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));

      return {
        stream: combinedStream,
        hasVideo: true,
      };
    } catch (error) {
      console.warn('[WebRTC] Camera unavailable, falling back to audio-only call', error);
      return {
        stream: audioStream,
        hasVideo: false,
      };
    }
  }, []);

  const setupPeerConnection = useCallback(async (isCaller: boolean, config: CallConfig) => {
    // 1. Kiểm tra kĩ trạng thái kết nối máy chủ trước khi gọi media
    try {
        await socketClient.connect();
    } catch(err) {
        setCallError('Mất kết nối Internet hoặc lỗi Server. Không thể thực hiện cuộc gọi lúc này.');
        throw err;
    }

    let pc: RTCPeerConnection | null = null;
      
    try {
      // 2. Native Browser API (navigator.mediaDevices) thay vì shim
      const { stream } = await requestLocalMediaStream(config.isVideo);

      pc = new RTCPeerConnection(getIceServers());
      peerConnection.current = pc;
      const connection = pc;

      connection.onicecandidate = (event) => {
        if (event.candidate && config.conversationId) {
          const targetConvId = !isCaller && config.callerId ? `dm:${config.callerId}` : config.conversationId;
          
          // Gửi ICE lên server cho peer đối diện
          emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
            conversationId: targetConvId,
            candidate: event.candidate,
          });
        }
      };

      connection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        } else {
          setRemoteStream((prevStream) => {
            const nextStream = prevStream || new MediaStream();
            nextStream.addTrack(event.track);
            return nextStream;
          });
        }
      };

      setLocalStream(stream);

      // Thêm các track local vào peerConnection
      stream.getTracks().forEach((track) => {
        connection.addTrack(track, stream);
      });

      if (isCaller) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
          conversationId: config.conversationId,
          offer,
        });
      }

    } catch (error) {
      console.error('[WebRTC] Thiết bị hạn chế quyền hoặc lỗi cam/mic', error);
      cleanup();

      if ((error as { name?: string })?.name === 'NotReadableError') {
        setCallError('Camera hoặc microphone đang bị ứng dụng khác sử dụng. Hãy đóng tab/app khác rồi thử lại.');
      } else if ((error as { name?: string })?.name === 'NotAllowedError') {
        setCallError('Trình duyệt đang chặn quyền Microphone/Camera. Hãy cấp quyền rồi thử lại.');
      } else if ((error as { name?: string })?.name === 'OverconstrainedError') {
        setCallError('Thiết bị không đáp ứng được cấu hình camera hiện tại. Hãy thử lại hoặc dùng thiết bị khác.');
      } else {
        setCallError('Cần cấp quyền Microphone và Camera để gọi.');
      }
      throw error;
    }

    return pc!;
  }, [emitSignal]);

  const startCall = useCallback(async (config: CallConfig) => {
    if (callStateRef.current !== 'IDLE') return;

    setLastEndedCall(null);
    setActiveConfig(config);
    setCallState('CALLING');
    setCallError(null);

    try {
      await emitSignal(CHAT_SOCKET_EVENTS.CALL_INIT, {
        conversationId: config.conversationId,
        callerId: user?.sub,
        callerName: config.callerName || 'Người gọi',
        callerAvatarUrl: config.callerAvatarUrl,
        isVideo: config.isVideo,
      });
    } catch (error) {
      cleanup();
    }
  }, [emitSignal, cleanup, user?.sub]);

  const acceptCall = useCallback(async () => {
    if (callStateRef.current !== 'INCOMING' || !activeConfigRef.current) return;

    const config = activeConfigRef.current;
    setLastEndedCall(null);
    setCallState('CONNECTED');

    const targetConvId = config.callerId ? `dm:${config.callerId}` : config.conversationId;

    await emitSignal(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
      conversationId: targetConvId,
      calleeId: user?.sub,
    });
    await setupPeerConnection(false, config);
  }, [emitSignal, setupPeerConnection, user?.sub]);

  const rejectCall = useCallback(async () => {
    const config = activeConfigRef.current;
    if (config?.conversationId) {
      const targetConvId = config.callerId ? `dm:${config.callerId}` : config.conversationId;
      await emitSignal(CHAT_SOCKET_EVENTS.CALL_REJECT, {
        conversationId: targetConvId,
        calleeId: user?.sub,
      });
    }
    cleanup();
  }, [emitSignal, cleanup, user?.sub]);

  // Các event hàm khác (accept, reject...) tương tự
  const endCall = useCallback(() => {
    const config = activeConfigRef.current;
    const startedAt = callStartedAtRef.current;
    const durationSeconds = startedAt
      ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      : 0;

    if (config?.conversationId) {
      const isCurrentUserCaller = config.callerId === user?.sub;
      const targetConvId = isCurrentUserCaller
        ? config.conversationId
        : (config.callerId ? `dm:${config.callerId}` : config.conversationId);
      emitSignal(CHAT_SOCKET_EVENTS.CALL_END as any, {
        conversationId: targetConvId,
        userId: user?.sub,
        durationSeconds,
      });
    }
    cleanup();
  }, [emitSignal, cleanup, user?.sub]);

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

  useEffect(() => {
    let mounted = true;
    let boundSocket: typeof socketClient.socket | null = null;

    const bindSocketEvents = async () => {
      try {
        await socketClient.connect();
      } catch (error) {
        console.error('[WebRTC] Could not bind socket listeners', error);
        return;
      }

      if (!mounted || !socketClient.socket) {
        return;
      }

      boundSocket = socketClient.socket;

      const onCallInit = (data: any) => {
        if (data.callerId === user?.sub) {
          return;
        }
        setCallState('INCOMING');
        setActiveConfig({
          isVideo: Boolean(data.isVideo),
          callerId: data.callerId,
          callerName: data.callerName,
          peerName: data.callerName,
          peerAvatarUrl: data.callerAvatarUrl,
          conversationId: data.conversationId,
        });
      };

      const onCallAccept = async (data: any) => {
        const config = activeConfigRef.current;
        if (!config || callStateRef.current !== 'CALLING') {
          return;
        }

        const targetMatches = config.targetUserId === data.calleeId || config.targetUserId === `dm:${data.calleeId}`;
        const isMatch = config.conversationId === data.conversationId || targetMatches;
        if (!isMatch) {
          return;
        }

        setCallState('CONNECTED');
        await setupPeerConnection(true, config);
      };

      const onCallReject = () => cleanup();
      const onCallEnd = (data: any) => cleanup({ remoteDurationSeconds: data?.durationSeconds });

      const onOffer = async (data: any) => {
        if (!peerConnection.current) {
          return;
        }

        await peerConnection.current.setRemoteDescription(new window.RTCSessionDescription(data.offer));
        await flushPendingIceCandidates();
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);

        const currentConfig = activeConfigRef.current;
        const targetConvId = currentConfig?.callerId ? `dm:${currentConfig.callerId}` : data.conversationId;
        await emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, {
          conversationId: targetConvId,
          answer,
        });
      };

      const onAnswer = async (data: any) => {
        if (!peerConnection.current) {
          return;
        }
        await peerConnection.current.setRemoteDescription(new window.RTCSessionDescription(data.answer));
        await flushPendingIceCandidates();
      };

      const onIceCandidate = async (data: any) => {
        if (!peerConnection.current || !data.candidate) {
          return;
        }

        if (!peerConnection.current.remoteDescription) {
          pendingIceCandidatesRef.current.push(data.candidate);
          return;
        }

        try {
          await peerConnection.current.addIceCandidate(new window.RTCIceCandidate(data.candidate));
        } catch (error) {
          console.error('[WebRTC] Failed to add ICE candidate', error);
        }
      };

      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_INIT, onCallInit);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_ACCEPT, onCallAccept);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_REJECT, onCallReject);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_END, onCallEnd);
      boundSocket.on(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, onOffer);
      boundSocket.on(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, onAnswer);
      boundSocket.on(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, onIceCandidate);

      const cleanupListeners = () => {
        boundSocket?.off(CHAT_SOCKET_EVENTS.CALL_INIT, onCallInit);
        boundSocket?.off(CHAT_SOCKET_EVENTS.CALL_ACCEPT, onCallAccept);
        boundSocket?.off(CHAT_SOCKET_EVENTS.CALL_REJECT, onCallReject);
        boundSocket?.off(CHAT_SOCKET_EVENTS.CALL_END, onCallEnd);
        boundSocket?.off(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, onOffer);
        boundSocket?.off(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, onAnswer);
        boundSocket?.off(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, onIceCandidate);
      };

      return cleanupListeners;
    };

    let removeListeners: (() => void) | undefined;
    bindSocketEvents().then((cleanupFn) => {
      removeListeners = cleanupFn;
    });

    return () => {
      mounted = false;
      if (removeListeners) {
        removeListeners();
      }
    };
  }, [cleanup, emitSignal, flushPendingIceCandidates, setupPeerConnection, user?.sub]);

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
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    cleanup,
    lastEndedCall,
    callDurationSeconds,
    clearLastEndedCall: () => setLastEndedCall(null),
  };
}
