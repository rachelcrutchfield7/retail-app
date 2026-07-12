import { Tabs } from 'expo-router';
import { Heart, Home, Plus, Search, User } from 'lucide-react-native';
import { colors } from '../../src/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <Home color={color} /> }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ color }) => <Search color={color} /> }} />
      <Tabs.Screen name="sell" options={{ title: 'Sell', tabBarIcon: ({ color }) => <Plus color={color} /> }} />
      <Tabs.Screen name="favorites" options={{ title: 'Favorites', tabBarIcon: ({ color }) => <Heart color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <User color={color} /> }} />
    </Tabs>
  );
}
