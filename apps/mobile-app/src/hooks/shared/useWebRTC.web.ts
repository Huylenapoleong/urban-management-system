import { CHAT_SOCKET_EVENTS } from "@urban/shared-constants";
import { useCallback, useEffect, useRef, useState } from "react";
import { socketClient } from "../../lib/socket-client";
import { useAuth } from "../../providers/AuthProvider";

export type CallState = "IDLE" | "CALLING" | "INCOMING" | "CONNECTED";

export const useWebRTC = (conversationId?: string) => {
  const { user } = useAuth();

  const safeEmit = useCallback((event: string, payload: any) => {
    void socketClient.emitWithAck(event, payload).catch((error) => {
      console.warn(
        `[useWebRTC-web] ${event} skipped: socket unavailable`,
        error,
      );
    });
  }, []);

  const resolveSignalConversationId = useCallback(
    (config?: any, fallbackConvId?: string) => {
      const rawConversationId = (
        config?.conversationId ?? fallbackConvId
      )?.trim();
      if (!rawConversationId) return "";

      const isGroupConversation = /^(group:|grp#|group#)/i.test(
        rawConversationId,
      );
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

  const [callState, setCallState] = useState<CallState>("IDLE");
  const [activeConfig, setActiveConfig] = useState<any>(null);

  // Note: we use any for streams because DOM MediaStream is slightly different from react-native-webrtc's MediaStream type
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [isMicOn, setIsMicOn] = useState(true);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<any[]>([]);

  const flushPendingIceCandidates = useCallback(async () => {
    const pc = peerConnection.current;
    if (
      !pc ||
      !pc.remoteDescription ||
      pendingIceCandidatesRef.current.length === 0
    ) {
      return;
    }

    const queued = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];

    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new window.RTCIceCandidate(candidate));
      } catch (e) {
        console.error("[WebRTC-Web] Failed to apply queued ice candidate", e);
      }
    }
  }, []);

  const getIceServers = () => ({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  });

  const cleanup = useCallback(() => {
    if (localStream) {
      localStream
        .getTracks()
        .forEach((track: MediaStreamTrack) => track.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream
        .getTracks()
        .forEach((track: MediaStreamTrack) => track.stop());
      setRemoteStream(null);
    }
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    pendingIceCandidatesRef.current = [];
    setCallState("IDLE");
    setActiveConfig(null);
  }, [localStream, remoteStream]);

  const setupPeerConnection = useCallback(
    async (isCaller: boolean, config: any) => {
      try {
        if (peerConnection.current) return peerConnection.current;
        const pc = new window.RTCPeerConnection(getIceServers());
        peerConnection.current = pc;

        pc.onicecandidate = (event) => {
          const targetConvId = resolveSignalConversationId(config);
          if (event.candidate && targetConvId) {
            safeEmit(CHAT_SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, {
              conversationId: targetConvId,
              candidate: event.candidate,
            });
          }
        };

        pc.ontrack = (event) => {
          console.log("[WebRTC-Web] received track");
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
          safeEmit(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
            conversationId: config.conversationId,
            offer,
          });
        }

        return pc;
      } catch (error) {
        console.error("[WebRTC-Web] Setup failed:", error);
        cleanup();
      }
    },
    [cleanup, resolveSignalConversationId, safeEmit],
  );

  const startCall = async (
    isVideo: boolean,
    convId: string,
    targetId: string,
  ) => {
    if (callState !== "IDLE") return;
    setCallState("CALLING");

    const config = { isVideo, targetUserId: targetId, conversationId: convId };
    setActiveConfig(config);

    try {
      await socketClient.emitWithAck(CHAT_SOCKET_EVENTS.CALL_INIT, {
        conversationId: convId,
        callerId: user?.sub,
        callerName: (user as any)?.fullName || "Người gọi",
        isVideo,
      });
    } catch (error: any) {
      const isGroupConversation = /^(group:|grp#|group#)/i.test(convId || "");
      if (error?.statusCode === 409 && isGroupConversation) {
        console.log(
          "[useWebRTC-web] Group call already active, joining mesh directly...",
        );
        setCallState("CONNECTED");

        try {
          await socketClient.emitWithAck(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
            conversationId: resolveSignalConversationId(config),
            calleeId: user?.sub,
          });
        } catch (acceptErr) {
          console.error(
            "[useWebRTC-web] Failed to join active call",
            acceptErr,
          );
          cleanup();
          return;
        }

        safeEmit(CHAT_SOCKET_EVENTS.CALL_HEARTBEAT, {
          conversationId: resolveSignalConversationId(config),
          userId: user?.sub,
        });

        await setupPeerConnection(true, config);
        return;
      }

      console.error("[useWebRTC-web] CALL_INIT failed", error);
      cleanup();
    }
  };

  const acceptCall = async () => {
    if (callState !== "INCOMING" || !activeConfig) return;
    setCallState("CONNECTED");

    const targetConvId = resolveSignalConversationId(activeConfig);

    safeEmit(CHAT_SOCKET_EVENTS.CALL_ACCEPT, {
      conversationId: targetConvId,
      calleeId: user?.sub,
    });

    const isGroupConversation = /^(group:|grp#|group#)/i.test(
      activeConfig.conversationId || "",
    );
    let isOfferCreator = false;
    if (isGroupConversation) {
      const callerId = activeConfig.callerId;
      if (callerId && user?.sub && user.sub > callerId) {
        isOfferCreator = true;
      }
    }

    await setupPeerConnection(isOfferCreator, activeConfig);
  };

  const rejectCall = () => {
    const targetConvId = resolveSignalConversationId(activeConfig);
    if (targetConvId) {
      safeEmit(CHAT_SOCKET_EVENTS.CALL_REJECT, {
        conversationId: targetConvId,
        calleeId: user?.sub,
      });
    }
    cleanup();
  };

  const endCall = () => {
    const targetConvId = resolveSignalConversationId(activeConfig);
    if (targetConvId) {
      safeEmit(CHAT_SOCKET_EVENTS.CALL_END, {
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
    if (!localStream) {
      return;
    }

    const existingVideoTracks = localStream.getVideoTracks();
    if (existingVideoTracks.length > 0) {
      existingVideoTracks.forEach((track: MediaStreamTrack) => {
        track.enabled = !track.enabled;
      });
      return;
    }

    void (async () => {
      try {
        if (!peerConnection.current || !activeConfig) {
          return;
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: "user" },
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        if (!newVideoTrack) {
          return;
        }

        localStream.addTrack(newVideoTrack);
        peerConnection.current.addTrack(newVideoTrack, localStream);

        const targetConvId = resolveSignalConversationId(activeConfig);
        if (!targetConvId) {
          return;
        }

        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);

        safeEmit(CHAT_SOCKET_EVENTS.WEBRTC_OFFER, {
          conversationId: targetConvId,
          offer: {
            ...offer,
            senderId: user?.sub,
            targetId: activeConfig.targetUserId,
          },
        });
      } catch (error) {
        console.error("[useWebRTC-web] Failed to enable video", error);
      }
    })();
  };

  // Socket Listeners
  useEffect(() => {
    const onCallInit = (data: any) => {
      if (data.callerId !== user?.sub) {
        setCallState("INCOMING");
        setActiveConfig({
          isVideo: data.isVideo,
          callerId: data.callerId,
          callerName: data.callerName,
          conversationId: data.conversationId,
        });
      }
    };

    const onCallAccept = async (data: any) => {
      if (
        callState === "INCOMING" &&
        data.calleeId === user?.sub &&
        activeConfig?.conversationId === data.conversationId
      ) {
        cleanup();
        return;
      }

      const targetMatches =
        activeConfig?.targetUserId === data.calleeId ||
        activeConfig?.targetUserId === `dm:${data.calleeId}`;
      const isMatch =
        activeConfig?.conversationId === data.conversationId || targetMatches;

      if (isMatch && callState === "CALLING") {
        setCallState("CONNECTED");
        const isGroupConversation = /^(group:|grp#|group#)/i.test(
          activeConfig!.conversationId || "",
        );
        let isOfferCreator = true;
        if (isGroupConversation) {
          const calleeId = data.calleeId;
          if (calleeId && user?.sub && user.sub < calleeId) {
            isOfferCreator = false;
          }
        }
        await setupPeerConnection(isOfferCreator, activeConfig);
      }
    };

    const onCallReject = () => cleanup();
    const onCallEnd = () => cleanup();

    const onOffer = async (data: any) => {
      let pc = peerConnection.current;
      if (!pc) {
        const nextPeerConnection = await setupPeerConnection(
          false,
          activeConfig,
        );
        if (!nextPeerConnection) {
          return;
        }
        pc = nextPeerConnection;
      }
      if (!pc) return;
      await pc.setRemoteDescription(
        new window.RTCSessionDescription(data.offer),
      );
      await flushPendingIceCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const targetConvId = resolveSignalConversationId(
        activeConfig,
        data.conversationId,
      );

      safeEmit(CHAT_SOCKET_EVENTS.WEBRTC_ANSWER, {
        conversationId: targetConvId,
        answer,
      });
    };

    const onAnswer = async (data: any) => {
      if (!peerConnection.current) return;
      await peerConnection.current.setRemoteDescription(
        new window.RTCSessionDescription(data.answer),
      );
      await flushPendingIceCandidates();
    };

    const onIceCandidate = async (data: any) => {
      if (!peerConnection.current || !data.candidate) return;

      if (!peerConnection.current.remoteDescription) {
        pendingIceCandidatesRef.current.push(data.candidate);
        return;
      }

      try {
        await peerConnection.current.addIceCandidate(
          new window.RTCIceCandidate(data.candidate),
        );
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
  }, [
    callState,
    activeConfig,
    user?.sub,
    setupPeerConnection,
    cleanup,
    flushPendingIceCandidates,
    resolveSignalConversationId,
    safeEmit,
  ]);

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
