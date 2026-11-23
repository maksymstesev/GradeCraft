/**
 * Firebase web app config for optional cloud sync / feedback.
 *
 * Lockdown checklist (do in Google / Firebase consoles; then paste site key below):
 * 1. App Check uses reCAPTCHA Enterprise only (Fraud Defense) for this project.
 *    - Google Cloud → Security → reCAPTCHA Enterprise (project gradecraft-317bb)
 *    - Open the Web / score-based key registered with App Check (not google.com/recaptcha/admin)
 *    - Domains: include maksymstesev.github.io (use App Check debug tokens for localhost)
 *    - Paste that site key into appCheckRecaptchaSiteKey below (both config files)
 *    - Keep appCheckProvider: 'enterprise'
 * 2. Deploy the updated client, use Sync / Submit feedback, confirm App Check metrics show verified
 * 3. Firebase → App Check → Enforce for Cloud Firestore (and Auth if offered)
 * 4. Google Cloud → APIs & Services → Credentials → Browser key for this app:
 *    Application restrictions → HTTP referrers:
 *      https://maksymstesev.github.io/*
 *      http://localhost/*
 *      http://127.0.0.1/*
 *    API restrictions → restrict key (Identity Toolkit, Token Service, Firestore,
 *    Firebase Installations, Firebase App Check API, etc.) or leave unrestricted APIs
 *    if you only use referrer lock — referrer lock is the important part for a web key.
 */

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDWObpxDMbZrRFbgUmlKOnF1i7WXgYNUNY',
  authDomain: 'gradecraft-317bb.firebaseapp.com',
  projectId: 'gradecraft-317bb',
  storageBucket: 'gradecraft-317bb.firebasestorage.app',
  messagingSenderId: '303187680260',
  appId: '1:303187680260:web:d1b8a59f061a8df63d2951',
  measurementId: 'G-F34CHQW963',
  /** reCAPTCHA Enterprise site key from App Check registration (public; safe in client). */
  appCheckRecaptchaSiteKey: '6Ldczi0uAAAAALAlAxN7DlxiABirTEGc6lBunU0I',
  /** Must match App Check → Apps attestation provider: 'enterprise' or 'v3'. */
  appCheckProvider: 'enterprise',
  /**
   * When true on localhost / 127.0.0.1, enables App Check debug tokens
   * (register the printed token under App Check → Manage debug tokens).
   */
  appCheckDebug: false
};

export function isFirebaseConfigured(config = FIREBASE_CONFIG) {
  return !!(
    config
    && typeof config === 'object'
    && config.apiKey
    && config.projectId
    && config.appId
  );
}

export function isAppCheckConfigured(config = FIREBASE_CONFIG) {
  return !!(config && typeof config.appCheckRecaptchaSiteKey === 'string'
    && config.appCheckRecaptchaSiteKey.trim().length > 0);
}
