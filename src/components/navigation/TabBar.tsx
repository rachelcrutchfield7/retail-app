import { Heart, Home, MessageCircle, Plus, UserRound } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, sizes, spacing, typography } from '../../constants/theme';
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
  const tabs: TabItem[] = [
    { key: 'browse', label: 'Browse', icon: Home },
    { key: 'favorites', label: 'Saved', icon: Heart, badge: favoritesCount },
    { key: 'create', label: 'List', icon: Plus },
    { key: 'messages', label: 'Messages', icon: MessageCircle },
    { key: 'profile', label: 'Profile', icon: UserRound },
  ];

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [
              styles.tabItem,
              active && styles.tabItemActive,
              pressed && styles.tabItemPressed,
            ]}
            onPress={() => onChange(tab.key)}
            accessibilityLabel={tab.label}
          >
            <View style={[styles.tabIconWrap, active && styles.tabIconWrapActive]}>
              <Icon size={20} color={active ? colors.white : colors.textSecondary} />
              {tab.badge ? <Text style={styles.tabBadge}>{tab.badge}</Text> : null}
            </View>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
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
  tabIconWrapActive: {
    backgroundColor: colors.primary,
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
  tabLabelActive: {
    color: colors.textPrimary,
  },
});
