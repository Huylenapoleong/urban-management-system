import { View, Text, StyleSheet } from "react-native";
import colors from "@/constants/colors";

type HeaderProps = {
  title: string;
  subtitle?: string;
};

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 14,
  },
});
