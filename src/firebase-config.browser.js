/* Browser global for optional Firebase sync. Keep in sync with firebase-config.js */
(function (global) {
  global.GRADECRAFT_FIREBASE = global.GRADECRAFT_FIREBASE || {
    apiKey: 'AIzaSyDWObpxDMbZrRFbgUmlKOnF1i7WXgYNUNY',
    authDomain: 'gradecraft-317bb.firebaseapp.com',
    projectId: 'gradecraft-317bb',
    storageBucket: 'gradecraft-317bb.firebasestorage.app',
    messagingSenderId: '303187680260',
    appId: '1:303187680260:web:d1b8a59f061a8df63d2951',
    measurementId: 'G-F34CHQW963',
    /* Enterprise site key from Google Cloud → Security → reCAPTCHA Enterprise (NOT classic admin) */
    appCheckRecaptchaSiteKey: '6Ldczi0uAAAAALAlAxN7DlxiABirTEGc6lBunU0I',
    appCheckProvider: 'enterprise',
    /* true on localhost only while registering an App Check debug token */
    appCheckDebug: false
  };
})(typeof window !== 'undefined' ? window : globalThis);
