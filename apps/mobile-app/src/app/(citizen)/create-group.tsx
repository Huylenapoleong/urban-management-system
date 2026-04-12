import { useEffect } from "react";
import { useRouter } from "expo-router";

export default function CreateGroupPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/group");
  }, [router]);

  return null;
}
