import { useState } from 'react';
import { HeartHandshake, MessageCircle, PackageSearch, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { IconComponent } from '../../types';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { Button } from '../ui/Button';

const tutorialPages: Array<{ title: string; body: string; icon: IconComponent }> = [
  {
    title: 'Affordable pet supplies nearby',
    body: 'Find secondhand crates, beds, toys, tanks, carriers, and other pet supplies from people in your area.',
    icon: PackageSearch,
  },
  {
    title: 'Sell, give away, or help a rescue',
    body: 'Sell items you no longer need, give them away locally, or offer them specifically to a verified animal rescue.',
    icon: HeartHandshake,
  },
  {
    title: 'Support local rescues',
    body: 'Visit Rescue Hub to see nearby organizations, urgent supply needs, wishlists, and available rescue donations.',
    icon: ShieldCheck,
  },
  {
    title: 'Connect safely',
    body: 'Use ReTail messages to ask questions and arrange pickup, meetup, shipping, or rescue donation details.',
    icon: MessageCircle,
  },
];

export function GuestTutorial({ onComplete }: { onComplete: () => void | Promise<void> }) {
  const [pageIndex, setPageIndex] = useState(0);
  const page = tutorialPages[pageIndex];
  const Icon = page.icon;
  const finalPage = pageIndex === tutorialPages.length - 1;

  const finish = () => {
    void Promise.resolve(onComplete());
  };

  return (
    <View style={styles.screen}>
      <Pressable accessibilityRole="button" accessibilityLabel="Skip tutorial" onPress={finish} style={styles.skipButton}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>

      <View style={styles.card}>
        <View style={styles.iconFrame}>
          <Icon size={34} color={colors.primary} />
        </View>
        <Text style={styles.title}>{page.title}</Text>
        <Text style={styles.body}>{page.body}</Text>
        <View style={styles.dots} accessibilityLabel={`Tutorial page ${pageIndex + 1} of ${tutorialPages.length}`}>
          {tutorialPages.map((item, index) => (
            <View key={item.title} style={[styles.dot, index === pageIndex && styles.dotActive]} />
          ))}
        </View>
        <Button
          title={finalPage ? 'Get started' : 'Next'}
          onPress={finalPage ? finish : () => setPageIndex((current) => Math.min(current + 1, tutorialPages.length - 1))}
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  skipButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    zIndex: 2,
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  skipText: {
    color: colors.primary,
    ...typography.button,
  },
  card: {
    gap: spacing.lg,
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconFrame: {
    width: sizes.iconFrame,
    height: sizes.iconFrame,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.large,
    backgroundColor: colors.primarySoft,
  },
  title: {
    color: colors.textPrimary,
    ...typography.title,
    textAlign: 'center',
    lineHeight: 30,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: 'center',
    lineHeight: 23,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.primary,
  },
});
