import * as SplashScreen from 'expo-splash-screen';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

/**
 * Renders the error instead of dying silently.
 *
 * Written after a release-only crash cost an hour to diagnose. The app held the
 * splash screen until fonts and the session resolved, so a throw in the first
 * screen's render looked from the outside like "crashes instantly on launch,
 * no UI" — indistinguishable from a native or module-load failure, and
 * pointing at entirely the wrong layer. The actual cause was one missing
 * `'worklet'` directive.
 *
 * Hiding the splash in `componentDidCatch` is the load-bearing part: without
 * it, the splash stays up and covers this message, reproducing the exact
 * symptom that made the original bug so hard to see.
 *
 * This catches RENDER errors only. A module-scope throw happens before React
 * mounts and will still present as a bare crash.
 */
type Props = { children: ReactNode };
type State = { error: Error | null };

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Get the splash out of the way so the message below is actually visible.
    SplashScreen.hideAsync().catch(() => {});
    console.error('[root] render crash', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: '#1C1814' }}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 80 }}>
          <Text
            style={{
              color: '#E5B19C',
              fontSize: 11,
              letterSpacing: 2.2,
              marginBottom: 16,
            }}
          >
            SOMETHING BROKE ON RENDER
          </Text>
          <Text
            selectable
            style={{ color: '#FFFFFF', fontSize: 14, lineHeight: 20 }}
          >
            {String(error?.message ?? error)}
          </Text>
          <Text
            selectable
            style={{
              color: 'rgba(255,255,255,0.6)',
              fontSize: 11,
              lineHeight: 16,
              marginTop: 20,
            }}
          >
            {String(error?.stack ?? '').slice(0, 2000)}
          </Text>
        </ScrollView>
      </View>
    );
  }
}
