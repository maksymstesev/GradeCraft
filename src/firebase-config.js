/**
 * Firebase web app config for optional cloud sync (proposal 7).
 *
 * Leave `FIREBASE_CONFIG` as null to keep Sync (beta) local-only until you
 * create a Firebase Spark project and paste the web config here (or set
 * window.GRADECRAFT_FIREBASE before the app boots).
 *
 * Setup checklist (from the product plan):
 * 1. Create a Firebase project on the free Spark plan
 * 2. Register a web app; enable Email link + Google sign-in
 * 3. Add your GitHub Pages domain to Authorized domains
 * 4. Create Firestore with the rules in firestore.rules
 * 5. Paste the firebaseConfig object below
 */

export const FIREBASE_CONFIG = null;

/*
export const FIREBASE_CONFIG = {
  apiKey: '…',
  authDomain: '….firebaseapp.com',
  projectId: '…',
  storageBucket: '….appspot.com',
  messagingSenderId: '…',
  appId: '…'
};
*/

export function isFirebaseConfigured(config = FIREBASE_CONFIG) {
  return !!(
    config
    && typeof config === 'object'
    && config.apiKey
    && config.projectId
    && config.appId
  );
}
