/**
 * Firebase web app config for optional cloud sync (proposal 7).
 * Includes measurementId so Analytics can initialize when Sync loads Firebase.
 *
 * Setup checklist (from the product plan):
 * 1. Create a Firebase project on the free Spark plan
 * 2. Register a web app; enable Email link + Google sign-in
 * 3. Add your GitHub Pages domain to Authorized domains
 * 4. Create Firestore with the rules in firestore.rules
 */

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDWObpxDMbZrRFbgUmlKOnF1i7WXgYNUNY',
  authDomain: 'gradecraft-317bb.firebaseapp.com',
  projectId: 'gradecraft-317bb',
  storageBucket: 'gradecraft-317bb.firebasestorage.app',
  messagingSenderId: '303187680260',
  appId: '1:303187680260:web:d1b8a59f061a8df63d2951',
  measurementId: 'G-F34CHQW963'
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
