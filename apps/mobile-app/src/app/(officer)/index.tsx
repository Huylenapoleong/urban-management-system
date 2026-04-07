import { View, Text, StyleSheet } from "react-native";
import colors from "@/constants/colors";

export default function OfficerPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Officer UI coming soon</Text>
      <Text style={styles.sub}>Chỉ dành cho người xem placeholder, không code thêm.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: 20 },
  title: { fontSize: 22, fontWeight: "700", color: colors.primary, marginBottom: 8, textAlign: "center" },
  sub: { color: colors.textSecondary, textAlign: "center" },
});
