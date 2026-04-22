import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import colors from "@/constants/colors";
import { convertToS3Url } from "@/constants/s3";

type ChatBubbleProps = {
  text: string;
  isOwn: boolean;
  time: string;
  attachmentUrl?: string;
  messageType?: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOC" | "EMOJI" | "SYSTEM";
};

function ChatBubble({ 
  text, 
  isOwn, 
  time, 
  attachmentUrl,
  messageType = "TEXT" 
}: ChatBubbleProps) {
  const correctedAttachmentUrl = attachmentUrl ? convertToS3Url(attachmentUrl) : null;
  const isImageMessage = messageType === "IMAGE";

  return (
    <View style={[styles.container, isOwn ? styles.right : styles.left]}>
      <View style={[
        styles.bubble, 
        isOwn ? styles.bubbleRight : styles.bubbleLeft,
        isImageMessage && styles.bubbleFull
      ]}>
        {correctedAttachmentUrl && isImageMessage ? (
          <>
            <Image
              source={{ uri: correctedAttachmentUrl }}
              style={styles.imageAttachment}
              cachePolicy="memory-disk"
              contentFit="cover"
              placeholder={{ blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" }}
              transition={160}
            />
            {text && <Text style={[styles.text, isOwn && styles.textWhite]}>{text}</Text>}
          </>
        ) : (
          <>
            {text && (
              <Text style={[styles.text, isOwn && styles.textWhite]}>
                {text}
              </Text>
            )}
            {correctedAttachmentUrl && !isImageMessage && (
              <Pressable style={styles.attachmentLink}>
                <Ionicons name="document-attach" size={14} color={isOwn ? "white" : colors.text} />
                <Text style={[styles.attachmentText, isOwn && styles.attachmentTextOwn]}>
                  Tep dinh kem
                </Text>
              </Pressable>
            )}
          </>
        )}
        <Text style={[styles.timestamp, isOwn && styles.timestampWhite]}>{time}</Text>
      </View>
    </View>
  );
}

export default React.memo(ChatBubble);

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    paddingHorizontal: 10,
    flexDirection: "row",
  },
  left: {
    justifyContent: "flex-start",
  },
  right: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "75%",
    borderRadius: 14,
    padding: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleFull: {
    maxWidth: "95%",
    padding: 0,
    overflow: "hidden",
  },
  bubbleLeft: {
    backgroundColor: "white",
    borderTopLeftRadius: 4,
  },
  bubbleRight: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 4,
  },
  imageAttachment: {
    width: "100%",
    height: 280,
    backgroundColor: "#e2e8f0",
  },
  text: {
    color: colors.text,
    fontSize: 14,
    marginBottom: 4,
    marginTop: 8,
    marginHorizontal: 8,
  },
  textWhite: {
    color: "white",
  },
  attachmentLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 8,
    marginHorizontal: 8,
  },
  attachmentText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  attachmentTextOwn: {
    color: "white",
  },
  timestamp: {
    color: colors.muted,
    fontSize: 11,
    alignSelf: "flex-end",
    marginTop: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  timestampWhite: {
    color: "rgba(255,255,255,0.8)",
  },
});
