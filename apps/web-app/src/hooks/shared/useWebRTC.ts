import { useAuth } from "@/providers/auth-context";
import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import type {
  ChatCallAcceptPayload,
  ChatCallEndPayload,
  ChatCallHeartbeatPayload,
  ChatCallInitPayload,
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
  | "CONNECTING";

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
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as { acceptedAt?: unknown; serverTimestamp?: unknown };

  return {
    acceptedAt:
      typeof payload.acceptedAt === "string" ? payload.acceptedAt : undefined,
    serverTimestamp:
      typeof payload.serverTimestamp === "string"
        ? payload.serverTimestamp
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

  const getIceServers = (): RTCConfiguration => {
    const turnUsername = import.meta.env.VITE_TURN_USERNAME || "";
    const turnPassword = import.meta.env.VITE_TURN_PASSWORD || "";
    const iceServers: RTCIceServer[] = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun.relay.metered.ca:80" },
    ];

    // Add TURN relays only when credentials are configured.
    // TURN is required for symmetric NAT traversal (corporate networks, some carriers).
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

      // Server now emits neutral DM#A#B / GRP#xxx keys — pass them through as-is.
      // Legacy dm:X format from old clients is still supported by the gateway.
      const isGroupConversation = /^(group:|grp#|group#)/i.test(
        rawConversationId,
      );
      const isDmKey = /^DM#/i.test(rawConversationId);

      if (isDmKey || isGroupConversation) {
        return rawConversationId;
      }

      // Legacy: if rawConversationId is "dm:X" or just a targetUserId-relative string,
      // keep backward-compat by returning it as-is (gateway handles both forms).
      return rawConversationId;
    },
    [],
  );

  const isGroupCall = useCallback((config?: CallConfig | null) => {
    const rawConversationId = config?.conversationId?.trim();
    if (!rawConversationId) return false;
    return /^(group:|grp#|group#)/i.test(rawConversationId);
  }, []);

  const cleanup = useCallback(
    (options?: { remoteDurationSeconds?: number }) => {
      console.log("[WebRTC] Dọn dẹp kết nối");
      const currentConfig = activeConfigRef.current;
      const isConnectedCall =
        callStateRef.current === "CONNECTED" && Boolean(currentConfig);

      if (currentConfig && callStateRef.current !== "IDLE") {
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
      setRemoteStreams(new Map());

      if (iceSignalTimerRef.current !== null) {
        window.clearTimeout(iceSignalTimerRef.current);
        iceSignalTimerRef.current = null;
      }
      pendingIceSignalsRef.current = [];
      sentIceCandidateKeysRef.current.clear();
      pendingIceCandidatesRef.current.clear();
      leftPeersRef.current.clear();
      setCallState("IDLE");
      callStateRef.current = "IDLE";
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
        Math.max(
          0,
          Math.floor((Date.now() - callStartedAtRef.current) / 1000),
        ),
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
        setCallError(
          getSocketErrorMessage(error, "Lỗi gửi tín hiệu qua máy chủ."),
        );
        // Only cleanup if it's a critical init/accept failure, otherwise might just be 1 peer failing
        if (
          event === CHAT_SOCKET_EVENTS.CALL_INIT ||
          event === CHAT_SOCKET_EVENTS.CALL_ACCEPT
        ) {
          cleanup();
        }
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
        // Bypass emitSignal (which swallows errors) — use socketClient directly
        // so 409/404 (session gone) actually throws and we can cleanup.
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
          // Session was deleted by remote party who hung up (CALL_END was missed).
          cleanup();
        }
      }
    };

    // Delay first ping 3s to let session reach ACTIVE state.
    const initialTimer = window.setTimeout(() => void emitHeartbeat(), 3000);
    const interval = setInterval(() => void emitHeartbeat(), 5000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [callState, resolveSignalConversationId, cleanup]);

  // CALLING timeout: auto-hangup if no answer within 45 seconds.
  useEffect(() => {
    if (callState !== "CALLING") return;
    const timer = window.setTimeout(() => {
      if (callStateRef.current === "CALLING") {
        const config = activeConfigRef.current;
        const signalConvId = resolveSignalConversationId(config);
        if (signalConvId) {
          void emitSignal(CHAT_SOCKET_EVENTS.CALL_END, {
            conversationId: signalConvId,
            userId: userIdRef.current,
          });
        }
        cleanup();
      }
    }, 45_000);
    return () => clearTimeout(timer);
  }, [callState, cleanup, emitSignal, resolveSignalConversationId]);

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
        console.error("[WebRTC] Failed to apply queued ICE candidate", error);
      }
    }
    pendingIceCandidatesRef.current.set(peerId, []);
  }, []);

  const requestLocalMediaStream = useCallback(async (isVideo: boolean) => {
    // If cached stream already has video (or we only need audio), reuse it.
    if (localStreamRef.current) {
      const hasVideo = localStreamRef.current.getVideoTracks().length > 0;
      if (!isVideo || hasVideo) return localStreamRef.current;
      // Need video but stream is audio-only: stop existing tracks before upgrading,
      // otherwise the next getUserMedia call may fail (audio source still captured).
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

      // Prevent concurrent setup for the same peerId
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

          pc.ontrack = (event) => {
            setRemoteStreams((prev) => {
              const nextMap = new Map(prev);
              const existingStream = nextMap.get(peerId);
              if (existingStream) {
                // Create a new MediaStream to force React reference equality update
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

          // Ensure video is negotiated even if local camera fails/is missing,
          // so we can still receive video from the other participant.
          if (config.isVideo && stream.getVideoTracks().length === 0) {
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

            // Nhúng targetId, senderId để nhóm có thể định tuyến Mesh
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
    ],
  );

  const initiateConnectionWithPeer = useCallback(
    async (peerId: string, config: CallConfig) => {
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
      // Enrich config with callerId so lastEndedCall.direction computes correctly.
      const enrichedConfig: CallConfig = {
        ...config,
        callerId: config.callerId ?? user?.sub,
      };
      setActiveConfig(enrichedConfig);
      activeConfigRef.current = enrichedConfig;
      setCallState("CALLING");
      callStateRef.current = "CALLING";
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
          setCallState("CONNECTED");
          callStateRef.current = "CONNECTED";
          // We DO NOT set callStartedAtRef.current here.
          // The timer only starts when the first person answers (onCallAccept).
        }
      } catch (rawError: unknown) {
        const error = asSocketError(rawError);
        if (getSocketErrorStatusCode(error) === 409 && isGroupCall(config)) {
          // Group call already active → join it directly
          console.log("[WebRTC] Group call already active, joining...");
          try {
            await requestLocalMediaStream(config.isVideo);
          } catch (err) {
            console.error("[WebRTC] Local media stream failed", err);
          }

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
          } catch (acceptErr) {
            console.error(
              "[WebRTC] Failed to join active group call",
              acceptErr,
            );
            setCallError("Lỗi tham gia cuộc gọi nhóm đang diễn ra.");
            cleanup();
          }
          return;
        }

        console.error("[WebRTC] Lỗi gửi tín hiệu ở call.init", error);
        setCallError(
          getSocketErrorMessage(error, "Không thể khởi tạo cuộc gọi."),
        );
        cleanup();
      }
    },
    [
      cleanup,
      resolveSignalConversationId,
      user?.sub,
      isGroupCall,
      requestLocalMediaStream,
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
      }

      setCallState("CONNECTED");
      callStateRef.current = "CONNECTED";
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
      } catch (acceptErr) {
        console.error(
          "[WebRTC] Lỗi tham gia cuộc gọi nhóm đang diễn ra",
          acceptErr,
        );
        setCallError("Lỗi tham gia cuộc gọi nhóm đang diễn ra.");
        cleanup();
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
    ],
  );

  const acceptCall = useCallback(async () => {
    if (callStateRef.current !== "INCOMING" || !activeConfigRef.current) return;

    // Prevent double-clicks from emitting CALL_ACCEPT twice
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
      // Proceed even if stream failed (e.g. user denied or no camera)
    }

    const response = parseCallAcceptAckPayload(
      await emitSignal(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
        conversationId: signalConversationId,
        calleeId: user?.sub,
      }),
    );
    if (!response) {
      setCallState("INCOMING");
      callStateRef.current = "INCOMING"; // Revert on failure
      return;
    }

    if (response?.acceptedAt && response?.serverTimestamp) {
      const elapsedMs =
        new Date(response.serverTimestamp).getTime() -
        new Date(response.acceptedAt).getTime();
      callStartedAtRef.current = Date.now() - elapsedMs;
    } else {
      // For 1-1 calls or group first-join where acceptedAt might be null/missing
      callStartedAtRef.current = Date.now();
    }

    setCallState("CONNECTED");
    callStateRef.current = "CONNECTED";
    // callStartedAtRef will be set from server acceptedAt in onCallAccept broadcast.

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

  const endCall = useCallback(() => {
    const config = activeConfigRef.current;
    const signalConversationId = resolveSignalConversationId(config);
    if (signalConversationId) {
      void emitSignal(CHAT_SOCKET_EVENTS.CALL_END, {
        conversationId: signalConversationId,
        userId: user?.sub,
      });
    }
    // Always cleanup immediately: server only notifies the OTHER party.
    cleanup();
  }, [emitSignal, cleanup, resolveSignalConversationId, user?.sub]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream
        .getAudioTracks()
        .forEach((track) => (track.enabled = !track.enabled));
      setIsMicOn(!isMicOn);
    }
  }, [localStream, isMicOn]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      localStream
        .getVideoTracks()
        .forEach((track) => (track.enabled = !track.enabled));
      setIsVideoOn(!isVideoOn);
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
        setActiveGroupCalls((prev) => {
          if (prev.has(data.conversationId)) return prev;
          const next = new Set(prev);
          next.add(data.conversationId);
          return next;
        });
      }

      if (data.callerId === userIdRef.current) return;

      // If already in a call, ignore new calls unless it's the SAME group
      const currentConfig = activeConfigRef.current;
      if (callStateRef.current !== "IDLE") {
        if (
          !currentConfig ||
          currentConfig.conversationId !== data.conversationId
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
          // Populate targetUserId so onCallAccept can match even when conversationId formats differ.
          targetUserId: data.callerId,
        };
        setActiveConfig(config);
        activeConfigRef.current = config;
        setCallState("INCOMING");
        callStateRef.current = "INCOMING";
      }
    };

    const onCallAccept = async (data: ChatCallAcceptPayload) => {
      const config = activeConfigRef.current;

      // P0-A: Multi-device — same user accepted on another device → dismiss this popup.
      if (
        config &&
        callStateRef.current === "INCOMING" &&
        data.calleeId === userIdRef.current &&
        data.conversationId === config.conversationId
      ) {
        cleanup();
        return;
      }

      if (
        !config ||
        (callStateRef.current !== "CALLING" &&
          callStateRef.current !== "CONNECTED")
      )
        return;

      const peerId = data.calleeId;
      // Skip self-echo (callee receives own accept broadcast)
      if (peerId === userIdRef.current) return;

      // For 1-1 calls: config.conversationId may be "dm:B" (from UI) while data.conversationId
      // is "DM#A#B" (server conversationKey) — string comparison is unreliable across platforms.
      // Use peer-ID matching instead:
      //   - If we are the CALLER (callerId===self): any accept event is for our call.
      //   - If we are the CALLEE (callerId!==self): the accept peerId must be our caller or target.
      const isDmCall = !isGroupCall(config);
      let isMatch: boolean;
      if (isDmCall) {
        const iAmCaller = config.callerId === userIdRef.current;
        isMatch = iAmCaller
          ? true // Caller accepts any CALL_ACCEPT (only one active 1-1 call possible)
          : config.callerId === peerId || config.targetUserId === peerId;
      } else {
        const normConvId = (id: string) =>
          id
            .toUpperCase()
            .replace(/^GROUP:/, "GRP#")
            .replace(/^GROUP#/, "GRP#");
        isMatch =
          normConvId(config.conversationId ?? "") ===
          normConvId(data.conversationId ?? "");
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

    const onCallHeartbeat = async (data: ChatCallHeartbeatPayload) => {
      const config = activeConfigRef.current;
      const conversationId = data.conversationId;

      if (data.acceptedAt && data.serverTimestamp) {
        const serverNow = new Date(data.serverTimestamp).getTime();
        const acceptedAt = new Date(data.acceptedAt).getTime();
        const localNow = Date.now();
        const offset = localNow - serverNow;
        // Continuous sync: update even if already set to correct any drift
        callStartedAtRef.current = acceptedAt + offset;
      }

      if (/^(group:|grp#|group#)/i.test(conversationId)) {
        setActiveGroupCalls((prev) => {
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

        activeGroupCallsTimeoutsRef.current.set(
          conversationId,
          window.setTimeout(() => {
            setActiveGroupCalls((prev) => {
              const next = new Set(prev);
              next.delete(conversationId);
              return next;
            });
            activeGroupCallsTimeoutsRef.current.delete(conversationId);
            // P1: 60 s > 30 s heartbeat interval — tolerates one missed packet.
          }, 60_000),
        );
      }

      if (!config || callStateRef.current !== "CONNECTED") return;
      if (config.conversationId !== conversationId) return;

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
      // P1: Multi-device — same user rejected on another device → dismiss this popup.
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

    const onCallEnd = (data: ChatCallEndPayload) => {
      // Guard: ignore if no active call on this device.
      if (callStateRef.current === "IDLE") return;

      const config = activeConfigRef.current;
      if (
        config &&
        callStateRef.current === "INCOMING" &&
        data.conversationId === config.conversationId
      ) {
        cleanup({ remoteDurationSeconds: data?.durationSeconds });
        return;
      }

      const peerId = data.endedByUserId || data.userId;
      const isSelfEnd = peerId === userIdRef.current;

      if (isGroupCall(activeConfigRef.current)) {
        if (isSelfEnd) {
          // Self-CALL_END in group: already handled locally, skip.
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
        // 1-1 call: verify peerId belongs to the current active call to reject stale events.
        const config = activeConfigRef.current;
        const expectedPeer =
          config?.callerId === userIdRef.current
            ? config?.targetUserId // We are caller, peer is target
            : config?.callerId; // We are callee, peer is caller
        if (expectedPeer && peerId && peerId !== expectedPeer && !isSelfEnd) {
          console.warn("[WebRTC] Ignored stale CALL_END from unexpected peer", {
            peerId,
            expectedPeer,
          });
          return;
        }
        cleanup({ remoteDurationSeconds: data?.durationSeconds });
      }
    };

    const onOffer = async (data: WebRTCOfferEvent) => {
      const offerPayload = data.offer;
      if (!offerPayload || typeof offerPayload !== "object") {
        console.warn("[WebRTC] Ignored empty WebRTC offer", {
          conversationId: data.conversationId,
        });
        return;
      }

      const actualSenderId = offerPayload.senderId || getFallbackPeerId();

      const actualTargetId = offerPayload.targetId || userIdRef.current;
      if (actualTargetId !== userIdRef.current || !actualSenderId) return;

      leftPeersRef.current.delete(actualSenderId);

      // Guard: if this device has no active call (e.g. another device of the same
      // account already accepted and dismissed this one), ignore WebRTC signals.
      if (!activeConfigRef.current) {
        console.warn("[WebRTC] Ignored offer: no active call on this device", {
          senderId: actualSenderId,
        });
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
        console.warn("[WebRTC] Ignored invalid WebRTC offer", {
          conversationId: data.conversationId,
          senderId: actualSenderId,
        });
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
        console.warn("[WebRTC] Ignored empty WebRTC answer", {
          conversationId: data.conversationId,
        });
        return;
      }

      const actualSenderId = answerPayload.senderId || getFallbackPeerId();
      const actualTargetId = answerPayload.targetId || userIdRef.current;

      if (actualTargetId !== userIdRef.current || !actualSenderId) return;

      const pc = peerConnectionsRef.current.get(actualSenderId);
      if (!pc) return;

      if (!isValidSessionDescription(answerPayload)) {
        console.warn("[WebRTC] Ignored invalid WebRTC answer", {
          conversationId: data.conversationId,
          senderId: actualSenderId,
        });
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
