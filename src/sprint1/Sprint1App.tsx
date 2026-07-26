import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Heart, Home, Plus, Search, User } from 'lucide-react-native';
import { AuthProvider, useAuth } from '../auth';
import { Button, Card, LoadingSpinner, TextInput } from '../components';
import { colors, radius, sizes, spacing, typography } from '../constants/theme';
import { QueryClientProvider } from '../lib/queryClient';
import { useSupabaseStatus } from '../hooks/useSupabaseStatus';
import { handleAppError } from '../utils/errorHandler';
import {
  validateForgotPasswordInput,
  validateLoginInput,
  validateRegisterInput,
} from '../validation/auth';
import type { IconComponent } from '../types';

type AuthScreen = 'welcome' | 'login' | 'register' | 'forgot-password' | 'verify-email';
type SprintTab = 'home' | 'search' | 'sell' | 'favorites' | 'profile';

type AuthNavigation = {
  onLogin: () => void;
  onRegister: () => void;
  onForgotPassword: () => void;
  onVerifyEmail?: () => void;
  onWelcome: () => void;
};

const tabs: Array<{ key: SprintTab; label: string; icon: IconComponent; title: string }> = [
  { key: 'home', label: 'Home', icon: Home, title: 'Home' },
  { key: 'search', label: 'Search', icon: Search, title: 'Search' },
  { key: 'sell', label: 'Sell', icon: Plus, title: 'Sell' },
  { key: 'favorites', label: 'Favorites', icon: Heart, title: 'Favorites' },
  { key: 'profile', label: 'Profile', icon: User, title: 'Profile' },
];

