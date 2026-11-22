/* Browser global for optional Firebase sync. Keep in sync with firebase-config.js */
(function (global) {
  global.GRADECRAFT_FIREBASE = global.GRADECRAFT_FIREBASE || null;
  /*
  global.GRADECRAFT_FIREBASE = {
    apiKey: '…',
    authDomain: '….firebaseapp.com',
    projectId: '…',
    storageBucket: '….appspot.com',
    messagingSenderId: '…',
    appId: '…'
  };
  */
})(typeof window !== 'undefined' ? window : globalThis);
