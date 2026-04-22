import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import colors from "@/constants/colors";

type AvatarProps = {
  uri?: string;
  name?: string;
  size?: number;
};

export default function Avatar({ uri, name, size = 48 }: AvatarProps) {
  const initials =
    name?.split(" ")
      .map((word) => word[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "U";

  return (
    <View style={[styles.wrapper, { width: size, height: size, borderRadius: size / 2 }]}> 
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          cachePolicy="memory-disk"
          contentFit="cover"
          placeholder={{ blurhash: "LEHV6nWB2yk8pyo0adR*.7kCMdnj" }}
          transition={140}
        />
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
    backgroundColor: colors.border,
  },
  initials: {
    color: colors.primary,
    fontWeight: "700",
  },
});
