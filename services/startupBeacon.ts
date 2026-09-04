/**
 * Startup Beacon
 * ---------------
 * Fires a fire-and-forget HTTP POST to the `check-subscription` Supabase
 * Edge Function immediately after JavaScript mounts. The Edge Function
 * detects the `x-startup-beacon` header and logs the payload without
 * running any subscription logic, so we get a durable server-side trace
 * of every successful JS boot on every device.
 *
 * WHY: Apple's iPadOS 26.6 test device has crashed ScreamFinder Build
 * 24 200 ms after launch on the React Native bridge thread. That
 * timing is consistent with a NATIVE module init failure that happens
 * BEFORE JavaScript executes. If a beacon shows up in the Edge
 * Function logs from Apple's device, we prove JS did start and the
 * crash is post-mount (a JS bug). If NO beacon arrives from Apple's
 * device, we prove the crash is pre-JS native init (an autolinked
 * native module fault) and can focus mitigation there instead of
 * chasing JS-level defensive fixes.
 *
 * DESIGN CONSTRAINTS:
 *   - Never throws (all internal work is try/catch wrapped).
 *   - Never awaits (fire-and-forget so it can't block mount).
 *   - Uses raw fetch, not the Supabase client, so a broken Supabase
 *     init cannot stop the beacon from firing.
 *   - Sends anon apikey headers so the Edge Function accepts the call
 *     without requiring an authenticated user (guests on cold launch
 *     have no session yet).
 *   - Attempts a short-timeout AbortController so a hung network on
 *     a sandboxed test device can't leak an open connection.
 */

import { Platform } from 'react-native';

const BACKEND_URL = 'https://edrhopkytkvaktededrh.backend.onspace.ai';
const BEACON_ENDPOINT = `${BACKEND_URL}/functions/v1/check-subscription`;

/**
 * Read the app's version + build number DYNAMICALLY from expo-constants.
 * A hardcoded string here drifts as soon as EAS auto-increments
 * `buildNumber` in app.json (see `autoIncrement: "buildNumber"` in
 * eas.json). We want the beacon payload to match whatever the OS
 * actually reports so Edge Function logs are trustworthy.
 *
 * The try/catch is defensive: if expo-constants ever fails to load
 * (or a future prebuild strips it), we fall back to 'unknown' so the
 * beacon still fires with useful device info.
 */
function readAppMetadata(): { appVersion: string; buildNumber: string } {
  try {
    // Lazy require so a broken expo-constants can never crash beacon boot.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    const cfg: any = Constants?.expoConfig || Constants?.manifest || {};
    const version: string = cfg?.version || 'unknown';
    const iosBuild: string = cfg?.ios?.buildNumber;
    const androidCode: string | number | undefined = cfg?.android?.versionCode;
    const buildNumber =
      Platform.OS === 'ios'
        ? (iosBuild || 'unknown')
        : (androidCode !== undefined ? String(androidCode) : 'unknown');
    return { appVersion: version, buildNumber };
  } catch {
    return { appVersion: 'unknown', buildNumber: 'unknown' };
  }
}

export type BeaconPhase =
  | 'mount' // JS runtime finished evaluating app/_layout.tsx and useEffect fired
  | 'post-splash' // AnimatedSplash animation completed and setShowSplash(false) ran
  | 'tab-render' // First tab screen rendered successfully
  | 'auth-restored'; // Supabase getSession() completed (success or failure)

const sentPhases = new Set<BeaconPhase>();

/**
 * Best-effort snapshot of the device model, OS version, and other
 * boot-time identifiers pulled directly from react-native's Platform
 * module. We intentionally avoid expo-device / expo-constants here
 * because they add native module surfaces we don't want to touch
 * during the very first millisecond of boot.
 */
function collectDeviceInfo(): Record<string, unknown> {
  try {
    const constants: any = (Platform as any).constants || {};
    return {
      platform: Platform.OS,
      // Platform.Version is the numeric OS version (e.g. 26 for iOS 26).
      osVersionShort: String((Platform as any).Version ?? 'unknown'),
      // constants.osVersion is the full string (e.g. "26.6").
      osVersionFull: constants.osVersion || constants.systemVersion || null,
      systemName: constants.systemName || null,
      model: constants.Model || constants.model || null,
      interfaceIdiom: constants.interfaceIdiom || null,
      isTesting: constants.isTesting ?? null,
      isMacCatalyst: constants.isMacCatalyst ?? null,
      // reactNativeVersion is present on both iOS and Android.
      reactNativeVersion: constants.reactNativeVersion || null,
      // Detect Hermes (present as `HermesInternal` on globalThis).
      hermes:
        typeof (globalThis as any).HermesInternal !== 'undefined',
    };
  } catch {
    return { platform: Platform.OS, collect: 'failed' };
  }
}

/**
 * Sends a single beacon for the given phase. Repeat calls with the
 * same phase are no-ops so we don't spam the Edge Function.
 */
export function sendStartupBeacon(phase: BeaconPhase, extra?: Record<string, unknown>): void {
  try {
    if (sentPhases.has(phase)) return;
    sentPhases.add(phase);

    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

    const { appVersion, buildNumber } = readAppMetadata();

    const payload = {
      __beacon: true,
      phase,
      appVersion,
      buildNumber,
      timestamp: new Date().toISOString(),
      device: collectDeviceInfo(),
      extra: extra || null,
    };

    // AbortController with a 6-second timeout so a hung network on a
    // sandboxed reviewer device can't leak the connection past the
    // crash. Wrapped defensively because some environments still lack
    // AbortController.
    let controller: AbortController | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      if (typeof AbortController !== 'undefined') {
        controller = new AbortController();
        timeoutId = setTimeout(() => {
          try {
            controller?.abort();
          } catch {
            /* ignore */
          }
        }, 6000);
      }
    } catch {
      controller = null;
    }

    fetch(BEACON_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The `apikey` header is REQUIRED by Supabase Edge Functions,
        // even for endpoints that will short-circuit before doing
        // JWT auth. Without it the request is rejected at the gateway
        // layer with 401 and never hits our function logs.
        ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
        // Custom marker: check-subscription looks for this header and
        // treats the request as a beacon (log-only, no Stripe / Apple
        // subscription logic).
        'x-startup-beacon': '1',
        'x-beacon-phase': phase,
      },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    })
      .catch(() => {
        /* fire-and-forget — network failure is not an app error */
      })
      .finally(() => {
        if (timeoutId) {
          try {
            clearTimeout(timeoutId);
          } catch {
            /* ignore */
          }
        }
      });
  } catch {
    /* startup beacon must never throw */
  }
}

/**
 * Resets the sent-phase cache. Only used from tests or dev tooling.
 */
export function _resetStartupBeaconForTests(): void {
  sentPhases.clear();
}
