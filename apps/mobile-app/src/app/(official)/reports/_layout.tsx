import { Stack } from 'expo-router';

export default function ReportsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Danh sách sự cố' }} />
      <Stack.Screen name="[id]" options={{ title: 'Chi tiết sự cố' }} />
    </Stack>
  );
}
