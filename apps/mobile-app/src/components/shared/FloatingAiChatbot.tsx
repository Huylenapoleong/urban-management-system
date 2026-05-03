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
import { LinearGradient } from '@/components/shared/SafeLinearGradient';
import { Button, Card, Text, TextInput } from 'react-native-paper';
import { usePathname, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { askChatbot } from '@/services/api/chatbot.api';
import { useAuth } from '@/providers/AuthProvider';
import colors from '@/constants/colors';
import { subscribeAiChatbot } from '@/lib/ai-chatbot-controller';

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
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = React.useState(false);
  const [question, setQuestion] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [messages, setMessages] = React.useState<BotMessage[]>([
    createMessage(
      'assistant',
      'Xin chao, toi la tro ly AI. Ban co the hoi quy dinh do thi hoac van de dang gap.',
    ),
  ]);

  const chatSegmentIndex = segments.findIndex((segment) => segment === 'chat');
  const isChatRoute = chatSegmentIndex >= 0;
  const isChatDetail = isChatRoute && segments.length > chatSegmentIndex + 1;
  const isChatList = isChatRoute && !isChatDetail;
  const hidden = shouldHideOnPath(pathname) || isChatDetail;
  const fabBottom = isChatList ? Math.max(insets.bottom + 74, 82) : Math.max(insets.bottom + 88, 96);
  const chatWindowBottom = fabBottom + 72;
  const chatWindowPosition = isChatList
    ? { top: insets.top + 112 }
    : { bottom: chatWindowBottom };
  const fabPosition = { bottom: fabBottom };

  React.useEffect(() => {
    return subscribeAiChatbot((action) => {
      if (action === 'open') {
        setIsOpen(true);
        return;
      }

      if (action === 'close') {
        setIsOpen(false);
        return;
      }

      setIsOpen((prev) => !prev);
    });
  }, []);

  React.useEffect(() => {
    if (hidden) {
      setIsOpen(false);
    }
  }, [hidden]);

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
          style={[styles.chatWindowWrap, chatWindowPosition]}
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
                    {message.role === 'user' ? (
                      <LinearGradient
                        colors={colors.gradient.primary}
                        start={colors.gradient.start}
                        end={colors.gradient.end}
                        style={StyleSheet.absoluteFillObject}
                      />
                    ) : null}
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
        style={[styles.fab, isChatList ? styles.fabChatList : null, fabPosition]}
      >
        {!isChatList ? (
          <LinearGradient
            colors={colors.gradient.primary}
            start={colors.gradient.start}
            end={colors.gradient.end}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
        <Ionicons
          name={isOpen ? 'close' : 'sparkles'}
          size={isChatList ? 24 : 22}
          color={isChatList ? colors.secondary : '#ffffff'}
        />
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
    right: 18,
    width: 340,
    maxWidth: '92%',
    maxHeight: '72%',
  },
  chatCard: {
    backgroundColor: colors.card,
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
    overflow: 'hidden',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.secondary,
    maxWidth: '90%',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    maxWidth: '92%',
  },
  userBubbleText: {
    color: '#ffffff',
    lineHeight: 19,
  },
  assistantBubbleText: {
    color: colors.text,
    lineHeight: 19,
  },
  input: {
    backgroundColor: colors.card,
  },
  fab: {
    position: 'absolute',
    right: 18,
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 12,
  },
  fabChatList: {
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.card,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
  },
});
