import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../constants/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Top-level error boundary that catches rendering errors anywhere in the
 * component tree and displays a themed fallback UI with a "Try Again" button
 * instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console for diagnostics; in production these can be forwarded
    // to a remote error reporter.
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || 'An unexpected error occurred';
      const errorStack = this.state.error?.stack || '';

      return (
        <View style={styles.container}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="warning" size={48} color={theme.primary} />
            </View>

            <Text style={styles.title}>Something Went Wrong</Text>
            <Text style={styles.subtitle}>
              The app encountered an unexpected error. You can try again or restart the app.
            </Text>

            <View style={styles.errorBox}>
              <Text style={styles.errorLabel}>Error details</Text>
              <Text style={styles.errorMessage} numberOfLines={4}>
                {errorMessage}
              </Text>
              {errorStack ? (
                <Text style={styles.errorStack} numberOfLines={6}>
                  {errorStack}
                </Text>
              ) : null}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.tryAgainButton,
                pressed && styles.tryAgainButtonPressed,
              ]}
              onPress={this.handleReset}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.tryAgainText}>Try Again</Text>
            </Pressable>

            <Text style={styles.helpText}>
              If the problem persists, please contact support.
            </Text>
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(220, 38, 38, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 15,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 360,
  },
  errorBox: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: theme.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    marginBottom: 24,
  },
  errorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 13,
    color: theme.primaryLight,
    fontFamily: 'monospace',
    lineHeight: 18,
    marginBottom: 8,
  },
  errorStack: {
    fontSize: 11,
    color: theme.textMuted,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  tryAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    minWidth: 200,
    marginBottom: 16,
  },
  tryAgainButtonPressed: {
    backgroundColor: theme.primaryDark,
    opacity: 0.9,
  },
  tryAgainText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  helpText: {
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
  },
});

export default ErrorBoundary;
