import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import colors from "@/constants/colors";

type ButtonProps = {
  children: string;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
};

export default function Button({ children, onPress, style, textStyle, disabled }: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        style,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.text, textStyle]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 3,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    backgroundColor: "#a5c5f2",
  },
  text: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },
});
