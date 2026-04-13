import {
  StyleSheet,
  TextInput,
  View,
  Text,
  TextStyle,
  ViewStyle,
  TextInputProps,
} from "react-native";
import colors from "@/constants/colors";

type InputProps = {
  label?: string;
  value: string;
  onChange: (text: string) => void;
  style?: ViewStyle;
  inputStyle?: TextStyle;
} & Omit<TextInputProps, "onChange">;

export default function Input({
  label,
  value,
  onChange,
  style,
  inputStyle,
  ...rest
}: InputProps) {
  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <TextInput
        style={[styles.input, inputStyle]}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={colors.muted}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: "100%",
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: "500",
  },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
});