export function Sprint1App() {
  return (
    <QueryClientProvider>
      <AuthProvider>
        <Sprint1Experience />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function Sprint1Experience() {
  const auth = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('welcome');
  const [activeTab, setActiveTab] = useState<SprintTab>('home');
  const [needsVerification, setNeedsVerification] = useState(false);

  useEffect(() => {
    if (auth.isGuest) {
      setAuthScreen('welcome');
      setNeedsVerification(false);
    }
  }, [auth.isGuest]);

  if (auth.loading) {
    return (
      <ScreenFrame>
        <LoadingSpinner />
      </ScreenFrame>
    );
  }

  if (needsVerification && auth.user) {
    return (
      <VerifyEmailScreen
        email={auth.user.email}
        onContinue={() => {
          setNeedsVerification(false);
          setActiveTab('home');
        }}
        onBack={() => {
          setNeedsVerification(false);
          void auth.signOut();
          setAuthScreen('welcome');
        }}
      />
    );
  }

  if (auth.isGuest) {
    const navigation: AuthNavigation = {
      onLogin: () => setAuthScreen('login'),
      onRegister: () => setAuthScreen('register'),
      onForgotPassword: () => setAuthScreen('forgot-password'),
      onWelcome: () => setAuthScreen('welcome'),
    };

    if (authScreen === 'login') {
      return (
        <LoginScreen
          {...navigation}
          onSignedIn={() => {
            setActiveTab('home');
          }}
        />
      );
    }

    if (authScreen === 'register') {
      return (
        <RegisterScreen
          {...navigation}
          onRegistered={() => {
            setNeedsVerification(true);
            setAuthScreen('verify-email');
          }}
        />
      );
    }

    if (authScreen === 'forgot-password') {
      return <ForgotPasswordScreen {...navigation} />;
    }

    return <WelcomeScreen {...navigation} />;
  }

  return <TabsExperience activeTab={activeTab} onChangeTab={setActiveTab} />;
}

export function WelcomeScreen({ onLogin, onRegister }: Pick<AuthNavigation, 'onLogin' | 'onRegister'>) {
  const supabaseStatus = useSupabaseStatus();

  return (
    <ScreenFrame>
      <View style={styles.hero}>
        <Text style={styles.brand}>ReTail</Text>
        <Text style={styles.title}>Pet supplies, ready for a second life.</Text>
        <Text style={styles.body}>
          Create an account to buy, sell, and donate pet supplies with a safer local marketplace.
        </Text>
      </View>

      <Card>
        <View style={styles.stack}>
          <BadgeText label="Sprint 1 foundation" />
          <Text style={styles.cardTitle}>Start with secure access</Text>
          <Text style={styles.body}>
            Authentication, navigation, theme tokens, reusable components, and the Supabase connection are now the app foundation.
          </Text>
          <Button title="Create Account" onPress={onRegister} fullWidth />
          <Button title="Log In" variant="outline" onPress={onLogin} fullWidth />
          <Text style={styles.helper}>Supabase config: {supabaseStatus.label}</Text>
        </View>
      </Card>
    </ScreenFrame>
  );
}

export function LoginScreen({
  onWelcome,
  onForgotPassword,
  onRegister,
  onSignedIn,
}: AuthNavigation & { onSignedIn?: () => void }) {
  const auth = useAuth();
  const [email, setEmail] = useState('rachel@example.com');
  const [password, setPassword] = useState('Demo1234!');
  const [errors, setErrors] = useState<Partial<Record<'email' | 'password' | 'form', string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const validation = validateLoginInput(email, password);

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      await auth.signIn({ email, password });
      onSignedIn?.();
    } catch (error) {
      setErrors({ form: handleAppError(error).userMessage });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFormFrame title="Welcome back" description="Log in to continue to ReTail." onBack={onWelcome}>
      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        textContentType="emailAddress"
        error={errors.email}
      />
      <TextInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Enter your password"
        secureTextEntry
        textContentType="password"
        error={errors.password}
      />
      {errors.form ? <Text style={styles.errorText}>{errors.form}</Text> : null}
      <Button title="Log In" onPress={submit} loading={submitting} fullWidth />
      <Button title="Forgot Password" variant="ghost" onPress={onForgotPassword} fullWidth />
      <Button title="Create Account" variant="outline" onPress={onRegister} fullWidth />
    </AuthFormFrame>
  );
}

export function RegisterScreen({
  onWelcome,
  onLogin,
  onRegistered,
}: Pick<AuthNavigation, 'onWelcome' | 'onLogin'> & { onRegistered?: () => void }) {
  const auth = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<'displayName' | 'username' | 'email' | 'password' | 'form', string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const validation = validateRegisterInput(email, password, displayName, username);

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    setErrors({});

    try {
      await auth.signUp({
        email,
        password,
        displayName,
        username,
        accountType: 'regular',
      });
      onRegistered?.();
    } catch (error) {
      setErrors({ form: handleAppError(error).userMessage });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFormFrame title="Create account" description="Start with a regular ReTail account." onBack={onWelcome}>
      <TextInput
        label="Display Name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Rachel C."
        textContentType="name"
        error={errors.displayName}
      />
      <TextInput
        label="Username"
        value={username}
        onChangeText={setUsername}
        placeholder="retailrachel"
        autoCapitalize="none"
        error={errors.username}
      />
      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        textContentType="emailAddress"
        error={errors.email}
      />
      <TextInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        helperText="Use uppercase, lowercase, a number, and a special character."
        secureTextEntry
        textContentType="newPassword"
        error={errors.password}
      />
      {errors.form ? <Text style={styles.errorText}>{errors.form}</Text> : null}
      <Button title="Create Account" onPress={submit} loading={submitting} fullWidth />
      <Button title="Already have an account?" variant="ghost" onPress={onLogin} fullWidth />
    </AuthFormFrame>
  );
}

export function ForgotPasswordScreen({ onWelcome, onLogin }: Pick<AuthNavigation, 'onWelcome' | 'onLogin'>) {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const validation = validateForgotPasswordInput(email);

    if (!validation.isValid) {
      setError(validation.errors.email ?? '');
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      await auth.resetPassword(email);
      setMessage('If an account exists for that email, a reset link has been sent.');
    } catch (nextError) {
      setError(handleAppError(nextError).userMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFormFrame title="Reset password" description="We will send password reset instructions if the email exists." onBack={onWelcome}>
      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        textContentType="emailAddress"
        error={error}
      />
      {message ? <Text style={styles.successText}>{message}</Text> : null}
      <Button title="Send Reset Link" onPress={submit} loading={submitting} fullWidth />
      <Button title="Back to Log In" variant="ghost" onPress={onLogin} fullWidth />
    </AuthFormFrame>
  );
}

export function VerifyEmailScreen({
  email,
  onContinue,
  onBack,
}: {
  email?: string;
  onContinue?: () => void;
  onBack?: () => void;
}) {
  return (
    <ScreenFrame>
      <Card>
        <View style={styles.stack}>
          <BadgeText label="Verify email" />
          <Text style={styles.cardTitle}>Check your inbox</Text>
          <Text style={styles.body}>
            We sent a verification email{email ? ` to ${email}` : ''}. Verification will unlock higher-trust ReTail actions.
          </Text>
          <Button title="Continue to Home" onPress={onContinue ?? (() => undefined)} fullWidth />
          {onBack ? <Button title="Back to Welcome" variant="ghost" onPress={onBack} fullWidth /> : null}
        </View>
      </Card>
    </ScreenFrame>
  );
}

function TabsExperience({ activeTab, onChangeTab }: { activeTab: SprintTab; onChangeTab: (tab: SprintTab) => void }) {
  const auth = useAuth();
  const active = useMemo(() => tabs.find((tab) => tab.key === activeTab) ?? tabs[0], [activeTab]);

  const signOut = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      Alert.alert('We could not log you out', handleAppError(error).userMessage);
    }
  };

  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.tabContent}>
        <PlaceholderTabScreen
          title={active.title}
          description={
            active.key === 'profile'
              ? 'Manage account access for Sprint 1.'
              : 'This tab is intentionally a placeholder for Sprint 1.'
          }
          action={active.key === 'profile' ? <Button title="Log Out" variant="outline" onPress={signOut} /> : undefined}
        />
      </View>
      <View style={styles.tabBar}>
        {tabs.map((tab) => {
          const selected = tab.key === activeTab;
          const Icon = tab.icon;

          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              onPress={() => onChangeTab(tab.key)}
              style={styles.tabButton}
            >
              <Icon size={22} color={selected ? colors.primary : colors.textSecondary} />
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export function PlaceholderTabScreen({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <ScreenFrame>
      <Card>
        <View style={styles.stack}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.body}>{description ?? 'Coming later in the ReTail build plan.'}</Text>
          {action}
        </View>
      </Card>
    </ScreenFrame>
  );
}

function AuthFormFrame({
  title,
  description,
  onBack,
  children,
}: {
  title: string;
  description: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <ScreenFrame>
      <View style={styles.authHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{description}</Text>
      </View>
      <Card>
        <View style={styles.stack}>{children}</View>
      </Card>
    </ScreenFrame>
  );
}

function ScreenFrame({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.app}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

function BadgeText({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.secondary,
  },
  hero: {
    gap: spacing.md,
  },
  brand: {
    color: colors.primary,
    ...typography.display,
  },
  title: {
    color: colors.textPrimary,
    ...typography.title,
  },
  cardTitle: {
    color: colors.textPrimary,
    ...typography.sectionTitle,
  },
  body: {
    color: colors.textSecondary,
    ...typography.body,
    lineHeight: 24,
  },
  helper: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  stack: {
    gap: spacing.md,
  },
  authHeader: {
    gap: spacing.sm,
  },
  backButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  backText: {
    color: colors.primary,
    ...typography.button,
  },
  errorText: {
    color: colors.error,
    ...typography.small,
  },
  successText: {
    color: colors.success,
    ...typography.small,
  },
  badge: {
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  badgeText: {
    color: colors.primary,
    ...typography.caption,
  },
  tabContent: {
    flex: 1,
  },
  tabBar: {
    minHeight: sizes.tabBarHeight,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabButton: {
    flex: 1,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  tabLabel: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  tabLabelActive: {
    color: colors.primary,
  },
});
