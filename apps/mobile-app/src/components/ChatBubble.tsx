import { View, Text, StyleSheet } from "react-native";
import colors from "@/constants/colors";

type ChatBubbleProps = {
  text: string;
  isOwn: boolean;
  time: string;
};

export default function ChatBubble({ text, isOwn, time }: ChatBubbleProps) {
  return (
    <View style={[styles.container, isOwn ? styles.right : styles.left]}>
      <View style={[styles.bubble, isOwn ? styles.bubbleRight : styles.bubbleLeft]}>
        <Text style={[styles.text, isOwn && styles.textWhite]}>{text}</Text>
        <Text style={[styles.timestamp, isOwn && styles.timestampWhite]}>{time}</Text>
      </View>
    </View>
  );
}

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
  bubbleLeft: {
    backgroundColor: "white",
    borderTopLeftRadius: 4,
  },
  bubbleRight: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 4,
  },
  text: {
    color: colors.text,
    fontSize: 14,
    marginBottom: 4,
  },
  textWhite: {
    color: "white",
  },
  timestamp: {
    color: colors.muted,
    fontSize: 11,
    alignSelf: "flex-end",
  },
  timestampWhite: {
    color: "rgba(255,255,255,0.8)",
  },
});
