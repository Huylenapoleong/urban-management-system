import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { usePathname } from 'expo-router';
import { askChatbot } from '@/services/api/chatbot.api';
import { useAuth } from '@/providers/AuthProvider';

type BotMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

const HIDDEN_PATH_PREFIXES = ['/login', '/register', '/forgot-password'];

function shouldHideOnPath(pathname: string | null): boolean {
  if (!pathname) {
    return false;
  }

  return HIDDEN_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function createMessage(role: BotMessage['role'], text: string): BotMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
  };
}

export default function FloatingAiChatbot() {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);
  const [question, setQuestion] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [messages, setMessages] = React.useState<BotMessage[]>([
    createMessage(
      'assistant',
      'Xin chao, toi la tro ly AI. Ban co the hoi quy dinh do thi hoac van de dang gap.',
    ),
  ]);

  const hidden = shouldHideOnPath(pathname);

  if (isLoading || !user || hidden) {
    return null;
  }

  const sendQuestion = async () => {
    const nextQuestion = question.trim();
    if (!nextQuestion || isSending) {
      return;
    }

    setQuestion('');
    setIsSending(true);
    setMessages((prev) => [...prev, createMessage('user', nextQuestion)]);

    try {
      const response = await askChatbot(nextQuestion);
      const answerText = response.answer?.trim() || 'AI chua co cau tra loi phu hop.';
      const sourceText =
        Array.isArray(response.sources) && response.sources.length > 0
          ? `\n\nNguon: ${response.sources
              .map((item) => [item.title, item.source].filter(Boolean).join(' - '))
              .join(' | ')}`
          : '';

      setMessages((prev) => [
        ...prev,
        createMessage('assistant', `${answerText}${sourceText}`),
      ]);
    } catch (error) {
      const message = (error as Error)?.message || 'Khong the ket noi AI luc nay.';
      const normalized = /invalid api key/i.test(message)
        ? 'AI chua duoc cau hinh key hop le tren server (GROQ_API_KEY).'
        : message;

      setMessages((prev) => [...prev, createMessage('assistant', normalized)]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View pointerEvents="box-none" style={styles.overlayRoot}>
      {isOpen ? (
        <KeyboardAvoidingView
          pointerEvents="box-none"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.chatWindowWrap}
        >
          <Card style={styles.chatCard}>
            <Card.Title
              title="Tro ly AI"
              subtitle="Hoi nhanh ngay tren man hinh"
              right={() => (
                <Button compact onPress={() => setIsOpen(false)}>
                  Dong
                </Button>
              )}
            />
            <Card.Content style={styles.chatContent}>
              <ScrollView style={styles.messagesWrap} contentContainerStyle={styles.messagesInner}>
                {messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.messageBubble,
                      message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                    ]}
                  >
                    <Text
                      style={
                        message.role === 'user' ? styles.userBubbleText : styles.assistantBubbleText
                      }
                    >
                      {message.text}
                    </Text>
                  </View>
                ))}
              </ScrollView>
              <TextInput
                mode="outlined"
                value={question}
                onChangeText={setQuestion}
                placeholder="Nhap cau hoi..."
                multiline
                numberOfLines={2}
                style={styles.input}
              />
              <Button mode="contained" onPress={sendQuestion} disabled={isSending}>
                Gui
              </Button>
            </Card.Content>
          </Card>
        </KeyboardAvoidingView>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => setIsOpen((prev) => !prev)}
        style={styles.fab}
      >
        <Ionicons name={isOpen ? 'close' : 'sparkles'} size={22} color="#ffffff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
    zIndex: 1200,
    elevation: 1200,
  },
  chatWindowWrap: {
    position: 'absolute',
    right: 16,
    bottom: 92,
    width: 340,
    maxWidth: '92%',
    maxHeight: '72%',
  },
  chatCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
  },
  chatContent: {
    gap: 10,
    paddingBottom: 12,
  },
  messagesWrap: {
    maxHeight: 320,
  },
  messagesInner: {
    gap: 8,
    paddingBottom: 10,
  },
  messageBubble: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1d4ed8',
    maxWidth: '90%',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    maxWidth: '92%',
  },
  userBubbleText: {
    color: '#ffffff',
    lineHeight: 19,
  },
  assistantBubbleText: {
    color: '#1f2937',
    lineHeight: 19,
  },
  input: {
    backgroundColor: '#ffffff',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 12,
  },
});
