import { View, Text, Image, StyleSheet } from "react-native";
import colors from "@/constants/colors";

type AvatarProps = {
  uri?: string;
  name?: string;
  size?: number;
};

export default function Avatar({ uri, name, size = 48 }: AvatarProps) {
  const initials =
    name?.
      split(" ")
      .map((word) => word[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "U";

  return (
    <View style={[styles.wrapper, { width: size, height: size, borderRadius: size / 2 }]}> 
      {uri ? (
        <Image source={{ uri }} style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]} />
      ) : (
        <Text style={[styles.initials, { fontSize: size / 2.5 }]}>{initials}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    resizeMode: "cover",
  },
  initials: {
    color: colors.primary,
    fontWeight: "700",
  },
});
