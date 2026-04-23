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
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [lastEndedCall, setLastEndedCall] = useState<CallEndedSummary | null>(null);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [activeGroupCalls, setActiveGroupCalls] = useState<Set<string>>(new Set());
  
  const [callError, setCallError] = useState<string | null>(null);
  
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const userIdRef = useRef<string | undefined>(user?.sub);
  const sentIceCandidateKeysRef = useRef<Set<string>>(new Set());
  const pendingIceSignalsRef = useRef<Array<{ conversationId: string; peerId: string; candidate: RTCIceCandidateInit }>>([]);
  const iceSignalTimerRef = useRef<number | null>(null);
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const leftPeersRef = useRef<Set<string>>(new Set());
  const activeConfigRef = useRef<CallConfig | null>(null);
  const callStateRef = useRef<CallState>('IDLE');
  const callStartedAtRef = useRef<number | null>(null);
  const activeGroupCallsTimeoutsRef = useRef<Map<string, number>>(new Map());

  const getIceServers = () => {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
  };

  const resolveSignalConversationId = useCallback(
    (config?: CallConfig | null, fallbackConversationId?: string): string | undefined => {
      const rawConversationId = (config?.conversationId ?? fallbackConversationId)?.trim();
      if (!rawConversationId) return undefined;

      const isGroupConversation = /^(group:|grp#|group#)/i.test(rawConversationId);
      const isIncomingDmCall =
        !isGroupConversation &&
        Boolean(config?.callerId) &&
        config?.callerId !== user?.sub;

      if (isIncomingDmCall) {
        return `dm:${config!.callerId}`;
      }

      return rawConversationId;
    },
    [user?.sub],
  );

  const isGroupCall = useCallback((config?: CallConfig | null) => {
    const rawConversationId = (config?.conversationId)?.trim();
    if (!rawConversationId) return false;
    return /^(group:|grp#|group#)/i.test(rawConversationId);
  }, []);

  const cleanup = useCallback((options?: { remoteDurationSeconds?: number }) => {
    console.log('[WebRTC] Dọn dẹp kết nối');
    const currentConfig = activeConfigRef.current;
    const isConnectedCall = callStateRef.current === 'CONNECTED' && Boolean(currentConfig);

    if (currentConfig && callStateRef.current !== 'IDLE') {
      const endedAt = Date.now();
      const computedDuration = (isConnectedCall && callStartedAtRef.current) 
        ? Math.max(0, Math.round((endedAt - callStartedAtRef.current) / 1000))
        : 0;
      const durationSeconds = typeof options?.remoteDurationSeconds === 'number'
        ? Math.max(0, Math.round(options.remoteDurationSeconds))
        : computedDuration;
        
      setLastEndedCall({
        conversationId: currentConfig.conversationId || '',
        peerUserId: currentConfig.callerId === userIdRef.current ? currentConfig.targetUserId : currentConfig.callerId,
        peerName: currentConfig.peerName || currentConfig.callerName || 'Người dùng',
        peerAvatarUrl: currentConfig.peerAvatarUrl || currentConfig.callerAvatarUrl,
        isVideo: Boolean(currentConfig.isVideo),
        durationSeconds,
        endedAt: new Date(endedAt).toISOString(),
        direction: currentConfig.callerId === userIdRef.current ? 'outgoing' : 'incoming',
      });
    }

    callStartedAtRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    setRemoteStreams(new Map());
    
    if (iceSignalTimerRef.current !== null) {
      window.clearTimeout(iceSignalTimerRef.current);
      iceSignalTimerRef.current = null;
    }
    pendingIceSignalsRef.current = [];
    sentIceCandidateKeysRef.current.clear();
    pendingIceCandidatesRef.current.clear();
    leftPeersRef.current.clear();
    setCallState('IDLE');
    callStateRef.current = 'IDLE';
    setActiveConfig(null);
    activeConfigRef.current = null;
    setCallError(null);
    mediaStreamPromiseRef.current = null;
  }, []);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    userIdRef.current = user?.sub;
  }, [user?.sub]);

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

    return () => window.clearInterval(intervalId);
  }, [callState]);

  const emitSignal = useCallback(async (event: string, payload: any): Promise<boolean> => {
    try {
      await socketClient.safeEmitValidated(event, payload);
      return true;
    } catch (error: any) {
      if (event === CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE && error?.statusCode === 409) {
         return false;
      }
      console.error(`[WebRTC] Lỗi gửi tín hiệu ở ${event}`, error);
      setCallError(error.message || 'Lỗi gửi tín hiệu qua máy chủ.');
      // Only cleanup if it's a critical init/accept failure, otherwise might just be 1 peer failing
      if (event === CHAT_SOCKET_EVENTS.CALL_INIT || event === CHAT_SOCKET_EVENTS.CALL_ACCEPT) {
         cleanup();
      }
      return false;
    }
  }, [cleanup]);

  useEffect(() => {
    if (callState !== 'CONNECTED' || !activeConfigRef.current) return;

    const emitHeartbeat = () => {
      const signalConvId = resolveSignalConversationId(activeConfigRef.current!);
      if (signalConvId) {
        emitSignal(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, {
          conversationId: signalConvId,
          userId: userIdRef.current,
        }).catch(() => {});
      }
    };

    emitHeartbeat();
    const interval = setInterval(emitHeartbeat, 30000);

    return () => clearInterval(interval);
  }, [callState, emitSignal, resolveSignalConversationId]);

  const flushQueuedIceSignals = useCallback(() => {
    if (iceSignalTimerRef.current !== null) return;

    const processQueue = async () => {
      const nextItem = pendingIceSignalsRef.current.shift();
      if (!nextItem) {
        iceSignalTimerRef.current = null;
        return;
      }

      // Add targetId and senderId for Group mesh routing
      await emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
        conversationId: nextItem.conversationId,
        candidate: { ...nextItem.candidate, targetId: nextItem.peerId, senderId: userIdRef.current },
      });

      if (pendingIceSignalsRef.current.length === 0) {
        iceSignalTimerRef.current = null;
        return;
      }

      iceSignalTimerRef.current = window.setTimeout(() => void processQueue(), 120);
    };

    iceSignalTimerRef.current = window.setTimeout(() => void processQueue(), 0);
  }, [emitSignal]);

  const queueIceCandidateSignal = useCallback(
    (conversationId: string, peerId: string, candidate: RTCIceCandidateInit) => {
      const key = `${candidate.candidate || ''}|${candidate.sdpMid || ''}|${candidate.sdpMLineIndex ?? ''}|${peerId}`;
      if (!candidate.candidate || sentIceCandidateKeysRef.current.has(key)) return;

      if (sentIceCandidateKeysRef.current.size >= 100) return; // limit fan-out

      sentIceCandidateKeysRef.current.add(key);
      pendingIceSignalsRef.current.push({ conversationId, peerId, candidate });
      flushQueuedIceSignals();
    },
    [flushQueuedIceSignals],
  );

  const flushPendingIceCandidates = useCallback(async (peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (!pc || !pc.remoteDescription) return;

    const candidates = pendingIceCandidatesRef.current.get(peerId) || [];
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new window.RTCIceCandidate(candidate));
      } catch (error) {
        console.error('[WebRTC] Failed to apply queued ICE candidate', error);
      }
    }
    pendingIceCandidatesRef.current.set(peerId, []);
  }, []);

  const requestLocalMediaStream = useCallback(async (isVideo: boolean) => {
    if (localStreamRef.current) return localStreamRef.current;
    if (mediaStreamPromiseRef.current) return mediaStreamPromiseRef.current;

    mediaStreamPromiseRef.current = (async () => {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      if (!isVideo) {
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        return audioStream;
      }

      const videoConstraints = { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } };

      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
        const combinedStream = new MediaStream();
        audioStream.getAudioTracks().forEach((track) => combinedStream.addTrack(track));
        videoStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));

        localStreamRef.current = combinedStream;
        setLocalStream(combinedStream);
        return combinedStream;
      } catch (error) {
        console.warn('[WebRTC] Camera unavailable, falling back to audio-only call', error);
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        return audioStream;
      }
    })();
    return mediaStreamPromiseRef.current;
  }, []);

  const setupPeerConnection = useCallback(async (peerId: string, isOfferCreator: boolean, config: CallConfig) => {
    let pc = peerConnectionsRef.current.get(peerId);
    if (pc) return pc;

    try {
      await socketClient.connect();
    } catch(err) {
      setCallError('Mất kết nối Internet hoặc lỗi Server. Không thể thực hiện cuộc gọi lúc này.');
      throw err;
    }

    try {
      const stream = await requestLocalMediaStream(config.isVideo);

      pc = new RTCPeerConnection(getIceServers());
      peerConnectionsRef.current.set(peerId, pc);

      pc.onicecandidate = (event) => {
        const signalConversationId = resolveSignalConversationId(config);
        if (event.candidate && signalConversationId) {
          queueIceCandidateSignal(signalConversationId, peerId, event.candidate.toJSON());
        }
      };

      pc.ontrack = (event) => {
        setRemoteStreams((prev) => {
          const nextMap = new Map(prev);
          const existingStream = nextMap.get(peerId);
          if (existingStream) {
            existingStream.addTrack(event.track);
          } else if (event.streams && event.streams[0]) {
            nextMap.set(peerId, event.streams[0]);
          } else {
            const newStream = new MediaStream();
            newStream.addTrack(event.track);
            nextMap.set(peerId, newStream);
          }
          return nextMap;
        });
      };

      stream.getTracks().forEach((track) => pc!.addTrack(track, stream));

      if (isOfferCreator) {
        const signalConversationId = resolveSignalConversationId(config);
        if (!signalConversationId) throw new Error('Missing signaling conversation id');

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Nhúng targetId, senderId để nhóm có thể định tuyến Mesh
        await emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
          conversationId: signalConversationId,
          offer: { type: offer.type, sdp: offer.sdp, targetId: peerId, senderId: user?.sub },
        });
      }

    } catch (error) {
      console.error('[WebRTC] Thiết bị hạn chế quyền hoặc lỗi cam/mic', error);
      if (peerConnectionsRef.current.size === 0) cleanup();

      if ((error as { name?: string })?.name === 'NotReadableError') {
        setCallError('Camera/Microphone đang bị ứng dụng khác sử dụng.');
      } else if ((error as { name?: string })?.name === 'NotAllowedError') {
        setCallError('Trình duyệt chặn quyền Microphone/Camera.');
      } else {
        setCallError('Cần cấp quyền Microphone và Camera để gọi.');
      }
      throw error;
    }

    return pc;
  }, [emitSignal, queueIceCandidateSignal, resolveSignalConversationId, requestLocalMediaStream, cleanup, user?.sub]);

  const initiateConnectionWithPeer = useCallback(async (peerId: string, config: CallConfig) => {
    if (peerId === user?.sub) return;
    if (peerConnectionsRef.current.has(peerId)) return;

    if (!isGroupCall(config)) {
      // 1-1 Call: Legacy mode
      const isCaller = config.callerId === user?.sub;
      await setupPeerConnection(peerId, isCaller, config);
      return;
    }

    // Group Call: Full Mesh, Polite/Impolite peer using User ID
    const amIHigherId = (user?.sub || "") > peerId;
    if (amIHigherId) {
      await setupPeerConnection(peerId, true, config); // Create offer
    } else {
      await setupPeerConnection(peerId, false, config); // Wait for offer
      // Let the peer know I'm here
      const signalConvId = resolveSignalConversationId(config);
      if (signalConvId) {
        await emitSignal(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, {
          conversationId: signalConvId,
          userId: user?.sub,
        });
      }
    }
  }, [user?.sub, isGroupCall, setupPeerConnection, emitSignal, resolveSignalConversationId]);

  const startCall = useCallback(async (config: CallConfig) => {
    if (callStateRef.current !== 'IDLE') return;

    setLastEndedCall(null);
    setActiveConfig(config);
    activeConfigRef.current = config;
    setCallState('CALLING');
    callStateRef.current = 'CALLING';
    setCallError(null);

    const signalConversationId = resolveSignalConversationId(config);
    if (!signalConversationId) {
      cleanup();
      return;
    }

    try {
      await socketClient.safeEmitValidated(CHAT_SOCKET_EVENTS.CALL_INIT, {
        conversationId: signalConversationId,
        callerId: user?.sub,
        callerName: config.callerName || 'Người gọi',
        callerAvatarUrl: config.callerAvatarUrl,
        isVideo: config.isVideo,
      });
    } catch (error: any) {
      if (error?.statusCode === 409 && isGroupCall(config)) {
        console.log('[WebRTC] Group call already active, joining mesh directly...');
        
        try {
          await requestLocalMediaStream(config.isVideo);
        } catch (err) {
          console.error('[WebRTC] Local media stream failed', err);
        }

        setCallState('CONNECTED');
        callStateRef.current = 'CONNECTED';
        callStartedAtRef.current = Date.now();
        setCallError(null);

        try {
          await socketClient.safeEmitValidated(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
            conversationId: signalConversationId,
            calleeId: user?.sub,
          });
        } catch (acceptErr) {
          console.error('[WebRTC] Lỗi tham gia cuộc gọi nhóm đang diễn ra', acceptErr);
          setCallError('Lỗi tham gia cuộc gọi nhóm đang diễn ra.');
          cleanup();
          return;
        }
        
        emitSignal(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, {
          conversationId: signalConversationId,
          userId: user?.sub,
        }).catch(() => {});
        return;
      }
      
      console.error('[WebRTC] Lỗi gửi tín hiệu ở call.init', error);
      setCallError(error?.message || 'Không thể khởi tạo cuộc gọi.');
      cleanup();
    }
  }, [emitSignal, cleanup, resolveSignalConversationId, user?.sub, isGroupCall, requestLocalMediaStream]);

  const joinCall = useCallback(async (config: CallConfig) => {
    if (callStateRef.current !== 'IDLE') return;

    setLastEndedCall(null);
    setActiveConfig(config);
    activeConfigRef.current = config;
    setCallError(null);

    const signalConversationId = resolveSignalConversationId(config);
    if (!signalConversationId) {
      cleanup();
      return;
    }

    try {
      await requestLocalMediaStream(config.isVideo);
    } catch (err) {
      console.error('[WebRTC] Local media stream failed', err);
    }

    setCallState('CONNECTED');
    callStateRef.current = 'CONNECTED';
    callStartedAtRef.current = Date.now();
    
    try {
      await socketClient.safeEmitValidated(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
        conversationId: signalConversationId,
        calleeId: user?.sub,
      });
    } catch (acceptErr) {
      console.error('[WebRTC] Lỗi tham gia cuộc gọi nhóm đang diễn ra', acceptErr);
      setCallError('Lỗi tham gia cuộc gọi nhóm đang diễn ra.');
      cleanup();
      return;
    }
    
    emitSignal(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, {
      conversationId: signalConversationId,
      userId: user?.sub,
    }).catch(() => {});
  }, [emitSignal, cleanup, resolveSignalConversationId, user?.sub, requestLocalMediaStream]);

  const acceptCall = useCallback(async () => {
    if (callStateRef.current !== 'INCOMING' || !activeConfigRef.current) return;

    const config = activeConfigRef.current;
    const signalConversationId = resolveSignalConversationId(config);
    if (!signalConversationId) {
      cleanup();
      return;
    }

    setLastEndedCall(null);

    const accepted = await emitSignal(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
      conversationId: signalConversationId,
      calleeId: user?.sub,
    });
    if (!accepted) return;

    setCallState('CONNECTED');
    callStateRef.current = 'CONNECTED';
    
    if (!isGroupCall(config)) {
      const peerId = config.callerId!;
      await initiateConnectionWithPeer(peerId, config);
    }
  }, [cleanup, emitSignal, resolveSignalConversationId, user?.sub, isGroupCall, initiateConnectionWithPeer]);

  const rejectCall = useCallback(async () => {
    const config = activeConfigRef.current;
    const signalConversationId = resolveSignalConversationId(config);
    if (signalConversationId) {
      await emitSignal(CHAT_SOCKET_EVENTS.CALL_REJECT, {
        conversationId: signalConversationId,
        calleeId: user?.sub,
      });
    }
    cleanup();
  }, [emitSignal, cleanup, resolveSignalConversationId, user?.sub]);

  const endCall = useCallback(() => {
    const config = activeConfigRef.current;
    const signalConversationId = resolveSignalConversationId(config);
    if (signalConversationId) {
      if (isGroupCall(config) && peerConnectionsRef.current.size > 0) {
        void emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
          conversationId: signalConversationId,
          offer: { type: 'offer', sdp: 'LEAVE_GROUP', senderId: user?.sub },
        });
      } else {
        const durationSeconds = callStartedAtRef.current ? Math.max(0, Math.round((Date.now() - callStartedAtRef.current) / 1000)) : 0;
        void emitSignal(CHAT_SOCKET_EVENTS.CALL_END as any, {
          conversationId: signalConversationId,
          userId: user?.sub,
          durationSeconds,
        });
      }
    }
    cleanup();
  }, [emitSignal, cleanup, resolveSignalConversationId, user?.sub, isGroupCall]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
      setIsMicOn(!isMicOn);
    }
  }, [localStream, isMicOn]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !track.enabled);
      setIsVideoOn(!isVideoOn);
    }
  }, [localStream, isVideoOn]);
