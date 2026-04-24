import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { socketClient } from "../../lib/socket-client";
import { useAuth } from "../../providers/AuthProvider";
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from "./WebRTCShim";

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

export interface RemoteParticipant {
  userId: string;
  stream: MediaStream;
  displayName: string;
  avatarUrl?: string;
}

function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode;
  }

  if ("status" in error && typeof error.status === "number") {
    return error.status;
  }

  return undefined;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }

  return fallback;
}

function isValidSessionDescription(value: unknown): value is {
  type: "offer" | "answer" | "pranswer" | "rollback";
  sdp: string;
} {
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

export const useWebRTC = (conversationId?: string) => {
  const { user } = useAuth();
  const userIdRef = useRef<string | undefined>(user?.sub);

  const [callState, setCallState] = useState<CallState>("IDLE");
  const [activeConfig, setActiveConfig] = useState<CallConfig | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<
    RemoteParticipant[]
  >([]);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [lastEndedCall, setLastEndedCall] = useState<CallEndedSummary | null>(
    null,
  );
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);
  const [activeGroupCalls, setActiveGroupCalls] = useState<Set<string>>(
    new Set(),
  );
  const [callError, setCallError] = useState<string | null>(null);

  const activeConfigRef = useRef<CallConfig | null>(null);
  const callStateRef = useRef<CallState>("IDLE");
  const callStartedAtRef = useRef<number | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, any[]>>(new Map());
  const remoteParticipantsRef = useRef<Map<string, RemoteParticipant>>(
    new Map(),
  );
  const leftPeersRef = useRef<Set<string>>(new Set());
  const activeGroupCallsTimeoutsRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());

  const isGroupConversationId = useCallback(
    (value?: string | null) =>
      /^(group:|grp#|group#)/i.test(value?.trim() || ""),
    [],
  );

  const resolveSignalConversationId = useCallback(
    (config?: CallConfig | null, fallbackConvId?: string) => {
      const rawConversationId = (
        config?.conversationId ?? fallbackConvId
      )?.trim();
      if (!rawConversationId) return "";

      // Server now emits neutral DM#A#B / GRP#xxx keys — pass them through as-is.
      const isGroupConversation = isGroupConversationId(rawConversationId);
      const isDmKey = /^DM#/i.test(rawConversationId);

      if (isDmKey || isGroupConversation) {
        return rawConversationId;
      }

      // Legacy: dm:X or raw userId-relative strings — pass as-is, gateway handles both.
      return rawConversationId;
    },
    [isGroupConversationId],
  );

  const emitSignal = useCallback(
    async <T = any>(event: string, payload: any) => {
      await socketClient.connect();
      return await socketClient.emitWithAck<T>(event, payload);
    },
    [],
  );

  const safeEmit = useCallback(
    (event: string, payload: any) => {
      void emitSignal(event, payload).catch((error) => {
        console.warn(`[useWebRTC] ${event} skipped: socket unavailable`, error);
      });
    },
    [emitSignal],
  );

  const syncRemoteParticipantsState = useCallback(() => {
    const items = Array.from(remoteParticipantsRef.current.values());
    setRemoteParticipants(items);
    setRemoteStream(items[0]?.stream ?? null);
  }, []);

  const derivePeerDisplayName = useCallback(
    (peerId: string, config?: CallConfig | null) => {
      if (config?.callerId === peerId) {
        return config.callerName || `Thành viên ${peerId.slice(0, 4)}`;
      }

      if (config?.targetUserId === peerId) {
        return config.peerName || `Thành viên ${peerId.slice(0, 4)}`;
      }

      return `Thành viên ${peerId.slice(0, 4)}`;
    },
    [],
  );

  const derivePeerAvatarUrl = useCallback(
    (peerId: string, config?: CallConfig | null) => {
      if (config?.callerId === peerId) {
        return config.callerAvatarUrl;
      }

      if (config?.targetUserId === peerId) {
        return config.peerAvatarUrl;
      }

      return undefined;
    },
    [],
  );

  const upsertRemoteParticipant = useCallback(
    (peerId: string, stream: MediaStream) => {
      const config = activeConfigRef.current;
      remoteParticipantsRef.current.set(peerId, {
        userId: peerId,
        stream,
        displayName: derivePeerDisplayName(peerId, config),
        avatarUrl: derivePeerAvatarUrl(peerId, config),
      });
      syncRemoteParticipantsState();
    },
    [derivePeerAvatarUrl, derivePeerDisplayName, syncRemoteParticipantsState],
  );

  const removePeerConnection = useCallback(
    (peerId: string) => {
      const pc = peerConnectionsRef.current.get(peerId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(peerId);
      }

      pendingIceCandidatesRef.current.delete(peerId);

      const participant = remoteParticipantsRef.current.get(peerId);
      if (participant) {
        participant.stream.getTracks().forEach((track) => track.stop());
        remoteParticipantsRef.current.delete(peerId);
        syncRemoteParticipantsState();
      }
    },
    [syncRemoteParticipantsState],
  );

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
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [callState]);

  const getIceServers = useCallback(() => {
    const turnUsername =
      process.env.EXPO_PUBLIC_TURN_USERNAME ||
      process.env.VITE_TURN_USERNAME ||
      "2fec29a1e9f3a53983b8e5fd";
    const turnPassword =
      process.env.EXPO_PUBLIC_TURN_PASSWORD ||
      process.env.VITE_TURN_PASSWORD ||
      "MmdvU+k086vCyro2";

    return {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun.relay.metered.ca:80" },
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
      ],
    };
  }, []);

  const requestLocalMediaStream = useCallback(async (isVideo: boolean) => {
    if (localStreamRef.current) {
      setLocalStream(localStreamRef.current);
      return localStreamRef.current;
    }

    if (mediaStreamPromiseRef.current) {
      return mediaStreamPromiseRef.current;
    }

    mediaStreamPromiseRef.current = (async () => {
      try {
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: isVideo
            ? {
                facingMode: "user",
                width: 640,
                height: 480,
                frameRate: 30,
              }
            : false,
        });

        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsMicOn(stream.getAudioTracks()[0]?.enabled ?? true);
        setIsVideoOn(stream.getVideoTracks()[0]?.enabled ?? isVideo);
        return stream;
      } catch (error) {
        if (!isVideo) {
          throw error;
        }

        const audioOnlyStream = await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        localStreamRef.current = audioOnlyStream;
        setLocalStream(audioOnlyStream);
        setIsMicOn(audioOnlyStream.getAudioTracks()[0]?.enabled ?? true);
        setIsVideoOn(false);
        return audioOnlyStream;
      } finally {
        mediaStreamPromiseRef.current = null;
      }
    })();

    return mediaStreamPromiseRef.current;
  }, []);

  const flushPendingIceCandidates = useCallback(async (peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    const queued = pendingIceCandidatesRef.current.get(peerId);

    if (!pc || !pc.remoteDescription || !queued?.length) {
      return;
    }

    pendingIceCandidatesRef.current.delete(peerId);

    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error(
          "[useWebRTC] Failed to apply queued ice candidate",
          error,
        );
      }
    }
  }, []);

  const sendPeerOffer = useCallback(
    async (peerId: string, pc: RTCPeerConnection, config: CallConfig) => {
      const signalConversationId = resolveSignalConversationId(config);
      if (!signalConversationId) {
        return;
      }

      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);

      safeEmit(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
        conversationId: signalConversationId,
        offer: {
          type: offer.type,
          sdp: offer.sdp,
          senderId: userIdRef.current,
          targetId: peerId,
        },
      });
    },
    [resolveSignalConversationId, safeEmit],
  );

  const cleanup = useCallback(
    (options?: { remoteDurationSeconds?: number }) => {
      const currentConfig = activeConfigRef.current;
      const isConnectedCall =
        callStateRef.current === "CONNECTED" && Boolean(currentConfig);

      if (currentConfig) {
        const endedAt = Date.now();
        const computedDuration = callStartedAtRef.current
          ? Math.max(0, Math.round((endedAt - callStartedAtRef.current) / 1000))
          : 0;
        const durationSeconds =
          typeof options?.remoteDurationSeconds === "number"
            ? Math.max(0, Math.round(options.remoteDurationSeconds))
            : computedDuration;
        const firstParticipant = remoteParticipantsRef.current.values().next()
          .value as RemoteParticipant | undefined;

        setLastEndedCall({
          conversationId: currentConfig.conversationId || "",
          peerUserId:
            currentConfig?.callerId === userIdRef.current
              ? currentConfig?.targetUserId
              : currentConfig?.callerId,
          peerName:
            firstParticipant?.displayName ||
            currentConfig?.peerName ||
            currentConfig?.callerName ||
            "Người dùng",
          peerAvatarUrl:
            firstParticipant?.avatarUrl ||
            currentConfig?.peerAvatarUrl ||
            currentConfig?.callerAvatarUrl,
          isVideo: Boolean(currentConfig?.isVideo),
          durationSeconds: isConnectedCall ? durationSeconds : 0,
          endedAt: new Date(endedAt).toISOString(),
          direction:
            currentConfig?.callerId === userIdRef.current
              ? "outgoing"
              : "incoming",
        });
      }

      callStartedAtRef.current = null;

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      localStreamRef.current = null;
      mediaStreamPromiseRef.current = null;

      const stoppedTrackIds = new Set<string>();
      for (const participant of remoteParticipantsRef.current.values()) {
        participant.stream.getTracks().forEach((track) => {
          if (stoppedTrackIds.has(track.id)) {
            return;
          }
          stoppedTrackIds.add(track.id);
          track.stop();
        });
      }

      for (const pc of peerConnectionsRef.current.values()) {
        pc.close();
      }

      peerConnectionsRef.current.clear();
      pendingIceCandidatesRef.current.clear();
      remoteParticipantsRef.current.clear();
      leftPeersRef.current.clear();

      setLocalStream(null);
      setRemoteStream(null);
      setRemoteParticipants([]);
      setCallState("IDLE");
      callStateRef.current = "IDLE";
      setActiveConfig(null);
      activeConfigRef.current = null;
      setCallError(null);
      setIsMicOn(true);
      setIsVideoOn(false);
    },
    [],
  );

  // Dead-session detection: if heartbeat returns 409 (session deleted by remote party),
  // cleanup immediately. This handles the case where CALL_END signal was missed.
  useEffect(() => {
    if (callState !== "CONNECTED" || !activeConfigRef.current) return;

    const pingSession = async () => {
      const config = activeConfigRef.current;
      if (!config) return;
      const signalConvId = resolveSignalConversationId(config);
      if (!signalConvId) return;
      try {
        await emitSignal(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, {
          conversationId: signalConvId,
          userId: userIdRef.current,
        });
      } catch (err) {
        const code = getStatusCode(err);
        if (code === 409 || code === 404) {
          cleanup();
        }
      }
    };

    // Delay first ping 3s to allow session to reach ACTIVE state.
    const initialTimer = setTimeout(() => void pingSession(), 3000);
    const interval = setInterval(() => void pingSession(), 5000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [callState, cleanup, emitSignal, resolveSignalConversationId]);

  // CALLING timeout: auto-hangup if no answer within 45 seconds.
  useEffect(() => {
    if (callState !== "CALLING") return;
    const timer = setTimeout(() => {
      if (callStateRef.current === "CALLING") {
        const config = activeConfigRef.current;
        const signalConvId = resolveSignalConversationId(config);
        if (signalConvId) {
          safeEmit(CHAT_SOCKET_EVENTS.CALL_END, {
            conversationId: signalConvId,
            userId: userIdRef.current,
          });
        }
        cleanup();
      }
    }, 45_000);
    return () => clearTimeout(timer);
  }, [callState, cleanup, resolveSignalConversationId, safeEmit]);

  const connectingPeersRef = useRef<Map<string, Promise<RTCPeerConnection>>>(
    new Map(),
  );

  const setupPeerConnection = useCallback(
    async (
      peerId: string | undefined,
      isOfferCreator: boolean,
      config: CallConfig,
    ) => {
      if (!peerId || peerId === userIdRef.current) {
        return null;
      }

      const existing = peerConnectionsRef.current.get(peerId);
      if (existing) {
        return existing;
      }

      const pendingPromise = connectingPeersRef.current.get(peerId);
      if (pendingPromise) return pendingPromise;

      const setupPromise = (async () => {
        const signalConversationId = resolveSignalConversationId(config);
        if (!signalConversationId) {
          throw new Error("Missing signaling conversation id");
        }

        try {
          const stream = await requestLocalMediaStream(config.isVideo);
          const pc = new RTCPeerConnection(getIceServers());
          peerConnectionsRef.current.set(peerId, pc);

          pc.onicecandidate = (event: any) => {
            const payload = event.candidate?.toJSON?.() ?? event.candidate;
            if (!payload) {
              return;
            }

            safeEmit(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
              conversationId: signalConversationId,
              candidate: {
                ...payload,
                senderId: userIdRef.current,
                targetId: peerId,
              },
            });
          };

          pc.ontrack = (event: any) => {
            leftPeersRef.current.delete(peerId);
            if (event.streams && event.streams[0]) {
              upsertRemoteParticipant(peerId, event.streams[0]);
              return;
            }

            const existingParticipant =
              remoteParticipantsRef.current.get(peerId);
            const newStream = new MediaStream(
              existingParticipant ? existingParticipant.stream.getTracks() : [],
            );
            newStream.addTrack(event.track);
            upsertRemoteParticipant(peerId, newStream);
          };

          pc.onconnectionstatechange = () => {
            if (
              pc.connectionState === "failed" ||
              pc.connectionState === "closed" ||
              pc.connectionState === "disconnected"
            ) {
              removePeerConnection(peerId);
            }
          };

          stream.getTracks().forEach((track: any) => {
            pc.addTrack(track, stream);
          });

          if (config.isVideo && stream.getVideoTracks().length === 0) {
            try {
              (pc as any).addTransceiver("video", { direction: "recvonly" });
            } catch (e) {
              console.warn(
                "[WebRTC] Failed to add recvonly video transceiver",
                e,
              );
            }
          }

          if (isOfferCreator) {
            await sendPeerOffer(peerId, pc, config);
          }

          return pc;
        } catch (error) {
          console.error("[useWebRTC] Failed to setup peer connection", error);
          removePeerConnection(peerId);

          if (peerConnectionsRef.current.size === 0) {
            if (getStatusCode(error) === 409) {
              setCallError("Cuộc gọi nhóm không còn hiệu lực.");
            } else {
              setCallError(
                getErrorMessage(
                  error,
                  "Không thể truy cập microphone/camera cho cuộc gọi.",
                ),
              );
            }
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
      getIceServers,
      removePeerConnection,
      requestLocalMediaStream,
      resolveSignalConversationId,
      safeEmit,
      sendPeerOffer,
      upsertRemoteParticipant,
    ],
  );

  const initiateConnectionWithPeer = useCallback(
    async (peerId: string | undefined, config: CallConfig) => {
      if (
        !peerId ||
        peerId === userIdRef.current ||
        leftPeersRef.current.has(peerId)
      ) {
        return;
      }

      if (peerConnectionsRef.current.has(peerId)) {
        return;
      }

      if (!isGroupConversationId(config.conversationId)) {
        const isCaller = config.callerId === userIdRef.current;
        await setupPeerConnection(peerId, isCaller, config);
        return;
      }

      const shouldCreateOffer = (userIdRef.current || "") > peerId;
      await setupPeerConnection(peerId, shouldCreateOffer, config);

      if (!shouldCreateOffer) {
        safeEmit(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, {
          conversationId: resolveSignalConversationId(config),
          userId: userIdRef.current,
        });
      }
    },
    [
      isGroupConversationId,
      resolveSignalConversationId,
      safeEmit,
      setupPeerConnection,
    ],
  );

  const startCall = useCallback(
    async (isVideo: boolean, convId: string, targetId: string) => {
      if (callStateRef.current !== "IDLE") return;

      try {
        await socketClient.connect();
      } catch (error) {
        console.error(
          "[useWebRTC] Cannot start call because socket is down",
          error,
        );
        Alert.alert(
          "Thông báo",
          "Không thể kết nối để thực hiện cuộc gọi. Vui lòng thử lại.",
        );
        cleanup();
        return;
      }

      const config: CallConfig = {
        isVideo,
        targetUserId: targetId,
        conversationId: convId,
        // P1: Store callerId so lastEndedCall.direction ('outgoing') computes correctly.
        callerId: userIdRef.current,
      };

      setLastEndedCall(null);
      setActiveConfig(config);
      activeConfigRef.current = config;
      setCallState("CALLING");
      callStateRef.current = "CALLING";
      setCallError(null);

      // P1: Request media early to ensure tracks are available before signaling
      try {
        await requestLocalMediaStream(isVideo);
      } catch (err) {
        console.warn("[useWebRTC] Early media request failed", err);
      }

      try {
        await emitSignal(CHAT_SOCKET_EVENTS.CALL_INIT, {
          conversationId: convId,
          callerId: userIdRef.current,
          callerName: (user as any)?.fullName || "Người gọi",
          callerAvatarUrl: (user as any)?.avatarUrl,
          isVideo,
        });
      } catch (error) {
        if (getStatusCode(error) === 409 && isGroupConversationId(convId)) {
          try {
            await requestLocalMediaStream(isVideo);
            const response = (await emitSignal(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
              conversationId: resolveSignalConversationId(config),
              calleeId: userIdRef.current,
            })) as any;

            if (response?.acceptedAt && response?.serverTimestamp) {
              const serverNow = new Date(response.serverTimestamp).getTime();
              const acceptedAt = new Date(response.acceptedAt).getTime();
              const localNow = Date.now();
              const offset = localNow - serverNow;
              callStartedAtRef.current = acceptedAt + offset;
            } else if (response?.acceptedAt) {
              callStartedAtRef.current = new Date(response.acceptedAt).getTime();
            } else {
              callStartedAtRef.current = Date.now();
            }

            setCallState("CONNECTED");
            callStateRef.current = "CONNECTED";
            setCallError(null);

            safeEmit(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, {
              conversationId: resolveSignalConversationId(config),
              userId: userIdRef.current,
            });
            return;
          } catch (joinError) {
            console.error(
              "[useWebRTC] Failed to join active group call",
              joinError,
            );
            Alert.alert(
              "Thông báo",
              "Không thể tham gia cuộc gọi nhóm đang diễn ra.",
            );
            cleanup();
            return;
          }
        }

        console.error("[useWebRTC] CALL_INIT failed", error);
        Alert.alert(
          "Thông báo",
          getErrorMessage(error, "Không thể bắt đầu cuộc gọi lúc này."),
        );
        cleanup();
      }
    },
    [
      cleanup,
      emitSignal,
      isGroupConversationId,
      requestLocalMediaStream,
      resolveSignalConversationId,
      safeEmit,
      user,
    ],
  );

  const acceptCall = useCallback(async () => {
    const config = activeConfigRef.current;
    if (callStateRef.current !== "INCOMING" || !config) return;

    // Prevent double-clicks
    callStateRef.current = "CONNECTING";

    try {
      const response = (await emitSignal(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
        conversationId: resolveSignalConversationId(config),
        calleeId: userIdRef.current,
      })) as any;

      if (response?.acceptedAt && response?.serverTimestamp) {
        const serverNow = new Date(response.serverTimestamp).getTime();
        const acceptedAt = new Date(response.acceptedAt).getTime();
        const localNow = Date.now();
        const offset = localNow - serverNow;
        callStartedAtRef.current = acceptedAt + offset;
      } else if (response?.acceptedAt) {
        callStartedAtRef.current = new Date(response.acceptedAt).getTime();
      } else {
        callStartedAtRef.current = Date.now();
      }
    } catch (error) {
      callStateRef.current = "INCOMING"; // Revert state
      console.error("[useWebRTC] CALL_ACCEPT failed", error);
      Alert.alert(
        "Thông báo",
        getErrorMessage(error, "Không thể tham gia cuộc gọi lúc này."),
      );
      cleanup();
      return;
    }

    try {
      await requestLocalMediaStream(config.isVideo);
    } catch (error) {
      console.error("[useWebRTC] Local media request failed", error);
      Alert.alert(
        "Thông báo",
        getErrorMessage(
          error,
          "Không thể truy cập microphone/camera cho cuộc gọi.",
        ),
      );
      cleanup();
      return;
    }

    setLastEndedCall(null);
    setCallState("CONNECTED");
    callStateRef.current = "CONNECTED";
    setCallError(null);
    // callStartedAtRef will be set from server acceptedAt in onCallAccept broadcast.

    if (isGroupConversationId(config.conversationId)) {
      safeEmit(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, {
        conversationId: resolveSignalConversationId(config),
        userId: userIdRef.current,
      });
    }

    if (config.callerId) {
      await initiateConnectionWithPeer(config.callerId, config);
    }
  }, [
    cleanup,
    emitSignal,
    initiateConnectionWithPeer,
    isGroupConversationId,
    requestLocalMediaStream,
    resolveSignalConversationId,
    safeEmit,
  ]);

  const rejectCall = useCallback(() => {
    const config = activeConfigRef.current;
    const signalConversationId = resolveSignalConversationId(config);
    if (signalConversationId) {
      safeEmit(CHAT_SOCKET_EVENTS.CALL_REJECT, {
        conversationId: signalConversationId,
        calleeId: userIdRef.current,
      });
    }
    cleanup();
  }, [cleanup, resolveSignalConversationId, safeEmit]);

  const endCall = useCallback(() => {
    const config = activeConfigRef.current;
    const signalConversationId = resolveSignalConversationId(config);
    if (signalConversationId) {
      if (isGroupConversationId(config?.conversationId)) {
        safeEmit(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
          conversationId: signalConversationId,
          offer: {
            type: "offer",
            sdp: "LEAVE_GROUP",
            senderId: userIdRef.current,
          },
        });
      }
      safeEmit(CHAT_SOCKET_EVENTS.CALL_END, {
        conversationId: signalConversationId,
        userId: userIdRef.current,
      });
    }
    // Always cleanup immediately: server only notifies the OTHER party.
    cleanup();
  }, [cleanup, isGroupConversationId, resolveSignalConversationId, safeEmit]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicOn(audioTrack.enabled);
    }
  }, []);

  const toggleVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoOn(videoTrack.enabled);
      return;
    }

    try {
      const newStream = await mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) {
        return;
      }

      localStreamRef.current?.addTrack(newVideoTrack);
      const currentConfig = activeConfigRef.current;
      if (!currentConfig) {
        setLocalStream(localStreamRef.current);
        return;
      }

      await Promise.all(
        Array.from(peerConnectionsRef.current.entries()).map(
          async ([peerId, pc]) => {
            pc.addTrack(newVideoTrack, localStreamRef.current!);
            await sendPeerOffer(peerId, pc, currentConfig);
          },
        ),
      );
      setLocalStream(localStreamRef.current);
      setIsVideoOn(true);
    } catch (error) {
      console.error("[useWebRTC] Failed to enable video", error);
    }
  }, [sendPeerOffer]);

  useEffect(() => {
    if (__DEV__ && conversationId) {
      console.log("[useWebRTC] Listeners mounted for conv:", conversationId);
    }

    let mounted = true;
    let boundSocket: typeof socketClient.socket | null = null;
    const groupCallTimeouts = activeGroupCallsTimeoutsRef.current;

    const getFallbackPeerId = () => {
      const config = activeConfigRef.current;
      return config?.callerId === userIdRef.current
        ? config?.targetUserId
        : config?.callerId;
    };

    const onCallInit = (data: any) => {
      if (data.callerId === userIdRef.current) {
        return;
      }

      const currentConfig = activeConfigRef.current;
      if (callStateRef.current !== "IDLE") {
        if (
          !currentConfig ||
          currentConfig.conversationId !== data.conversationId ||
          !isGroupConversationId(currentConfig.conversationId)
        ) {
          return;
        }
      }

      if (callStateRef.current === "IDLE") {
        const nextConfig: CallConfig = {
          isVideo: Boolean(data.isVideo),
          callerId: data.callerId,
          callerName: data.callerName,
          callerAvatarUrl: data.callerAvatarUrl,
          peerName: data.callerName,
          peerAvatarUrl: data.callerAvatarUrl,
          conversationId: data.conversationId,
          // Populate targetUserId so onCallAccept matching works cross-platform.
          targetUserId: data.callerId,
        };
        setActiveConfig(nextConfig);
        activeConfigRef.current = nextConfig;
        setCallState("INCOMING");
        callStateRef.current = "INCOMING";
      }
    };

    const onCallAccept = async (data: any) => {
      const currentConfig = activeConfigRef.current;

      // P0-A: Multi-device — same user accepted on another device → dismiss popup.
      if (
        currentConfig &&
        callStateRef.current === "INCOMING" &&
        data.calleeId === userIdRef.current &&
        data.conversationId === currentConfig.conversationId
      ) {
        cleanup();
        return;
      }

      if (
        !currentConfig ||
        (callStateRef.current !== "CALLING" &&
          callStateRef.current !== "CONNECTED")
      ) {
        return;
      }

      // Skip self-echo
      if (data.calleeId === userIdRef.current) return;

      // Use peer-ID matching (same fix as web):
      // config.conversationId may differ in format from data.conversationId (server key).
      // For 1-1: if I am the caller → accept any CALL_ACCEPT (only one active DM call).
      //          if I am the callee → peerId must be our expected caller.
      const isDmCall = !isGroupConversationId(currentConfig.conversationId);
      let isMatch: boolean;
      if (isDmCall) {
        const iAmCaller = currentConfig.callerId === userIdRef.current;
        isMatch = iAmCaller
          ? true
          : currentConfig.callerId === data.calleeId ||
            currentConfig.targetUserId === data.calleeId;
      } else {
        const normConvId = (id: string) =>
          id
            .toUpperCase()
            .replace(/^GROUP:/, "GRP#")
            .replace(/^GROUP#/, "GRP#");
        isMatch =
          normConvId(currentConfig.conversationId ?? "") ===
          normConvId(data.conversationId ?? "");
      }
      if (!isMatch) return;

      leftPeersRef.current.delete(data.calleeId);

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

      await initiateConnectionWithPeer(data.calleeId, currentConfig);
    };

    const onCallHeartbeat = async (data: any) => {
      if (data.acceptedAt && data.serverTimestamp) {
        const serverNow = new Date(data.serverTimestamp).getTime();
        const acceptedAt = new Date(data.acceptedAt).getTime();
        const localNow = Date.now();
        const offset = localNow - serverNow;
        callStartedAtRef.current = acceptedAt + offset;
      }
      const currentConfig = activeConfigRef.current;
      const conversationId = data.conversationId;

      if (/^(group:|grp#|group#)/i.test(conversationId)) {
        setActiveGroupCalls((prev) => {
          if (!prev.has(conversationId)) {
            const next = new Set(prev);
            next.add(conversationId);
            return next;
          }
          return prev;
        });

        if (groupCallTimeouts.has(conversationId)) {
          clearTimeout(groupCallTimeouts.get(conversationId));
        }

        groupCallTimeouts.set(
          conversationId,
          setTimeout(() => {
            setActiveGroupCalls((prev) => {
              const next = new Set(prev);
              next.delete(conversationId);
              return next;
            });
            groupCallTimeouts.delete(conversationId);
            // P1: 60 s > 30 s heartbeat interval — tolerates one missed heartbeat packet.
          }, 60_000),
        );
      }

      if (
        !currentConfig ||
        callStateRef.current !== "CONNECTED" ||
        !isGroupConversationId(currentConfig.conversationId) ||
        currentConfig.conversationId !== data.conversationId ||
        data.userId === userIdRef.current ||
        leftPeersRef.current.has(data.userId)
      ) {
        return;
      }

      await initiateConnectionWithPeer(data.userId, currentConfig);
    };

    const onCallReject = (data: { calleeId?: string } = {}) => {
      // P1: Multi-device — same user rejected on another device → dismiss popup.
      if (
        callStateRef.current === "INCOMING" &&
        data.calleeId === userIdRef.current
      ) {
        cleanup();
        return;
      }

      if (!isGroupConversationId(activeConfigRef.current?.conversationId)) {
        cleanup();
      }
    };

    const onCallEnd = (data: any) => {
      // Guard: ignore if no active call on this device.
      if (callStateRef.current === "IDLE") return;

      const config = activeConfigRef.current;
      if (
        config &&
        callStateRef.current === "INCOMING" &&
        data?.conversationId === config.conversationId
      ) {
        cleanup({ remoteDurationSeconds: data?.durationSeconds });
        return;
      }

      const peerId = data?.endedByUserId || data?.userId;
      const isSelfEnd = peerId === userIdRef.current;

      if (typeof data?.conversationId === "string") {
        const timeoutId = groupCallTimeouts.get(data.conversationId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          groupCallTimeouts.delete(data.conversationId);
        }
        setActiveGroupCalls((prev) => {
          const next = new Set(prev);
          next.delete(data.conversationId);
          return next;
        });
      }

      if (isGroupConversationId(activeConfigRef.current?.conversationId)) {
        if (isSelfEnd) return;
        leftPeersRef.current.add(peerId);
        removePeerConnection(peerId);
        if (peerConnectionsRef.current.size === 0 && !data?.callStillActive) {
          cleanup({ remoteDurationSeconds: data?.durationSeconds });
        }
        return;
      }

      // 1-1 call: verify peerId belongs to current active call to reject stale events.

      const expectedPeer =
        config?.callerId === userIdRef.current
          ? config?.targetUserId
          : config?.callerId;
      if (expectedPeer && peerId && peerId !== expectedPeer && !isSelfEnd) {
        console.warn("[useWebRTC] Ignored stale CALL_END", {
          peerId,
          expectedPeer,
        });
        return;
      }
      cleanup({ remoteDurationSeconds: data?.durationSeconds });
    };

    const onOffer = async (data: any) => {
      const currentConfig = activeConfigRef.current;
      if (!currentConfig) return;

      const offerPayload = data.offer;
      if (!offerPayload || typeof offerPayload !== "object") {
        console.warn("[useWebRTC] Ignored empty WebRTC offer", {
          conversationId: data.conversationId,
        });
        return;
      }

      const actualSenderId = offerPayload.senderId || getFallbackPeerId();

      if (offerPayload.sdp === "LEAVE_GROUP") {
        if (actualSenderId && actualSenderId !== userIdRef.current) {
          leftPeersRef.current.add(actualSenderId);
          removePeerConnection(actualSenderId);

          if (
            peerConnectionsRef.current.size === 0 &&
            callStateRef.current === "CONNECTED" &&
            isGroupConversationId(currentConfig.conversationId)
          ) {
            setRemoteStream(null);
          }
        }
        return;
      }

      const actualTargetId = offerPayload.targetId || userIdRef.current;
      if (actualTargetId !== userIdRef.current || !actualSenderId) {
        return;
      }

      leftPeersRef.current.delete(actualSenderId);

      let pc = peerConnectionsRef.current.get(actualSenderId) ?? null;
      if (!pc) {
        pc = await setupPeerConnection(actualSenderId, false, currentConfig);
      }
      if (!pc) return;

      if (!isValidSessionDescription(offerPayload)) {
        console.warn("[useWebRTC] Ignored invalid WebRTC offer", {
          conversationId: data.conversationId,
          senderId: actualSenderId,
        });
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offerPayload));
      await flushPendingIceCandidates(actualSenderId);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await emitSignal(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, {
        conversationId: resolveSignalConversationId(
          currentConfig,
          data.conversationId,
        ),
        answer: {
          type: answer.type,
          sdp: answer.sdp,
          senderId: userIdRef.current,
          targetId: actualSenderId,
        },
      });
    };

    const onAnswer = async (data: any) => {
      const currentConfig = activeConfigRef.current;
      if (!currentConfig) return;

      const answerPayload = data.answer;
      if (!answerPayload || typeof answerPayload !== "object") {
        console.warn("[useWebRTC] Ignored empty WebRTC answer", {
          conversationId: data.conversationId,
        });
        return;
      }

      const actualSenderId = answerPayload.senderId || getFallbackPeerId();
      const actualTargetId = answerPayload.targetId || userIdRef.current;

      if (actualTargetId !== userIdRef.current || !actualSenderId) {
        return;
      }

      const pc = peerConnectionsRef.current.get(actualSenderId);
      if (!pc) return;

      if (!isValidSessionDescription(answerPayload)) {
        console.warn("[useWebRTC] Ignored invalid WebRTC answer", {
          conversationId: data.conversationId,
          senderId: actualSenderId,
        });
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(answerPayload));
      await flushPendingIceCandidates(actualSenderId);
    };

    const onIceCandidate = async (data: any) => {
      const currentConfig = activeConfigRef.current;
      if (!currentConfig || !data.candidate) return;

      const candidatePayload = data.candidate;
      const actualSenderId = candidatePayload.senderId || getFallbackPeerId();
      const actualTargetId = candidatePayload.targetId || userIdRef.current;

      if (actualTargetId !== userIdRef.current || !actualSenderId) {
        return;
      }

      const pc = peerConnectionsRef.current.get(actualSenderId);
      if (!pc || !pc.remoteDescription) {
        const pending =
          pendingIceCandidatesRef.current.get(actualSenderId) ?? [];
        pending.push(candidatePayload);
        pendingIceCandidatesRef.current.set(actualSenderId, pending);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidatePayload));
      } catch (error) {
        console.error("[useWebRTC] Error adding received ICE candidate", error);
      }
    };

    const bindSocketEvents = async () => {
      try {
        await socketClient.connect();
      } catch (error) {
        console.warn("[useWebRTC] Failed to bind call listeners", error);
        return;
      }

      if (!mounted || !socketClient.socket) {
        return;
      }

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
      for (const timeoutId of groupCallTimeouts.values()) {
        clearTimeout(timeoutId);
      }
      groupCallTimeouts.clear();

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
    conversationId,
    emitSignal,
    flushPendingIceCandidates,
    initiateConnectionWithPeer,
    isGroupConversationId,
    removePeerConnection,
    resolveSignalConversationId,
    setupPeerConnection,
  ]);

  return {
    callState,
    activeConfig,
    localStream,
    remoteStream,
    remoteParticipants,
    activeGroupCalls,
    isMicOn,
    isVideoOn,
    callError,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    lastEndedCall,
    callDurationSeconds,
    clearLastEndedCall: () => setLastEndedCall(null),
  };
};
