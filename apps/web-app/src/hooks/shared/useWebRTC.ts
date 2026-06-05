import { useAuth } from "@/providers/auth-context";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type {
  ChatCallAcceptPayload,
  ChatCallEndPayload,
  ChatCallHeartbeatPayload,
  ChatCallInitPayload,
  ChatCallRingingPayload,
  ChatWebRTCAnswerPayload,
  ChatWebRTCIceCandidatePayload,
  ChatWebRTCOfferPayload,
} from "@urban/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { socketClient } from "../../lib/socket-client";

export type CallState =
  | "IDLE"
  | "CALLING"
  | "INCOMING"
  | "CONNECTED"
  | "CONNECTING"
  | "RINGING";

export interface CallConfig {
  isVideo: boolean;
  targetUserId?: string;
  callerId?: string;
  callerName?: string;
  callerAvatarUrl?: string;
  peerName?: string;
  peerAvatarUrl?: string;
  participantNames?: Record<string, string>;
  participantAvatarUrls?: Record<string, string>;
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

type SocketErrorLike = {
  message?: string;
  name?: string;
  status?: number;
  statusCode?: number;
};

type CallInitEvent = ChatCallInitPayload & {
  callerAvatarUrl?: string;
};

type WebRTCSignalDescription = RTCSessionDescriptionInit & {
  senderId?: string;
  targetId?: string;
  sdp?: string | null;
};

type WebRTCCandidateSignal = RTCIceCandidateInit & {
  senderId?: string;
  targetId?: string;
};

type WebRTCOfferEvent = Omit<ChatWebRTCOfferPayload, "offer"> & {
  offer: WebRTCSignalDescription;
};

type WebRTCAnswerEvent = Omit<ChatWebRTCAnswerPayload, "answer"> & {
  answer: WebRTCSignalDescription;
};

type WebRTCIceCandidateEvent = Omit<
  ChatWebRTCIceCandidatePayload,
  "candidate"
> & {
  candidate: WebRTCCandidateSignal;
};

type CallAcceptAckPayload = {
  acceptedAt?: string;
  serverTimestamp?: string;
};

type CallEndAckPayload = {
  callStillActive?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function getAckData(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return "data" in value ? value.data : value;
}

function getConversationIdVariants(
  conversationId?: string | null,
): Set<string> {
  const variants = new Set<string>();
  const raw = conversationId?.trim();
  if (!raw) {
    return variants;
  }

  variants.add(raw);

  if (/^group:/i.test(raw)) {
    variants.add(raw.replace(/^group:/i, "GRP#"));
  } else if (/^group#/i.test(raw)) {
    variants.add(raw.replace(/^group#/i, "GRP#"));
  } else if (/^grp#/i.test(raw)) {
    variants.add(raw.replace(/^grp#/i, "GRP#"));
    variants.add(raw.replace(/^grp#/i, "group:"));
  }

  return variants;
}

function conversationIdsMatch(
  left?: string | null,
  right?: string | null,
): boolean {
  const leftVariants = getConversationIdVariants(left);
  if (leftVariants.size === 0) {
    return false;
  }

  for (const variant of getConversationIdVariants(right)) {
    if (leftVariants.has(variant)) {
      return true;
    }
  }

  return false;
}

function getLocalMediaErrorMessage(isVideo: boolean): string {
  return isVideo
    ? "Không thể truy cập Microphone/Camera. Vui lòng kiểm tra quyền trình duyệt."
    : "Không thể truy cập Microphone. Vui lòng kiểm tra quyền trình duyệt.";
}

function asSocketError(error: unknown): SocketErrorLike {
  if (!error || typeof error !== "object") {
    return {};
  }

  return error as SocketErrorLike;
}

function getSocketErrorMessage(error: unknown, fallback: string): string {
  const socketError = asSocketError(error);
  return socketError.message || fallback;
}

function getSocketErrorStatusCode(error: unknown): number | undefined {
  const socketError = asSocketError(error);
  return socketError.statusCode ?? socketError.status;
}

function getSocketErrorName(error: unknown): string | undefined {
  return asSocketError(error).name;
}

function isValidSessionDescription(
  value: unknown,
): value is RTCSessionDescriptionInit {
  if (!value || typeof value !== "object") {
    return false;
  }

  const description = value as { type?: unknown; sdp?: unknown };
  return (
    typeof description.type === "string" &&
    typeof description.sdp === "string" &&
    description.sdp.trim().length > 0
  );
}

function parseCallAcceptAckPayload(
  value: unknown,
): CallAcceptAckPayload | null {
  const data = getAckData(value);
  if (!isRecord(data)) {
    return null;
  }

  return {
    acceptedAt:
      typeof data.acceptedAt === "string" ? data.acceptedAt : undefined,
    serverTimestamp:
      typeof data.serverTimestamp === "string"
        ? data.serverTimestamp
        : undefined,
  };
}

function parseCallEndAckPayload(value: unknown): CallEndAckPayload | null {
  const data = getAckData(value);
  if (!isRecord(data)) {
    return null;
  }

  return {
    callStillActive:
      typeof data.callStillActive === "boolean"
        ? data.callStillActive
        : undefined,
  };
}

export function useWebRTC() {
  const { user } = useAuth();
  const [callState, setCallState] = useState<CallState>("IDLE");
  const [activeConfig, setActiveConfig] = useState<CallConfig | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map(),
  );
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [lastEndedCall, setLastEndedCall] = useState<CallEndedSummary | null>(
    null,
  );
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [activeGroupCalls, setActiveGroupCalls] = useState<Set<string>>(
    new Set(),
  );

  const [callError, setCallError] = useState<string | null>(null);

  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const userIdRef = useRef<string | undefined>(user?.sub);
  const sentIceCandidateKeysRef = useRef<Set<string>>(new Set());
  const pendingIceSignalsRef = useRef<
    Array<{
      conversationId: string;
      peerId: string;
      candidate: RTCIceCandidateInit;
    }>
  >([]);
  const iceSignalTimerRef = useRef<number | null>(null);
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map(),
  );
  const leftPeersRef = useRef<Set<string>>(new Set());
  const activeConfigRef = useRef<CallConfig | null>(null);
  const callStateRef = useRef<CallState>("IDLE");
  const callStartedAtRef = useRef<number | null>(null);
  const activeGroupCallsTimeoutsRef = useRef<Map<string, number>>(new Map());
  const peerDisconnectTimersRef = useRef<Map<string, number>>(new Map());
  const iceRestartAttemptsRef = useRef<Map<string, number>>(new Map());

  const getIceServers = (): RTCConfiguration => {
    const turnUsername = import.meta.env.VITE_TURN_USERNAME || "";
    const turnPassword = import.meta.env.VITE_TURN_PASSWORD || "";
    const iceServers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.relay.metered.ca:80" },
    ];

    if (turnUsername && turnPassword) {
      iceServers.push(
        {
          urls: "turn:global.relay.metered.ca:80",
          username: turnUsername,
          credential: turnPassword,
        },
        {
          urls: "turn:global.relay.metered.ca:80?transport=tcp",
          username: turnUsername,
          credential: turnPassword,
        },
        {
          urls: "turn:global.relay.metered.ca:443",
          username: turnUsername,
          credential: turnPassword,
        },
        {
          urls: "turns:global.relay.metered.ca:443?transport=tcp",
          username: turnUsername,
          credential: turnPassword,
        },
      );
    }

    return { iceServers };
  };

  const resolveSignalConversationId = useCallback(
    (
      config?: CallConfig | null,
      fallbackConversationId?: string,
    ): string | undefined => {
      const rawConversationId = (
        config?.conversationId ?? fallbackConversationId
      )?.trim();
      if (!rawConversationId) return undefined;

      const isGroupConversation = /^(group:|grp#|group#)/i.test(
        rawConversationId,
      );
      const isDmKey = /^DM#/i.test(rawConversationId);

      if (isDmKey || isGroupConversation) {
        return rawConversationId;
      }

      return rawConversationId;
    },
    [],
  );

  const isGroupCall = useCallback((config?: CallConfig | null) => {
    const rawConversationId = config?.conversationId?.trim();
    if (!rawConversationId) return false;
    return /^(group:|grp#|group#)/i.test(rawConversationId);
  }, []);

  const setGroupCallActive = useCallback(
    (conversationId: string | undefined, isActive: boolean) => {
      if (!conversationId || !/^(group:|grp#|group#)/i.test(conversationId)) {
        return;
      }

      const variants = getConversationIdVariants(conversationId);
      setActiveGroupCalls((prev) => {
        const next = new Set(prev);
        variants.forEach((variant) => {
          if (isActive) {
            next.add(variant);
          } else {
            next.delete(variant);
          }
        });
        return next;
      });

      if (!isActive) {
        variants.forEach((variant) => {
          const timeoutId = activeGroupCallsTimeoutsRef.current.get(variant);
          if (timeoutId) {
            window.clearTimeout(timeoutId);
            activeGroupCallsTimeoutsRef.current.delete(variant);
          }
        });
      }
    },
    [],
  );

  const handlePeerConnectionLost = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    pendingIceCandidatesRef.current.delete(peerId);
    iceRestartAttemptsRef.current.delete(peerId);
    if (peerDisconnectTimersRef.current.has(peerId)) {
      clearTimeout(peerDisconnectTimersRef.current.get(peerId));
      peerDisconnectTimersRef.current.delete(peerId);
    }
  }, []);

  const clearPeerDisconnectTimer = (peerId: string) => {
    if (peerDisconnectTimersRef.current.has(peerId)) {
      clearTimeout(peerDisconnectTimersRef.current.get(peerId));
      peerDisconnectTimersRef.current.delete(peerId);
    }
  };

  const cleanup = useCallback(
    (options?: { remoteDurationSeconds?: number; skipSummary?: boolean }) => {
      console.log("[WebRTC] Dọn dẹp kết nối");
      const currentConfig = activeConfigRef.current;
      const isConnectedCall =
        callStateRef.current === "CONNECTED" && Boolean(currentConfig);

      if (
        currentConfig &&
        callStateRef.current !== "IDLE" &&
        !options?.skipSummary
      ) {
        const endedAt = Date.now();
        const computedDuration =
          isConnectedCall && callStartedAtRef.current
            ? Math.max(
                0,
                Math.round((endedAt - callStartedAtRef.current) / 1000),
              )
            : 0;
        const durationSeconds =
          typeof options?.remoteDurationSeconds === "number"
            ? Math.max(0, Math.round(options.remoteDurationSeconds))
            : computedDuration;

        setLastEndedCall({
          conversationId: currentConfig.conversationId || "",
          peerUserId:
            currentConfig.callerId === userIdRef.current
              ? currentConfig.targetUserId
              : currentConfig.callerId,
          peerName:
            currentConfig.peerName || currentConfig.callerName || "Người dùng",
          peerAvatarUrl:
            currentConfig.peerAvatarUrl || currentConfig.callerAvatarUrl,
          isVideo: Boolean(currentConfig.isVideo),
          durationSeconds,
          endedAt: new Date(endedAt).toISOString(),
          direction:
            currentConfig.callerId === userIdRef.current
              ? "outgoing"
              : "incoming",
        });
      }

      callStartedAtRef.current = null;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        setLocalStream(null);
      }

      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      setRemoteStreams((prev) => {
        prev.forEach((stream) => stream.getTracks().forEach((t) => t.stop()));
        return new Map();
      });

      if (iceSignalTimerRef.current !== null) {
        window.clearTimeout(iceSignalTimerRef.current);
        iceSignalTimerRef.current = null;
      }
      pendingIceSignalsRef.current = [];
      sentIceCandidateKeysRef.current.clear();
      pendingIceCandidatesRef.current.clear();
      leftPeersRef.current.clear();
      peerDisconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
      peerDisconnectTimersRef.current.clear();
      iceRestartAttemptsRef.current.clear();
      setCallState("IDLE");
      callStateRef.current = "IDLE";
      setCallDurationSeconds(0);
      setActiveConfig(null);
      activeConfigRef.current = null;
      setCallError(null);
      mediaStreamPromiseRef.current = null;
    },
    [],
  );

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

    if (callState === "IDLE") {
      callStartedAtRef.current = null;
      setCallDurationSeconds(0);
    }
  }, [callState]);

  useEffect(() => {
    if (callState !== "CONNECTED") {
      setCallDurationSeconds(0);
      return;
    }

    const tick = () => {
      if (!callStartedAtRef.current) {
        setCallDurationSeconds(0);
        return;
      }

      setCallDurationSeconds(
        Math.max(0, Math.floor((Date.now() - callStartedAtRef.current) / 1000)),
      );
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);

    return () => window.clearInterval(intervalId);
  }, [callState]);

  const emitSignal = useCallback(
    async (
      event: string,
      payload: Record<string, unknown>,
    ): Promise<unknown | false> => {
      try {
        const response = await socketClient.safeEmitValidated(event, payload);
        return response || true;
      } catch (rawError: unknown) {
        const error = asSocketError(rawError);
        if (
          event === CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE &&
          getSocketErrorStatusCode(error) === 409
        ) {
          return false;
        }
        console.error(`[WebRTC] Lỗi gửi tín hiệu ở ${event}`, error);
        const errorMessage = getSocketErrorMessage(
          error,
          "Lỗi gửi tín hiệu qua máy chủ.",
        );
        if (
          event === CHAT_SOCKET_EVENTS.CALL_INIT ||
          event === CHAT_SOCKET_EVENTS.CALL_ACCEPT
        ) {
          cleanup({ skipSummary: true });
        }
        setCallError(errorMessage);
        return false;
      }
    },
    [cleanup],
  );

  useEffect(() => {
    if (callState !== "CONNECTED" || !activeConfigRef.current) return;

    const emitHeartbeat = async () => {
      const config = activeConfigRef.current;
      if (!config) return;
      const signalConvId = resolveSignalConversationId(config);
      if (!signalConvId) return;
      try {
        await socketClient.safeEmitValidated(
          CHAT_SOCKET_EVENTS.CALL_HEARTBEAT,
          {
            conversationId: signalConvId,
            userId: userIdRef.current,
          },
        );
      } catch (err) {
        const code = getSocketErrorStatusCode(asSocketError(err));
        if (code === 409 || code === 404) {
          cleanup();
        }
      }
    };

    const initialTimer = window.setTimeout(() => void emitHeartbeat(), 3000);
    const interval = setInterval(() => void emitHeartbeat(), 5000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [callState, resolveSignalConversationId, cleanup]);

  // CALLING timeout: auto-hangup if no answer within 45s (group) or 15s (1-1).
  useEffect(() => {
    if (callState !== "CALLING") return;
    const config = activeConfigRef.current;
    const isGroup = isGroupCall(config);
    const timeoutMs = isGroup ? 45_000 : 30_000;

    const timer = window.setTimeout(() => {
      if (callStateRef.current === "CALLING") {
        const signalConvId = resolveSignalConversationId(config);
        if (signalConvId) {
          void emitSignal(CHAT_SOCKET_EVENTS.CALL_END, {
            conversationId: signalConvId,
            userId: userIdRef.current,
          });
        }
        cleanup();

        // Play Vietnamese TTS voice announcement for 1-1 call timeout
        if (
          !isGroup &&
          typeof window !== "undefined" &&
          "speechSynthesis" in window
        ) {
          try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(
              "Người nhận tạm thời không liên lạc được. Vui lòng gọi lại sau.",
            );
            utterance.lang = "vi-VN";
            window.speechSynthesis.speak(utterance);
          } catch (e) {
            console.error("Speech synthesis failed", e);
          }
        }
      }
    }, timeoutMs);
    return () => clearTimeout(timer);
  }, [
    callState,
    cleanup,
    emitSignal,
    resolveSignalConversationId,
    isGroupCall,
  ]);

  const flushQueuedIceSignals = useCallback(() => {
    if (iceSignalTimerRef.current !== null) return;

    const processQueue = async () => {
      const nextItem = pendingIceSignalsRef.current.shift();
      if (!nextItem) {
        iceSignalTimerRef.current = null;
        return;
      }

      await emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
        conversationId: nextItem.conversationId,
        candidate: {
          ...nextItem.candidate,
          targetId: nextItem.peerId,
          senderId: userIdRef.current,
        },
      });

      if (pendingIceSignalsRef.current.length === 0) {
        iceSignalTimerRef.current = null;
        return;
      }

      iceSignalTimerRef.current = window.setTimeout(
        () => void processQueue(),
        120,
      );
    };

    iceSignalTimerRef.current = window.setTimeout(() => void processQueue(), 0);
  }, [emitSignal]);

  const queueIceCandidateSignal = useCallback(
    (
      conversationId: string,
      peerId: string,
      candidate: RTCIceCandidateInit,
    ) => {
      const key = `${candidate.candidate || ""}|${candidate.sdpMid || ""}|${candidate.sdpMLineIndex ?? ""}|${peerId}`;
      if (!candidate.candidate || sentIceCandidateKeysRef.current.has(key))
        return;

      if (sentIceCandidateKeysRef.current.size >= 100) return;

      sentIceCandidateKeysRef.current.add(key);
      pendingIceSignalsRef.current.push({ conversationId, peerId, candidate });
      flushQueuedIceSignals();
    },
    [flushQueuedIceSignals],
  );

  const schedulePeerDisconnectCheck = useCallback(
    (peerId: string, config: CallConfig) => {
      if (peerDisconnectTimersRef.current.has(peerId)) return;
      const timerId = window.setTimeout(async () => {
        peerDisconnectTimersRef.current.delete(peerId);
        const pc = peerConnectionsRef.current.get(peerId);
        if (!pc) return;

        const connectionLost =
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.iceConnectionState === "disconnected" ||
          pc.iceConnectionState === "failed";

        if (connectionLost) {
          const attempts = iceRestartAttemptsRef.current.get(peerId) || 0;
          if (attempts < 3) {
            iceRestartAttemptsRef.current.set(peerId, attempts + 1);

            let shouldInitiateRestart = false;
            if (!isGroupCall(config)) {
              shouldInitiateRestart = config.callerId === user?.sub;
            } else {
              shouldInitiateRestart = (user?.sub || "") > peerId;
            }

            if (shouldInitiateRestart) {
              console.log(
                `[WebRTC] Mất kết nối với ${peerId}, đang thử ICE restart (lần ${
                  attempts + 1
                })...`,
              );
              try {
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                const signalConversationId =
                  resolveSignalConversationId(config);
                if (signalConversationId) {
                  await emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
                    conversationId: signalConversationId,
                    offer: {
                      type: offer.type,
                      sdp: offer.sdp,
                      targetId: peerId,
                      senderId: user?.sub,
                    },
                  });
                }
              } catch (err) {
                console.error("[WebRTC] ICE restart thất bại", err);
              }
            } else {
              console.log(
                `[WebRTC] Mất kết nối với ${peerId}, chờ peer khởi tạo ICE restart...`,
              );
            }
            schedulePeerDisconnectCheck(peerId, config);
          } else {
            console.log(
              `[WebRTC] ICE restart thất bại sau 3 lần, đóng kết nối với ${peerId}`,
            );
            handlePeerConnectionLost(peerId);
          }
        }
      }, 5_000); // Wait 5 seconds before triggering ICE restart
      peerDisconnectTimersRef.current.set(peerId, timerId);
    },
    [
      handlePeerConnectionLost,
      isGroupCall,
      user?.sub,
      resolveSignalConversationId,
      emitSignal,
    ],
  );

  const flushPendingIceCandidates = useCallback(async (peerId: string) => {
    clearPeerDisconnectTimer(peerId);
    iceRestartAttemptsRef.current.delete(peerId);
    const pc = peerConnectionsRef.current.get(peerId);
    if (!pc || !pc.remoteDescription) return;

    const candidates = pendingIceCandidatesRef.current.get(peerId) || [];
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new window.RTCIceCandidate(candidate));
      } catch (error) {
        console.error("[WebRTC] Failed to apply queued ICE candidate", error);
      }
    }
    pendingIceCandidatesRef.current.set(peerId, []);
  }, []);

  const requestLocalMediaStream = useCallback(async (isVideo: boolean) => {
    if (localStreamRef.current) {
      const hasVideo = localStreamRef.current.getVideoTracks().length > 0;
      if (!isVideo || hasVideo) return localStreamRef.current;
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      mediaStreamPromiseRef.current = null;
    }
    if (mediaStreamPromiseRef.current) return mediaStreamPromiseRef.current;

    mediaStreamPromiseRef.current = (async () => {
      const videoConstraints = {
        facingMode: { ideal: "user" },
        width: { ideal: 640 },
        height: { ideal: 480 },
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: isVideo ? videoConstraints : false,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch (error) {
        if (isVideo) {
          console.warn(
            "[WebRTC] Camera unavailable, falling back to audio-only",
            error,
          );
          try {
            const audioOnly = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });
            localStreamRef.current = audioOnly;
            setLocalStream(audioOnly);
            return audioOnly;
          } catch (audioError) {
            console.error(
              "[WebRTC] Both camera and mic unavailable",
              audioError,
            );
            throw audioError;
          }
        }
        console.error("[WebRTC] Microphone unavailable", error);
        throw error;
      }
    })();
    return mediaStreamPromiseRef.current;
  }, []);

  const connectingPeersRef = useRef<Map<string, Promise<RTCPeerConnection>>>(
    new Map(),
  );

  const setupPeerConnection = useCallback(
    async (peerId: string, isOfferCreator: boolean, config: CallConfig) => {
      let pc = peerConnectionsRef.current.get(peerId);
      if (pc) return pc;

      const pendingPromise = connectingPeersRef.current.get(peerId);
      if (pendingPromise) return pendingPromise;

      const setupPromise = (async () => {
        try {
          await socketClient.connect();
        } catch (err) {
          setCallError(
            "Mất kết nối Internet hoặc lỗi Server. Không thể thực hiện cuộc gọi lúc này.",
          );
          throw err;
        }

        try {
          const stream = await requestLocalMediaStream(config.isVideo);

          pc = new RTCPeerConnection(getIceServers());
          peerConnectionsRef.current.set(peerId, pc);

          pc.onicecandidate = (event) => {
            const signalConversationId = resolveSignalConversationId(config);
            if (event.candidate && signalConversationId) {
              queueIceCandidateSignal(
                signalConversationId,
                peerId,
                event.candidate.toJSON(),
              );
            }
          };

          pc.onconnectionstatechange = () => {
            if (!pc) return;
            const isHealthy =
              pc.connectionState === "connected" ||
              pc.iceConnectionState === "connected" ||
              pc.iceConnectionState === "completed";
            if (isHealthy) {
              clearPeerDisconnectTimer(peerId);
              iceRestartAttemptsRef.current.delete(peerId);
              return;
            }

            const isClosed =
              pc.connectionState === "closed" ||
              pc.iceConnectionState === "closed";
            if (isClosed) {
              handlePeerConnectionLost(peerId);
              return;
            }

            const isDisconnectedOrFailed =
              pc.connectionState === "disconnected" ||
              pc.connectionState === "failed" ||
              pc.iceConnectionState === "disconnected" ||
              pc.iceConnectionState === "failed";
            if (isDisconnectedOrFailed) {
              schedulePeerDisconnectCheck(peerId, config);
            }
          };

          pc.ontrack = (event) => {
            setRemoteStreams((prev) => {
              const nextMap = new Map(prev);
              const existingStream = nextMap.get(peerId);
              if (existingStream) {
                const newStream = new MediaStream(existingStream.getTracks());
                newStream.addTrack(event.track);
                nextMap.set(peerId, newStream);
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

          // Ensure video is negotiated for all calls, so camera can be toggled on/off dynamically.
          if (stream.getVideoTracks().length === 0) {
            try {
              pc.addTransceiver("video", { direction: "recvonly" });
            } catch (e) {
              console.warn(
                "[WebRTC] Failed to add recvonly video transceiver",
                e,
              );
            }
          }

          if (isOfferCreator) {
            const signalConversationId = resolveSignalConversationId(config);
            if (!signalConversationId)
              throw new Error("Missing signaling conversation id");

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            await emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
              conversationId: signalConversationId,
              offer: {
                type: offer.type,
                sdp: offer.sdp,
                targetId: peerId,
                senderId: user?.sub,
              },
            });
          }
          return pc;
        } catch (error) {
          console.error("[WebRTC] Lỗi thiết lập kết nối ngang hàng", error);
          if (peerConnectionsRef.current.size === 0) cleanup();

          const errName = getSocketErrorName(error);
          const isMediaError =
            error instanceof DOMException ||
            errName === "NotReadableError" ||
            errName === "NotAllowedError" ||
            errName === "NotFoundError" ||
            errName === "OverconstrainedError" ||
            errName === "AbortError";

          if (isMediaError) {
            setCallError("Không thể truy cập Microphone/Camera");
          } else {
            setCallError("Lỗi kết nối. Vui lòng thử lại.");
          }
          throw error;
        } finally {
          connectingPeersRef.current.delete(peerId);
        }
      })();

      connectingPeersRef.current.set(peerId, setupPromise);
      return setupPromise;
    },
    [
      emitSignal,
      queueIceCandidateSignal,
      resolveSignalConversationId,
      requestLocalMediaStream,
      cleanup,
      user?.sub,
      handlePeerConnectionLost,
      schedulePeerDisconnectCheck,
    ],
  );

  const initiateConnectionWithPeer = useCallback(
    async (peerId: string, config: CallConfig) => {
      if (peerId === user?.sub) return;
      if (peerConnectionsRef.current.has(peerId)) return;

      if (!isGroupCall(config)) {
        const isCaller = config.callerId === user?.sub;
        await setupPeerConnection(peerId, isCaller, config);
        return;
      }

      const amIHigherId = (user?.sub || "") > peerId;
      if (amIHigherId) {
        await setupPeerConnection(peerId, true, config);
      } else {
        await setupPeerConnection(peerId, false, config);
        const signalConvId = resolveSignalConversationId(config);
        if (signalConvId) {
          await emitSignal(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, {
            conversationId: signalConvId,
            userId: user?.sub,
          });
        }
      }
    },
    [
      user?.sub,
      isGroupCall,
      setupPeerConnection,
      emitSignal,
      resolveSignalConversationId,
    ],
  );

  const startCall = useCallback(
    async (config: CallConfig) => {
      if (callStateRef.current !== "IDLE") return;

      setLastEndedCall(null);
      const enrichedConfig: CallConfig = {
        ...config,
        callerId: config.callerId ?? user?.sub,
      };
      setActiveConfig(enrichedConfig);
      activeConfigRef.current = enrichedConfig;
      setCallState("CALLING");
      callStateRef.current = "CALLING";
      setCallDurationSeconds(0);
      setCallError(null);

      const signalConversationId = resolveSignalConversationId(config);
      if (!signalConversationId) {
        cleanup();
        return;
      }

      try {
        await requestLocalMediaStream(config.isVideo);
      } catch (err) {
        console.error("[WebRTC] Local media stream failed", err);
        if (isGroupCall(config)) {
          cleanup({ skipSummary: true });
          setCallError(getLocalMediaErrorMessage(config.isVideo));
          return;
        }
      }

      try {
        await socketClient.safeEmitValidated(CHAT_SOCKET_EVENTS.CALL_INIT, {
          conversationId: signalConversationId,
          callerId: user?.sub,
          callerName: config.callerName || "Người gọi",
          callerAvatarUrl: config.callerAvatarUrl,
          isVideo: config.isVideo,
        });

        if (isGroupCall(config)) {
          setGroupCallActive(signalConversationId, true);
        }
      } catch (rawError: unknown) {
        const error = asSocketError(rawError);
        if (getSocketErrorStatusCode(error) === 409) {
          if (isGroupCall(config)) {
            cleanup({ skipSummary: true });
            setGroupCallActive(signalConversationId, true);
            return;
          } else if (config.targetUserId) {
            try {
              await requestLocalMediaStream(config.isVideo);
            } catch (err) {
              console.error("[WebRTC] Local media stream failed", err);
            }

            const updatedConfig = { ...config, callerId: config.targetUserId };
            setActiveConfig(updatedConfig);
            activeConfigRef.current = updatedConfig;

            setCallState("CONNECTED");
            callStateRef.current = "CONNECTED";
            callStartedAtRef.current = Date.now();
            setCallError(null);

            try {
              const response = parseCallAcceptAckPayload(
                await socketClient.safeEmitValidated(
                  CHAT_SOCKET_EVENTS.CALL_ACCEPT,
                  {
                    conversationId: signalConversationId,
                    calleeId: user?.sub,
                  },
                ),
              );

              if (response?.acceptedAt && response?.serverTimestamp) {
                const elapsedMs =
                  new Date(response.serverTimestamp).getTime() -
                  new Date(response.acceptedAt).getTime();
                callStartedAtRef.current = Date.now() - elapsedMs;
              } else {
                callStartedAtRef.current = Date.now();
              }

              await initiateConnectionWithPeer(
                config.targetUserId,
                updatedConfig,
              );
              return;
            } catch {
              cleanup({ skipSummary: true });
              setCallError("Lỗi kết nối cuộc gọi.");
              return;
            }
          }
        }

        const errorMessage = getSocketErrorMessage(
          error,
          "Không thể khởi tạo cuộc gọi.",
        );
        cleanup({ skipSummary: true });
        setCallError(errorMessage);
      }
    },
    [
      cleanup,
      resolveSignalConversationId,
      user?.sub,
      isGroupCall,
      requestLocalMediaStream,
      initiateConnectionWithPeer,
      setGroupCallActive,
    ],
  );

  const joinCall = useCallback(
    async (config: CallConfig) => {
      if (callStateRef.current !== "IDLE") return;

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
        console.error("[WebRTC] Local media stream failed", err);
        cleanup({ skipSummary: true });
        setCallError(getLocalMediaErrorMessage(config.isVideo));
        return;
      }

      setCallState("CONNECTING");
      callStateRef.current = "CONNECTING";
      callStartedAtRef.current = Date.now();

      try {
        const response = parseCallAcceptAckPayload(
          await socketClient.safeEmitValidated(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
            conversationId: signalConversationId,
            calleeId: user?.sub,
          }),
        );

        if (response?.acceptedAt && response?.serverTimestamp) {
          const elapsedMs =
            new Date(response.serverTimestamp).getTime() -
            new Date(response.acceptedAt).getTime();
          callStartedAtRef.current = Date.now() - elapsedMs;
        } else {
          callStartedAtRef.current = Date.now();
        }
        setGroupCallActive(signalConversationId, true);
        setCallState("CONNECTED");
        callStateRef.current = "CONNECTED";
      } catch {
        cleanup({ skipSummary: true });
        setCallError("Lỗi tham gia cuộc gọi nhóm đang diễn ra.");
        return;
      }

      emitSignal(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, {
        conversationId: signalConversationId,
        userId: user?.sub,
      }).catch(() => {});
    },
    [
      emitSignal,
      cleanup,
      resolveSignalConversationId,
      user?.sub,
      requestLocalMediaStream,
      setGroupCallActive,
    ],
  );

  const acceptCall = useCallback(async () => {
    if (callStateRef.current !== "INCOMING" || !activeConfigRef.current) return;

    setCallState("CONNECTING");
    callStateRef.current = "CONNECTING";

    const config = activeConfigRef.current;
    const signalConversationId = resolveSignalConversationId(config);
    if (!signalConversationId) {
      cleanup();
      return;
    }

    setLastEndedCall(null);

    try {
      await requestLocalMediaStream(config.isVideo);
    } catch (err) {
      console.error("[WebRTC] Local media stream failed", err);
      if (isGroupCall(config)) {
        cleanup({ skipSummary: true });
        setCallError(getLocalMediaErrorMessage(config.isVideo));
        return;
      }
    }

    const acceptAck = await emitSignal(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
      conversationId: signalConversationId,
      calleeId: user?.sub,
    });
    const response = parseCallAcceptAckPayload(acceptAck);
    if (!response) {
      if (acceptAck === false || !activeConfigRef.current) {
        return;
      }
      setCallState("INCOMING");
      callStateRef.current = "INCOMING";
      return;
    }

    if (response?.acceptedAt && response?.serverTimestamp) {
      const elapsedMs =
        new Date(response.serverTimestamp).getTime() -
        new Date(response.acceptedAt).getTime();
      callStartedAtRef.current = Date.now() - elapsedMs;
    } else {
      callStartedAtRef.current = Date.now();
    }

    setCallState("CONNECTED");
    callStateRef.current = "CONNECTED";
    if (isGroupCall(config)) {
      setGroupCallActive(signalConversationId, true);
    }

    if (!isGroupCall(config)) {
      const peerId = config.callerId!;
      await initiateConnectionWithPeer(peerId, config);
    }
  }, [
    cleanup,
    emitSignal,
    resolveSignalConversationId,
    user?.sub,
    isGroupCall,
    initiateConnectionWithPeer,
    requestLocalMediaStream,
    setGroupCallActive,
  ]);

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

  const endCall = useCallback(async () => {
    const config = activeConfigRef.current;
    const signalConversationId = resolveSignalConversationId(config);
    if (signalConversationId) {
      if (isGroupCall(config)) {
        const response = parseCallEndAckPayload(
          await emitSignal(CHAT_SOCKET_EVENTS.CALL_END, {
            conversationId: signalConversationId,
            userId: user?.sub,
          }),
        );
        setGroupCallActive(
          signalConversationId,
          Boolean(response?.callStillActive),
        );
      } else {
        void emitSignal(CHAT_SOCKET_EVENTS.CALL_END, {
          conversationId: signalConversationId,
          userId: user?.sub,
        });
      }
    }
    cleanup();
  }, [
    emitSignal,
    cleanup,
    resolveSignalConversationId,
    user?.sub,
    isGroupCall,
    setGroupCallActive,
  ]);

  useEffect(() => {
    const emitGroupCallEndBeforeUnload = () => {
      const config = activeConfigRef.current;
      if (
        !isGroupCall(config) ||
        (callStateRef.current !== "CALLING" &&
          callStateRef.current !== "RINGING" &&
          callStateRef.current !== "CONNECTING" &&
          callStateRef.current !== "CONNECTED")
      ) {
        return;
      }

      const signalConversationId = resolveSignalConversationId(config);
      if (!signalConversationId || !userIdRef.current) {
        return;
      }

      socketClient.socket?.emit(CHAT_SOCKET_EVENTS.CALL_END, {
        conversationId: signalConversationId,
        userId: userIdRef.current,
      });
    };

    window.addEventListener("pagehide", emitGroupCallEndBeforeUnload);
    window.addEventListener("beforeunload", emitGroupCallEndBeforeUnload);

    return () => {
      window.removeEventListener("pagehide", emitGroupCallEndBeforeUnload);
      window.removeEventListener("beforeunload", emitGroupCallEndBeforeUnload);
    };
  }, [isGroupCall, resolveSignalConversationId]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream
        .getAudioTracks()
        .forEach((track) => (track.enabled = !track.enabled));
      setIsMicOn(!isMicOn);
    }
  }, [localStream, isMicOn]);

  const toggleVideo = useCallback(async () => {
    if (!localStream) return;

    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0) {
      const nextState = !isVideoOn;
      videoTracks.forEach((track) => (track.enabled = nextState));
      setIsVideoOn(nextState);
    } else {
      try {
        const videoConstraints = {
          facingMode: { ideal: "user" },
          width: { ideal: 640 },
          height: { ideal: 480 },
        };
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
        });
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          localStream.addTrack(videoTrack);
          setLocalStream(new MediaStream(localStream.getTracks()));

          if (activeConfigRef.current) {
            const nextConfig = { ...activeConfigRef.current, isVideo: true };
            setActiveConfig(nextConfig);
            activeConfigRef.current = nextConfig;
          }

          peerConnectionsRef.current.forEach((pc) => {
            const transceiver = pc
              .getTransceivers()
              .find((t) => t.receiver.track.kind === "video");
            if (transceiver) {
              transceiver.direction = "sendrecv";
              void transceiver.sender.replaceTrack(videoTrack);
            }
          });

          setIsVideoOn(true);
        }
      } catch (err) {
        console.error(
          "[WebRTC] Failed to acquire video track dynamically",
          err,
        );
      }
    }
  }, [localStream, isVideoOn]);

  useEffect(() => {
    let mounted = true;
    let boundSocket: typeof socketClient.socket | null = null;

    const getFallbackPeerId = () =>
      activeConfigRef.current?.callerId === userIdRef.current
        ? activeConfigRef.current?.targetUserId
        : activeConfigRef.current?.callerId;

    const onCallInit = (data: CallInitEvent) => {
      const isGroup = /^(group:|grp#|group#)/i.test(data.conversationId);
      if (isGroup) {
        setGroupCallActive(data.conversationId, true);
      }

      if (data.callerId === userIdRef.current) return;

      const currentConfig = activeConfigRef.current;
      if (callStateRef.current !== "IDLE") {
        if (
          !currentConfig ||
          !conversationIdsMatch(
            currentConfig.conversationId,
            data.conversationId,
          )
        )
          return;
        if (!isGroupCall(currentConfig)) return;
      }

      if (callStateRef.current === "IDLE") {
        const config = {
          isVideo: Boolean(data.isVideo),
          callerId: data.callerId,
          callerName: data.callerName,
          peerName: data.callerName,
          peerAvatarUrl: data.callerAvatarUrl,
          conversationId: data.conversationId,
          targetUserId: data.callerId,
        };
        setActiveConfig(config);
        activeConfigRef.current = config;
        setCallState("INCOMING");
        callStateRef.current = "INCOMING";

        socketClient
          .safeEmitValidated(CHAT_SOCKET_EVENTS.CALL_RINGING, {
            conversationId: data.conversationId,
            calleeId: userIdRef.current,
          })
          .catch(() => {});
      }
    };

    const onCallRinging = (rawData: unknown) => {
      const data = rawData as ChatCallRingingPayload;
      const config = activeConfigRef.current;
      if (!config) return;
      if (
        callStateRef.current !== "CALLING" &&
        callStateRef.current !== "RINGING"
      ) {
        return;
      }
      if (conversationIdsMatch(config.conversationId, data.conversationId)) {
        setCallState("RINGING");
        callStateRef.current = "RINGING";
      }
    };

    const onCallAccept = async (data: ChatCallAcceptPayload) => {
      const config = activeConfigRef.current;

      if (
        config &&
        callStateRef.current === "INCOMING" &&
        data.calleeId === userIdRef.current &&
        conversationIdsMatch(data.conversationId, config.conversationId)
      ) {
        cleanup();
        return;
      }

      if (
        !config ||
        (callStateRef.current !== "CALLING" &&
          callStateRef.current !== "RINGING" &&
          callStateRef.current !== "CONNECTED")
      )
        return;

      const peerId = data.calleeId;
      if (peerId === userIdRef.current) return;

      const isDmCall = !isGroupCall(config);
      let isMatch: boolean;
      if (isDmCall) {
        const iAmCaller = config.callerId === userIdRef.current;
        isMatch = iAmCaller
          ? true
          : config.callerId === peerId || config.targetUserId === peerId;
      } else {
        isMatch = conversationIdsMatch(
          config.conversationId,
          data.conversationId,
        );
      }
      if (!isMatch) return;

      leftPeersRef.current.delete(peerId);

      if (data.acceptedAt && data.serverTimestamp) {
        if (!callStartedAtRef.current) {
          const serverNow = new Date(data.serverTimestamp).getTime();
          const acceptedAt = new Date(data.acceptedAt).getTime();
          const localNow = Date.now();
          const offset = localNow - serverNow;
          callStartedAtRef.current = acceptedAt + offset;
        }
      } else if (data.acceptedAt) {
        if (!callStartedAtRef.current) {
          callStartedAtRef.current = new Date(data.acceptedAt).getTime();
        }
      }

      if (callStateRef.current !== "CONNECTED") {
        setCallState("CONNECTED");
        callStateRef.current = "CONNECTED";
      }

      await initiateConnectionWithPeer(peerId, config);
    };

    const onCallHeartbeat = async (rawData: unknown) => {
      const data = rawData as ChatCallHeartbeatPayload;
      const config = activeConfigRef.current;
      const conversationId = data.conversationId;

      if (data.acceptedAt && data.serverTimestamp) {
        const serverNow = new Date(data.serverTimestamp).getTime();
        const acceptedAt = new Date(data.acceptedAt).getTime();
        const localNow = Date.now();
        const offset = localNow - serverNow;
        callStartedAtRef.current = acceptedAt + offset;
      }

      if (/^(group:|grp#|group#)/i.test(conversationId)) {
        setGroupCallActive(conversationId, true);
        getConversationIdVariants(conversationId).forEach((variant) => {
          const existingTimeout =
            activeGroupCallsTimeoutsRef.current.get(variant);
          if (existingTimeout) {
            window.clearTimeout(existingTimeout);
          }

          activeGroupCallsTimeoutsRef.current.set(
            variant,
            window.setTimeout(() => {
              setGroupCallActive(conversationId, false);
            }, 60_000),
          );
        });
      }

      if (!config || callStateRef.current !== "CONNECTED") return;
      if (!conversationIdsMatch(config.conversationId, conversationId)) return;

      const peerId = data.userId;
      if (peerId === userIdRef.current || leftPeersRef.current.has(peerId))
        return;
      if (!peerConnectionsRef.current.has(peerId)) {
        if (userIdRef.current && userIdRef.current > peerId) {
          await initiateConnectionWithPeer(peerId, config);
        }
      }
    };

    const onCallReject = (data: { calleeId?: string } = {}) => {
      if (
        callStateRef.current === "INCOMING" &&
        data.calleeId === userIdRef.current
      ) {
        cleanup();
        return;
      }

      if (!isGroupCall(activeConfigRef.current)) {
        cleanup();
      }
    };

    const onCallEnd = (rawData: unknown) => {
      const data = rawData as ChatCallEndPayload;

      if (!data.callStillActive) {
        setGroupCallActive(data.conversationId, false);
      }

      if (callStateRef.current === "IDLE") return;

      const config = activeConfigRef.current;
      if (
        config &&
        callStateRef.current === "INCOMING" &&
        conversationIdsMatch(data.conversationId, config.conversationId)
      ) {
        cleanup({ remoteDurationSeconds: data?.durationSeconds });
        return;
      }

      const peerId = data.endedByUserId || data.userId;
      const isSelfEnd = peerId === userIdRef.current;

      if (isGroupCall(activeConfigRef.current)) {
        if (
          config &&
          !conversationIdsMatch(config.conversationId, data.conversationId)
        ) {
          return;
        }
        if (!data.callStillActive) {
          cleanup({ remoteDurationSeconds: data.durationSeconds });
          return;
        }
        if (isSelfEnd) {
          return;
        }
        leftPeersRef.current.add(peerId);
        const pc = peerConnectionsRef.current.get(peerId);
        if (pc) {
          pc.close();
          peerConnectionsRef.current.delete(peerId);
        }
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });
        pendingIceCandidatesRef.current.delete(peerId);

        if (peerConnectionsRef.current.size === 0 && !data.callStillActive) {
          setActiveGroupCalls((prev) => {
            if (!prev.has(data.conversationId)) return prev;
            const next = new Set(prev);
            next.delete(data.conversationId);
            return next;
          });
          cleanup({ remoteDurationSeconds: data.durationSeconds });
        }
      } else {
        const config = activeConfigRef.current;
        const expectedPeer =
          config?.callerId === userIdRef.current
            ? config?.targetUserId
            : config?.callerId;
        if (expectedPeer && peerId && peerId !== expectedPeer && !isSelfEnd) {
          return;
        }
        cleanup({ remoteDurationSeconds: data?.durationSeconds });
      }
    };

    const onOffer = async (rawData: unknown) => {
      const data = rawData as WebRTCOfferEvent;
      const offerPayload = data.offer;
      if (!offerPayload || typeof offerPayload !== "object") {
        return;
      }

      const actualSenderId = offerPayload.senderId || getFallbackPeerId();
      const actualTargetId = offerPayload.targetId || userIdRef.current;
      if (actualTargetId !== userIdRef.current || !actualSenderId) return;

      leftPeersRef.current.delete(actualSenderId);
      if (!activeConfigRef.current) {
        return;
      }

      let pc = peerConnectionsRef.current.get(actualSenderId);
      if (!pc) {
        pc = await setupPeerConnection(
          actualSenderId,
          false,
          activeConfigRef.current,
        );
      }

      if (!isValidSessionDescription(offerPayload)) {
        return;
      }

      await pc.setRemoteDescription(
        new window.RTCSessionDescription(offerPayload),
      );
      await flushPendingIceCandidates(actualSenderId);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const signalConvId = resolveSignalConversationId(
        activeConfigRef.current ?? undefined,
        data.conversationId,
      );
      if (!signalConvId) return;
      await emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, {
        conversationId: signalConvId,
        answer: {
          type: answer.type,
          sdp: answer.sdp,
          senderId: userIdRef.current,
          targetId: actualSenderId,
        },
      });
    };

    const onAnswer = async (data: WebRTCAnswerEvent) => {
      const answerPayload = data.answer;
      if (!answerPayload || typeof answerPayload !== "object") {
        return;
      }

      const actualSenderId = answerPayload.senderId || getFallbackPeerId();
      const actualTargetId = answerPayload.targetId || userIdRef.current;
      if (actualTargetId !== userIdRef.current || !actualSenderId) return;

      const pc = peerConnectionsRef.current.get(actualSenderId);
      if (!pc) return;

      if (!isValidSessionDescription(answerPayload)) {
        return;
      }

      await pc.setRemoteDescription(
        new window.RTCSessionDescription(answerPayload),
      );
      await flushPendingIceCandidates(actualSenderId);
    };

    const onIceCandidate = async (data: WebRTCIceCandidateEvent) => {
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
        pendingIceCandidatesRef.current
          .get(actualSenderId)!
          .push(candidatePayload);
        return;
      }

      try {
        await pc.addIceCandidate(new window.RTCIceCandidate(candidatePayload));
      } catch {
        return;
      }
    };

    const bindSocketEvents = async () => {
      try {
        await socketClient.connect();
      } catch {
        return;
      }

      if (!mounted || !socketClient.socket) return;
      boundSocket = socketClient.socket;

      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_INIT, onCallInit);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_ACCEPT, onCallAccept);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_REJECT, onCallReject);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_END, onCallEnd);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, onCallHeartbeat);
      boundSocket.on(CHAT_SOCKET_EVENTS.CALL_RINGING, onCallRinging);
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
        boundSocket.off(CHAT_SOCKET_EVENTS.CALL_RINGING, onCallRinging);
        boundSocket.off(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, onOffer);
        boundSocket.off(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, onAnswer);
        boundSocket.off(
          CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE,
          onIceCandidate,
        );
      }
    };
  }, [
    cleanup,
    emitSignal,
    flushPendingIceCandidates,
    resolveSignalConversationId,
    setupPeerConnection,
    initiateConnectionWithPeer,
    isGroupCall,
    setGroupCallActive,
    user?.sub,
  ]);

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
