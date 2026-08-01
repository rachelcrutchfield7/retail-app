import { Heart, Home, MessageCircle, Plus, UserRound } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
import { useThemeColors } from '../../lib/themePreference';
import type { IconComponent, TabKey } from '../../types.ts';

type TabBarProps = {
  activeTab: TabKey;
  favoritesCount: number;
  onChange: (tab: TabKey) => void;
};

type TabItem = {
  key: TabKey;
  label: string;
  icon: IconComponent;
  badge?: number;
};

export function TabBar({ activeTab, onChange, favoritesCount }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const tabs: TabItem[] = [
    { key: 'browse', label: 'Browse', icon: Home },
    { key: 'favorites', label: 'Saved', icon: Heart, badge: favoritesCount },
    { key: 'create', label: 'List', icon: Plus },
    { key: 'messages', label: 'Messages', icon: MessageCircle },
    { key: 'profile', label: 'Profile', icon: UserRound },
  ];

  return (
    <View
      style={[
        styles.tabBar,
        {
          paddingBottom: Math.max(insets.bottom, spacing.md),
          backgroundColor: themeColors.navBase,
          borderColor: themeColors.navBorder,
          shadowColor: themeColors.textPrimary,
        },
      ]}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [
              styles.tabItem,
              active && [styles.tabItemActive, { backgroundColor: themeColors.surface, shadowColor: themeColors.textPrimary }],
              pressed && styles.tabItemPressed,
            ]}
            onPress={() => onChange(tab.key)}
            accessibilityLabel={tab.label}
          >
            <View style={[styles.tabIconWrap, active && { backgroundColor: themeColors.primary }]}>
              <Icon size={20} color={active ? themeColors.white : themeColors.navInactive} />
              {tab.badge ? <Text style={[styles.tabBadge, { backgroundColor: themeColors.error, color: themeColors.white }]}>{tab.badge}</Text> : null}
            </View>
            <Text style={[styles.tabLabel, { color: active ? themeColors.textPrimary : themeColors.navInactive }]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: sizes.tabBarHeight,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 2,
    paddingBottom: spacing.md,
    backgroundColor: colors.primarySoft,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: colors.primary,
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    minWidth: 58,
    alignItems: 'center',
    marginHorizontal: 2,
    marginVertical: 5,
    gap: spacing.xs,
  },
  tabItemPressed: {
    opacity: 0.82,
  },
  tabItemActive: {
    backgroundColor: colors.surface,
    borderRadius: radius.medium,
    shadowColor: colors.textPrimary,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tabIconWrap: {
    width: 38,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
  },
  tabBadge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 18,
    height: 18,
    overflow: 'hidden',
    borderRadius: radius.medium,
    backgroundColor: colors.error,
    color: colors.white,
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
  tabLabel: {
    color: colors.textSecondary,
    ...typography.caption,
    fontWeight: '600',
  },
});
