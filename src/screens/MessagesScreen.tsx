import { MessageCircle, Send } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { conversations } from '../data/mockData';
import { colors, radius, sizes, spacing, typography } from '../constants/theme';
import { ConversationCard, LockedScreen } from '../components';
import { useThemeColors } from '../lib/themePreference';
import { initials } from '../utils/format';

type MessagesScreenProps = {
  isSignedIn: boolean;
  messageText: string;
  onMessageTextChange: (value: string) => void;
  onSend: () => void;
  onSignIn: () => void;
};

export function MessagesScreen({
  isSignedIn,
  messageText,
  onMessageTextChange,
  onSend,
  onSignIn,
}: MessagesScreenProps) {
  const themeColors = useThemeColors();

  if (!isSignedIn) {
    return (
      <LockedScreen
        icon={MessageCircle}
        title="Message sellers"
        body="Sign in to ask questions, coordinate pickup, meetup, shipping, and receive read receipts."
        action="Sign in to message"
        onPress={onSignIn}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
        <Text style={[styles.title, { color: themeColors.textPrimary }]}>Messages</Text>
        <Text style={[styles.subhead, { color: themeColors.textSecondary }]}>Private conversations for buying, selling, and donating.</Text>

        {conversations.map((conversation) => (
          <ConversationCard
            key={conversation.id}
            name={conversation.name}
            listing={conversation.listing}
            preview={conversation.preview}
            time={conversation.time}
            unread={conversation.unread}
            initials={initials(conversation.name)}
          />
        ))}
      </ScrollView>

      <View style={[styles.messageComposer, { backgroundColor: themeColors.secondary, borderColor: themeColors.border }]}>
        <TextInput
          value={messageText}
          onChangeText={onMessageTextChange}
          placeholder="Type a message..."
          placeholderTextColor={themeColors.textSecondary}
          style={[styles.composerInput, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.textPrimary }]}
        />
        <Pressable style={[styles.sendButton, { backgroundColor: themeColors.primary }]} onPress={onSend} accessibilityLabel="Send message">
          <Send size={19} color={themeColors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  screenContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: sizes.tabBarHeight + sizes.tabBarBottomOffset + spacing.xxl,
    gap: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    ...typography.display,
  },
  subhead: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 22,
  },
  messageComposer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: sizes.tabBarHeight + sizes.tabBarBottomOffset + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.secondary,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  composerInput: {
    flex: 1,
    minHeight: sizes.touchTarget,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    ...typography.body,
  },
  sendButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
});
