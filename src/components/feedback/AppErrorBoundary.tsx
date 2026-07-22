import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { config } from '../../constants/config';
import { colors, radius, spacing, typography } from '../../constants/theme';
import { createSafeDiagnostic, shouldShowBetaDiagnostic } from '../../utils/betaDiagnostics';
import { logger } from '../../lib/logger';
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
    const diagnostic = createSafeDiagnostic(error, info.componentStack ?? undefined);

    try {
      captureError(error, { componentStack: info.componentStack ?? undefined, diagnosticId: diagnostic.id });
    } catch {
      // Error reporting should never make the recovery screen fail.
    }

    logger.diagnosticError('Global error boundary captured an application error.', {
      diagnosticId: diagnostic.id,
      errorName: diagnostic.name,
      errorMessage: diagnostic.message,
      componentStack: info.componentStack ?? undefined,
    });
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

    const diagnostic = createSafeDiagnostic(this.state.error);
    const showBetaDiagnostic = shouldShowBetaDiagnostic(config.appEnv);

    return (
      <View style={styles.screen} accessibilityRole="alert">
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>ReTail ran into a problem. Your account and listings are still safe.</Text>
          {showBetaDiagnostic ? (
            <View style={styles.diagnosticBox}>
              <Text style={styles.diagnosticTitle} selectable>
                Beta diagnostic
              </Text>
              <Text style={styles.diagnosticText} selectable>
                ID: {diagnostic.id}
              </Text>
              <Text style={styles.diagnosticText} selectable>
                Name: {diagnostic.name}
              </Text>
              <Text style={styles.diagnosticText} selectable>
                Message: {diagnostic.message}
              </Text>
            </View>
          ) : null}
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
  diagnosticBox: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.secondary,
  },
  diagnosticTitle: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: '700',
  },
  diagnosticText: {
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 18,
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
