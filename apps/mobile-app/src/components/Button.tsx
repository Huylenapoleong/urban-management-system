import { Pressable, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { LinearGradient } from "@/components/shared/SafeLinearGradient";
import colors from "@/constants/colors";

type ButtonProps = {
  children: string;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

export default function Button({
  children,
  onPress,
  style,
  textStyle,
  disabled,
  variant = "primary",
}: ButtonProps) {
  const isSecondary = variant === "secondary";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        isSecondary ? styles.secondaryButton : null,
        style,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {!isSecondary && !disabled ? (
        <LinearGradient
          colors={colors.gradient.primary}
          start={colors.gradient.start}
          end={colors.gradient.end}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
      <Text style={[styles.text, isSecondary ? styles.secondaryText : null, textStyle]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    overflow: "hidden",
    backgroundColor: colors.secondary,
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
  secondaryButton: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.primary,
    shadowOpacity: 0.08,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    backgroundColor: "#cbd5e1",
  },
  text: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryText: {
    color: colors.primary,
  },
});
