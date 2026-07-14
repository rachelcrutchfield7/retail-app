import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { captureError } from '../../lib/sentry';

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, { componentStack: info.componentStack ?? undefined });
  }

  private reset = () => {
    this.setState({ error: null });
  };

  private returnHome = () => {
    this.reset();

    if (typeof globalThis !== 'undefined' && 'location' in globalThis) {
      globalThis.location.hash = '';
    }
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={styles.screen} accessibilityRole="alert">
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>ReTail ran into a problem. Your account and listings are still safe.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={this.reset} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Return home" onPress={this.returnHome} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Return Home</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.secondary,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.large,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.textPrimary,
    ...typography.title,
  },
  body: {
    color: colors.textSecondary,
    lineHeight: 23,
    ...typography.body,
  },
  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.white,
    ...typography.button,
  },
  secondaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: {
    color: colors.primary,
    ...typography.button,
  },
});