useEffect(() => {
    let mounted = true;
    let boundSocket: typeof socketClient.socket | null = null;

    const getFallbackPeerId = () => activeConfigRef.current?.callerId === userIdRef.current ? activeConfigRef.current?.targetUserId : activeConfigRef.current?.callerId;

    const onCallInit = (data: any) => {
        if (data.callerId === userIdRef.current) return;
        
        // If already in a call, ignore new calls unless it's the SAME group
        const currentConfig = activeConfigRef.current;
        if (callStateRef.current !== 'IDLE') {
           if (!currentConfig || currentConfig.conversationId !== data.conversationId) return;
           if (!isGroupCall(currentConfig)) return;
        }

        if (callStateRef.current === 'IDLE') {
          const config = {
            isVideo: Boolean(data.isVideo),
            callerId: data.callerId,
            callerName: data.callerName,
            peerName: data.callerName,
            peerAvatarUrl: data.callerAvatarUrl,
            conversationId: data.conversationId,
          };
          setActiveConfig(config);
          activeConfigRef.current = config;
          setCallState('INCOMING');
          callStateRef.current = 'INCOMING';
        }
      };

      const onCallAccept = async (data: any) => {
        const config = activeConfigRef.current;
        if (!config || (callStateRef.current !== 'CALLING' && callStateRef.current !== 'CONNECTED')) return;

        const targetMatches = config.targetUserId === data.calleeId;
        const isMatch = config.conversationId === data.conversationId || targetMatches;
        if (!isMatch) return;

        const peerId = data.calleeId;
        if (peerId === userIdRef.current) return;
        
        leftPeersRef.current.delete(peerId);

        if (callStateRef.current !== 'CONNECTED') {
          setCallState('CONNECTED');
        }

        await initiateConnectionWithPeer(peerId, config);
      };

      const onCallHeartbeat = async (data: any) => {
         const config = activeConfigRef.current;
         const conversationId = data.conversationId;

         if (/^(group:|grp#|group#)/i.test(conversationId)) {
           setActiveGroupCalls(prev => {
             if (!prev.has(conversationId)) {
               const next = new Set(prev);
               next.add(conversationId);
               return next;
             }
             return prev;
           });
           
           if (activeGroupCallsTimeoutsRef.current.has(conversationId)) {
             clearTimeout(activeGroupCallsTimeoutsRef.current.get(conversationId));
           }
           
           activeGroupCallsTimeoutsRef.current.set(conversationId, window.setTimeout(() => {
             setActiveGroupCalls(prev => {
               const next = new Set(prev);
               next.delete(conversationId);
               return next;
             });
             activeGroupCallsTimeoutsRef.current.delete(conversationId);
           }, 15000));
         }

         if (!config || callStateRef.current !== 'CONNECTED') return;
         if (config.conversationId !== conversationId) return;

         const peerId = data.userId;
         if (peerId === userIdRef.current || leftPeersRef.current.has(peerId)) return;
         if (!peerConnectionsRef.current.has(peerId)) {
           if (userIdRef.current && userIdRef.current > peerId) {
             await initiateConnectionWithPeer(peerId, config);
           }
         }
      };

      const onCallReject = (data: any) => {
         if (!isGroupCall(activeConfigRef.current)) {
            cleanup();
         }
      };

      const onCallEnd = (data: any) => {
        const peerId = data.endedByUserId || data.userId;
        if (peerId === userIdRef.current) return;

        if (isGroupCall(activeConfigRef.current)) {
          const pc = peerConnectionsRef.current.get(peerId);
          if (pc) {
            pc.close();
            peerConnectionsRef.current.delete(peerId);
          }
          setRemoteStreams(prev => {
            const next = new Map(prev);
            next.delete(peerId);
            return next;
          });
          pendingIceCandidatesRef.current.delete(peerId);
          
          if (peerConnectionsRef.current.size === 0) {
            cleanup(); // No one else in group
          }
        } else {
          cleanup({ remoteDurationSeconds: data?.durationSeconds });
        }
      };

      const onOffer = async (data: any) => {
        const offerPayload = data.offer;
        const actualSenderId = offerPayload.senderId || getFallbackPeerId();
        
        if (offerPayload.sdp === 'LEAVE_GROUP') {
           if (actualSenderId && actualSenderId !== userIdRef.current) {
             leftPeersRef.current.add(actualSenderId);
             const pc = peerConnectionsRef.current.get(actualSenderId);
             if (pc) {
               pc.close();
               peerConnectionsRef.current.delete(actualSenderId);
             }
             setRemoteStreams(prev => {
               const next = new Map(prev);
               next.delete(actualSenderId);
               return next;
             });
             pendingIceCandidatesRef.current.delete(actualSenderId);
           }
           return;
        }

        const actualTargetId = offerPayload.targetId || userIdRef.current;
        if (actualTargetId !== userIdRef.current || !actualSenderId) return;
        
        leftPeersRef.current.delete(actualSenderId);

        let pc = peerConnectionsRef.current.get(actualSenderId);
        if (!pc) {
          pc = await setupPeerConnection(actualSenderId, false, activeConfigRef.current!);
        }

        await pc.setRemoteDescription(new window.RTCSessionDescription(offerPayload));
        await flushPendingIceCandidates(actualSenderId);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        const signalConvId = resolveSignalConversationId(activeConfigRef.current!, data.conversationId);
        await emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, {
          conversationId: signalConvId,
          answer: { type: answer.type, sdp: answer.sdp, senderId: userIdRef.current, targetId: actualSenderId },
        });
      };

      const onAnswer = async (data: any) => {
        const answerPayload = data.answer;
        const actualSenderId = answerPayload.senderId || getFallbackPeerId();
        const actualTargetId = answerPayload.targetId || userIdRef.current;

        if (actualTargetId !== userIdRef.current || !actualSenderId) return;

        const pc = peerConnectionsRef.current.get(actualSenderId);
        if (!pc) return;

        await pc.setRemoteDescription(new window.RTCSessionDescription(answerPayload));
        await flushPendingIceCandidates(actualSenderId);
      };

      const onIceCandidate = async (data: any) => {
        const candidatePayload = data.candidate;
        if (!candidatePayload) return;

        const actualSenderId = candidatePayload.senderId || getFallbackPeerId();
        const actualTargetId = candidatePayload.targetId || userIdRef.current;

        if (actualTargetId !== userIdRef.current || !actualSenderId) return;

        const pc = peerConnectionsRef.current.get(actualSenderId);
        if (!pc || !pc.remoteDescription) {
          if (!pendingIceCandidatesRef.current.has(actualSenderId)) {
            pendingIceCandidatesRef.current.set(actualSenderId, []);
          }
          pendingIceCandidatesRef.current.get(actualSenderId)!.push(candidatePayload);
          return;
        }

        try {
          await pc.addIceCandidate(new window.RTCIceCandidate(candidatePayload));
        } catch (error) {}
      };

    const bindSocketEvents = async () => {
      try {
        await socketClient.connect();
      } catch (e) {
        return;
      }
      
      if (!mounted || !socketClient.socket) return;
      boundSocket = socketClient.socket;

      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_INIT, onCallInit);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_ACCEPT, onCallAccept);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_REJECT, onCallReject);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_END, onCallEnd);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, onCallHeartbeat);
      boundSocket.on(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, onOffer);
      boundSocket.on(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, onAnswer);
      boundSocket.on(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, onIceCandidate);
    };

    void bindSocketEvents();

    return () => {
      mounted = false;
      if (boundSocket) {
        boundSocket.off(CHAT_SOCKET_EVENTS.CALL_INIT, onCallInit);
        boundSocket.off(CHAT_SOCKET_EVENTS.CALL_ACCEPT, onCallAccept);
        boundSocket.off(CHAT_SOCKET_EVENTS.CALL_REJECT, onCallReject);
        boundSocket.off(CHAT_SOCKET_EVENTS.CALL_END, onCallEnd);
        boundSocket.off(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, onCallHeartbeat);
        boundSocket.off(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, onOffer);
        boundSocket.off(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, onAnswer);
        boundSocket.off(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, onIceCandidate);
      }
    };
  }, [cleanup, emitSignal, flushPendingIceCandidates, resolveSignalConversationId, setupPeerConnection, initiateConnectionWithPeer, isGroupCall, user?.sub]);

  return {
    callState,
    activeConfig,
    localStream,
    remoteStreams,
    isMicOn,
    isVideoOn,
    callError,
    setCallError,
    startCall,
    joinCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    cleanup,
    lastEndedCall,
    callDurationSeconds,
    clearLastEndedCall: () => setLastEndedCall(null),
    activeGroupCalls,
  };
}
