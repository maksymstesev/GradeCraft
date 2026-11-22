// ─── Cloud sync controller (Firebase optional; Sync beta) ─────────────
      // Pure helpers mirror src/sync.js (kept inline for the single-page app).

      function syncNowIso() {
        return new Date().toISOString();
      }

      function syncNormalizeUpdatedAt(value, fallback = null) {
        if (value === null || value === undefined || value === '') return fallback;
        const t = Date.parse(String(value));
        if (!Number.isFinite(t)) return fallback;
        return new Date(t).toISOString();
      }

      function syncIsNewer(candidate, current) {
        const ta = Date.parse(syncNormalizeUpdatedAt(candidate, '1970-01-01T00:00:00.000Z'));
        const tb = Date.parse(syncNormalizeUpdatedAt(current, '1970-01-01T00:00:00.000Z'));
        return ta > tb;
      }

      function createDefaultSyncPrefs() {
        return {
          enabled: false,
          lastSyncedAt: null,
          lastPushed: { classes: {}, plannerUpdatedAt: null, settingsUpdatedAt: null },
          firstSyncDone: false
        };
      }

      function sanitizeSyncPrefs(raw) {
        const clean = createDefaultSyncPrefs();
        if (!raw || typeof raw !== 'object') return clean;
        clean.enabled = raw.enabled === true;
        clean.lastSyncedAt = syncNormalizeUpdatedAt(raw.lastSyncedAt, null);
        clean.firstSyncDone = raw.firstSyncDone === true;
        if (raw.lastPushed && typeof raw.lastPushed === 'object') {
          clean.lastPushed = {
            classes: raw.lastPushed.classes && typeof raw.lastPushed.classes === 'object' ? { ...raw.lastPushed.classes } : {},
            plannerUpdatedAt: syncNormalizeUpdatedAt(raw.lastPushed.plannerUpdatedAt, null),
            settingsUpdatedAt: syncNormalizeUpdatedAt(raw.lastPushed.settingsUpdatedAt, null)
          };
        }
        return clean;
      }

      function loadSyncPrefs() {
        try {
          return sanitizeSyncPrefs(JSON.parse(localStorage.getItem(SYNC_PREFS_KEY) || 'null'));
        } catch {
          return createDefaultSyncPrefs();
        }
      }

      function saveSyncPrefs() {
        try {
          localStorage.setItem(SYNC_PREFS_KEY, JSON.stringify(syncPrefs));
        } catch (err) {
          console.error('Failed to save sync prefs:', err);
        }
      }

      let syncPrefs = loadSyncPrefs();
      let syncStatus = 'local'; // local | signed_out | syncing | synced | offline | error
      let syncErrorMessage = '';
      let syncUser = null;
      let syncDebounceTimer = null;
      let syncFirebase = null; // { app, auth, db, mods }
      let syncUnsubscribes = [];
      let syncSelfWriteTokens = new Set();
      let pendingRemoteSnapshot = null;

      function isFirebaseConfigured() {
        const cfg = window.GRADECRAFT_FIREBASE;
        return !!(cfg && cfg.apiKey && cfg.projectId && cfg.appId);
      }

      function classToCloudDoc(cls) {
        const updatedAt = syncNormalizeUpdatedAt(cls?.updatedAt, syncNowIso());
        if (cls?.deleted === true) {
          return { id: String(cls.id), deleted: true, updatedAt };
        }
        return {
          id: String(cls.id),
          deleted: false,
          updatedAt,
          code: cls.code,
          name: cls.name,
          term: cls.term,
          units: cls.units,
          pnp: !!cls.pnp,
          targetLetter: cls.targetLetter,
          groups: cls.groups || [],
          buckets: cls.buckets || [],
          assignments: cls.assignments || []
        };
      }

      function settingsToCloudDoc() {
        return {
          schemaVersion: SYNC_SCHEMA_VERSION,
          updatedAt: syncNormalizeUpdatedAt(state.settingsUpdatedAt, syncNowIso()),
          profile: { ...(state.profile || {}) },
          theme: state.theme,
          locale: state.locale,
          defaultGradeDefinitions: cloneGradeScale(state.defaultGradeDefinitions)
        };
      }

      function plannerToCloudDoc() {
        const plan = sanitizeGpaPlan(gpaPlan);
        return { ...plan, updatedAt: syncNormalizeUpdatedAt(gpaPlan.updatedAt, syncNowIso()) };
      }

      function mergeClassCollections(localClasses, localTombstones, remoteDocs) {
        const byId = new Map();
        const upsert = (entry) => {
          if (!entry?.id) return;
          const id = String(entry.id);
          const prev = byId.get(id);
          if (!prev || syncIsNewer(entry.updatedAt, prev.updatedAt)) byId.set(id, entry);
        };
        (localClasses || []).forEach((c, idx) => {
          const cleaned = sanitizeClassObject(c, idx, state.defaultGradeDefinitions);
          cleaned.updatedAt = syncNormalizeUpdatedAt(c.updatedAt, syncNowIso());
          upsert({ ...cleaned, deleted: false });
        });
        (localTombstones || []).forEach((t) => {
          upsert({ id: String(t.id), deleted: true, updatedAt: syncNormalizeUpdatedAt(t.updatedAt, syncNowIso()) });
        });
        (remoteDocs || []).forEach((doc) => {
          if (!doc?.id) return;
          if (doc.deleted === true) {
            upsert({ id: String(doc.id), deleted: true, updatedAt: syncNormalizeUpdatedAt(doc.updatedAt, syncNowIso()) });
          } else {
            const cleaned = sanitizeClassObject(doc, 0, state.defaultGradeDefinitions);
            cleaned.updatedAt = syncNormalizeUpdatedAt(doc.updatedAt, syncNowIso());
            upsert({ ...cleaned, deleted: false });
          }
        });
        const live = [];
        const tombstones = [];
        byId.forEach((entry) => {
          if (entry.deleted) tombstones.push({ id: entry.id, deleted: true, updatedAt: entry.updatedAt });
          else {
            const { deleted, ...rest } = entry;
            live.push(rest);
          }
        });
        return { classes: dedupeClasses(live), tombstones };
      }

      function collapseContentDuplicates(classes) {
        const best = new Map();
        (classes || []).forEach((c) => {
          const key = classDedupeKeys(c).content;
          const prev = best.get(key);
          if (!prev || syncIsNewer(c.updatedAt, prev.updatedAt)) best.set(key, c);
        });
        return [...best.values()];
      }

      function buildOutgoingSyncPayload() {
        const last = syncPrefs.lastPushed || { classes: {}, plannerUpdatedAt: null, settingsUpdatedAt: null };
        const classWrites = [];
        (state.classes || []).forEach((cls) => {
          const doc = classToCloudDoc(cls);
          const prevAt = last.classes?.[cls.id];
          if (!prevAt || syncIsNewer(doc.updatedAt, prevAt)) classWrites.push(doc);
        });
        (state.classTombstones || []).forEach((t) => {
          const doc = classToCloudDoc(t);
          const prevAt = last.classes?.[t.id];
          if (!prevAt || syncIsNewer(doc.updatedAt, prevAt)) classWrites.push(doc);
        });
        const plannerDoc = plannerToCloudDoc();
        const settingsDoc = settingsToCloudDoc();
        const pushPlanner = !last.plannerUpdatedAt || syncIsNewer(plannerDoc.updatedAt, last.plannerUpdatedAt);
        const pushSettings = !last.settingsUpdatedAt || syncIsNewer(settingsDoc.updatedAt, last.settingsUpdatedAt);
        return {
          classWrites,
          plannerDoc: pushPlanner ? plannerDoc : null,
          settingsDoc: pushSettings ? settingsDoc : null,
          hasChanges: classWrites.length > 0 || pushPlanner || pushSettings
        };
      }

      function setSyncStatus(next, message = '') {
        syncStatus = next;
        syncErrorMessage = message || '';
        renderSyncAccountUI();
      }

      function renderSyncAccountUI() {
        const toggle = document.getElementById('syncBetaToggle');
        const disabledHint = document.getElementById('syncDisabledHint');
        const activePanel = document.getElementById('syncActivePanel');
        const signedOut = document.getElementById('syncSignedOutPanel');
        const signedIn = document.getElementById('syncSignedInPanel');
        const chip = document.getElementById('syncStatusChip');
        const emailEl = document.getElementById('syncUserEmail');
        const lastEl = document.getElementById('syncLastSyncedAt');
        if (toggle) toggle.checked = !!syncPrefs.enabled;
        const showActive = !!syncPrefs.enabled;
        if (disabledHint) disabledHint.classList.toggle('hidden', showActive);
        if (activePanel) activePanel.classList.toggle('hidden', !showActive);
        const isSignedIn = !!(syncUser && syncUser.uid);
        if (signedOut) signedOut.classList.toggle('hidden', !showActive || isSignedIn);
        if (signedIn) signedIn.classList.toggle('hidden', !showActive || !isSignedIn);
        if (emailEl) emailEl.textContent = syncUser?.email || syncUser?.uid || '—';
        if (lastEl) {
          lastEl.textContent = syncPrefs.lastSyncedAt
            ? new Date(syncPrefs.lastSyncedAt).toLocaleString(state.locale || 'en-US')
            : 'never';
        }
        if (chip) {
          const labels = {
            local: 'Local only',
            signed_out: 'Signed out',
            syncing: 'Syncing…',
            synced: 'Synced',
            offline: 'Offline — will sync later',
            error: 'Error'
          };
          chip.textContent = labels[syncStatus] || syncStatus;
          chip.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold border ' + (
            syncStatus === 'synced' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
              : syncStatus === 'syncing' ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                : syncStatus === 'error' ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  : syncStatus === 'offline' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 'bg-zinc-500/15 text-theme-muted border-theme'
          );
        }
        const authMsg = document.getElementById('syncAuthMessage');
        if (authMsg && syncErrorMessage) authMsg.textContent = syncErrorMessage;
      }

      async function loadFirebaseSdk() {
        if (syncFirebase) return syncFirebase;
        if (!isFirebaseConfigured()) throw new Error('Firebase is not configured');
        const [{ initializeApp, getApps }, authMod, fsMod] = await Promise.all([
          import('https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'),
          import('https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js'),
          import('https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js')
        ]);
        const existing = getApps();
        const app = existing.length ? existing[0] : initializeApp(window.GRADECRAFT_FIREBASE);
        const auth = authMod.getAuth(app);
        let db;
        try {
          db = fsMod.initializeFirestore(app, {
            localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() })
          });
        } catch {
          db = fsMod.getFirestore(app);
        }
        syncFirebase = { app, auth, db, authMod, fsMod };
        return syncFirebase;
      }

      function clearSyncListeners() {
        syncUnsubscribes.forEach((fn) => {
          try { fn(); } catch { /* ignore */ }
        });
        syncUnsubscribes = [];
      }

      async function pushLocalToCloud() {
        if (readOnlyMode || !syncPrefs.enabled || !syncUser) return;
        const fb = await loadFirebaseSdk();
        const { db, fsMod } = fb;
        const uid = syncUser.uid;
        const payload = buildOutgoingSyncPayload();
        if (!payload.hasChanges) {
          setSyncStatus(navigator.onLine === false ? 'offline' : 'synced');
          return;
        }
        setSyncStatus('syncing');
        const batch = fsMod.writeBatch(db);
        payload.classWrites.forEach((doc) => {
          const ref = fsMod.doc(db, 'users', uid, 'classes', doc.id);
          syncSelfWriteTokens.add(`class:${doc.id}:${doc.updatedAt}`);
          batch.set(ref, doc, { merge: true });
        });
        if (payload.plannerDoc) {
          const ref = fsMod.doc(db, 'users', uid, 'planner', 'main');
          syncSelfWriteTokens.add(`planner:${payload.plannerDoc.updatedAt}`);
          batch.set(ref, payload.plannerDoc, { merge: true });
        }
        if (payload.settingsDoc) {
          const ref = fsMod.doc(db, 'users', uid);
          syncSelfWriteTokens.add(`settings:${payload.settingsDoc.updatedAt}`);
          batch.set(ref, payload.settingsDoc, { merge: true });
        }
        await batch.commit();
        payload.classWrites.forEach((doc) => {
          syncPrefs.lastPushed.classes[doc.id] = doc.updatedAt;
        });
        if (payload.plannerDoc) syncPrefs.lastPushed.plannerUpdatedAt = payload.plannerDoc.updatedAt;
        if (payload.settingsDoc) syncPrefs.lastPushed.settingsUpdatedAt = payload.settingsDoc.updatedAt;
        syncPrefs.lastSyncedAt = syncNowIso();
        saveSyncPrefs();
        setSyncStatus(navigator.onLine === false ? 'offline' : 'synced');
      }

      function applyMergedCollections(merged) {
        state.classes = merged.classes;
        state.classTombstones = merged.tombstones;
        if (!state.classes.some(c => c.id === state.activeClassId)) {
          state.activeClassId = state.classes[0]?.id || null;
        }
      }

      async function pullAndMaybePromptFirstSync() {
        const fb = await loadFirebaseSdk();
        const { db, fsMod } = fb;
        const uid = syncUser.uid;
        const classesSnap = await fsMod.getDocs(fsMod.collection(db, 'users', uid, 'classes'));
        const remoteClasses = [];
        classesSnap.forEach((d) => remoteClasses.push({ id: d.id, ...d.data() }));
        const plannerSnap = await fsMod.getDoc(fsMod.doc(db, 'users', uid, 'planner', 'main'));
        const settingsSnap = await fsMod.getDoc(fsMod.doc(db, 'users', uid));
        const remotePlanner = plannerSnap.exists() ? plannerSnap.data() : null;
        const remoteSettings = settingsSnap.exists() ? settingsSnap.data() : null;

        const localHas = (state.classes || []).length > 0;
        const remoteHas = remoteClasses.some(d => d && d.deleted !== true);
        pendingRemoteSnapshot = { remoteClasses, remotePlanner, remoteSettings };

        if (!syncPrefs.firstSyncDone && localHas && remoteHas) {
          openSyncConflictModal();
          return;
        }

        const choice = !localHas && remoteHas ? 'use_cloud'
          : localHas && !remoteHas ? 'use_device'
            : 'merge';
        await applyFirstSignInChoice(choice, false);
      }

      function openSyncConflictModal() {
        // Download local backup first
        try {
          const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'gradecraft-pre-sync-backup.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch { /* ignore */ }
        const backdrop = document.getElementById('syncConflictModalBackdrop');
        if (backdrop) {
          backdrop.classList.remove('hidden');
          backdrop.classList.add('flex');
        }
      }

      function closeSyncConflictModal() {
        const backdrop = document.getElementById('syncConflictModalBackdrop');
        if (!backdrop) return;
        backdrop.classList.add('hidden');
        backdrop.classList.remove('flex');
      }

      async function applyFirstSignInChoice(choice, fromModal) {
        const snap = pendingRemoteSnapshot || { remoteClasses: [], remotePlanner: null, remoteSettings: null };
        if (choice === 'use_cloud') {
          const merged = mergeClassCollections([], [], snap.remoteClasses);
          applyMergedCollections({
            classes: collapseContentDuplicates(merged.classes),
            tombstones: merged.tombstones
          });
          if (snap.remotePlanner) gpaPlan = sanitizeGpaPlan(snap.remotePlanner);
          if (snap.remoteSettings) {
            if (snap.remoteSettings.profile) state.profile = { ...state.profile, ...snap.remoteSettings.profile };
            if (['black', 'midnight', 'light'].includes(snap.remoteSettings.theme)) state.theme = snap.remoteSettings.theme;
            if (snap.remoteSettings.locale) state.locale = snap.remoteSettings.locale;
            if (Array.isArray(snap.remoteSettings.defaultGradeDefinitions)) {
              state.defaultGradeDefinitions = cloneGradeScale(snap.remoteSettings.defaultGradeDefinitions);
            }
            state.settingsUpdatedAt = syncNormalizeUpdatedAt(snap.remoteSettings.updatedAt, syncNowIso());
          }
        } else if (choice === 'use_device') {
          // keep local; push will upload
        } else {
          const merged = mergeClassCollections(state.classes, state.classTombstones, snap.remoteClasses);
          applyMergedCollections({
            classes: collapseContentDuplicates(merged.classes),
            tombstones: merged.tombstones
          });
          if (snap.remotePlanner && syncIsNewer(snap.remotePlanner.updatedAt, gpaPlan.updatedAt)) {
            gpaPlan = sanitizeGpaPlan(snap.remotePlanner);
          }
          if (snap.remoteSettings && syncIsNewer(snap.remoteSettings.updatedAt, state.settingsUpdatedAt)) {
            if (snap.remoteSettings.profile) state.profile = { ...state.profile, ...snap.remoteSettings.profile };
            if (['black', 'midnight', 'light'].includes(snap.remoteSettings.theme)) state.theme = snap.remoteSettings.theme;
            if (snap.remoteSettings.locale) state.locale = snap.remoteSettings.locale;
            if (Array.isArray(snap.remoteSettings.defaultGradeDefinitions)) {
              state.defaultGradeDefinitions = cloneGradeScale(snap.remoteSettings.defaultGradeDefinitions);
            }
            state.settingsUpdatedAt = syncNormalizeUpdatedAt(snap.remoteSettings.updatedAt, syncNowIso());
          }
        }

        // Reset lastPushed so the chosen side fully uploads/downloads next
        if (choice === 'use_device') {
          syncPrefs.lastPushed = { classes: {}, plannerUpdatedAt: null, settingsUpdatedAt: null };
        } else if (choice === 'use_cloud') {
          (state.classes || []).forEach((c) => {
            syncPrefs.lastPushed.classes[c.id] = c.updatedAt;
          });
          (state.classTombstones || []).forEach((t) => {
            syncPrefs.lastPushed.classes[t.id] = t.updatedAt;
          });
          syncPrefs.lastPushed.plannerUpdatedAt = gpaPlan.updatedAt || null;
          syncPrefs.lastPushed.settingsUpdatedAt = state.settingsUpdatedAt || null;
        }

        syncPrefs.firstSyncDone = true;
        saveSyncPrefs();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        localStorage.setItem(GPA_STORAGE_KEY, JSON.stringify(sanitizeGpaPlan(gpaPlan)));
        if (fromModal) closeSyncConflictModal();
        renderApp(false);
        await pushLocalToCloud();
        await startSyncListeners();
        showToast('Cloud sync is ready', 'success');
      }

      async function startSyncListeners() {
        if (!syncUser || !syncPrefs.enabled) return;
        clearSyncListeners();
        const fb = await loadFirebaseSdk();
        const { db, fsMod } = fb;
        const uid = syncUser.uid;

        const unsubClasses = fsMod.onSnapshot(
          fsMod.collection(db, 'users', uid, 'classes'),
          (snap) => {
            if (readOnlyMode) return;
            const remoteDocs = [];
            snap.docChanges().forEach((change) => {
              const data = { id: change.doc.id, ...change.doc.data() };
              const token = `class:${data.id}:${data.updatedAt || ''}`;
              if (syncSelfWriteTokens.has(token)) {
                syncSelfWriteTokens.delete(token);
                return;
              }
              remoteDocs.push(data);
            });
            if (!remoteDocs.length) return;
            const merged = mergeClassCollections(state.classes, state.classTombstones, remoteDocs);
            applyMergedCollections({
              classes: collapseContentDuplicates(merged.classes),
              tombstones: merged.tombstones
            });
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            renderApp(true);
            syncPrefs.lastSyncedAt = syncNowIso();
            saveSyncPrefs();
            setSyncStatus('synced');
          },
          (err) => setSyncStatus('error', err.message || 'Class listener failed')
        );

        const unsubPlanner = fsMod.onSnapshot(
          fsMod.doc(db, 'users', uid, 'planner', 'main'),
          (snap) => {
            if (readOnlyMode || !snap.exists()) return;
            const data = snap.data();
            const token = `planner:${data.updatedAt || ''}`;
            if (syncSelfWriteTokens.has(token)) {
              syncSelfWriteTokens.delete(token);
              return;
            }
            if (!syncIsNewer(data.updatedAt, gpaPlan.updatedAt)) return;
            gpaPlan = sanitizeGpaPlan(data);
            localStorage.setItem(GPA_STORAGE_KEY, JSON.stringify(gpaPlan));
            if (state.activeView === 'gpa') renderApp(true);
            syncPrefs.lastSyncedAt = syncNowIso();
            saveSyncPrefs();
            setSyncStatus('synced');
          },
          (err) => setSyncStatus('error', err.message || 'Planner listener failed')
        );

        const unsubSettings = fsMod.onSnapshot(
          fsMod.doc(db, 'users', uid),
          (snap) => {
            if (readOnlyMode || !snap.exists()) return;
            const data = snap.data();
            const token = `settings:${data.updatedAt || ''}`;
            if (syncSelfWriteTokens.has(token)) {
              syncSelfWriteTokens.delete(token);
              return;
            }
            if (!syncIsNewer(data.updatedAt, state.settingsUpdatedAt)) return;
            if (data.profile) state.profile = { ...state.profile, ...data.profile };
            if (['black', 'midnight', 'light'].includes(data.theme)) state.theme = data.theme;
            if (data.locale) state.locale = data.locale;
            if (Array.isArray(data.defaultGradeDefinitions)) {
              state.defaultGradeDefinitions = cloneGradeScale(data.defaultGradeDefinitions);
            }
            state.settingsUpdatedAt = syncNormalizeUpdatedAt(data.updatedAt, syncNowIso());
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            renderApp(true);
            syncPrefs.lastSyncedAt = syncNowIso();
            saveSyncPrefs();
            setSyncStatus('synced');
          },
          (err) => setSyncStatus('error', err.message || 'Settings listener failed')
        );

        syncUnsubscribes.push(unsubClasses, unsubPlanner, unsubSettings);
      }

      function scheduleCloudSync() {
        if (readOnlyMode || !syncPrefs.enabled || !syncUser) return;
        if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
        syncDebounceTimer = setTimeout(() => {
          pushLocalToCloud().catch((err) => {
            console.error(err);
            setSyncStatus(navigator.onLine === false ? 'offline' : 'error', err.message || 'Sync failed');
          });
        }, SYNC_DEBOUNCE_MS);
      }

      async function enableSyncBeta(enabled) {
        syncPrefs.enabled = !!enabled;
        saveSyncPrefs();
        if (!enabled) {
          clearSyncListeners();
          syncUser = null;
          setSyncStatus('local');
          showToast('Cloud sync turned off. Local data is unchanged.', 'info');
          return;
        }
        if (!isFirebaseConfigured()) {
          setSyncStatus('error', 'Add Firebase config in src/firebase-config.browser.js (or window.GRADECRAFT_FIREBASE).');
          showToast('Sync needs a Firebase web config first.', 'warning');
          renderSyncAccountUI();
          return;
        }
        try {
          const fb = await loadFirebaseSdk();
          fb.authMod.onAuthStateChanged(fb.auth, async (user) => {
            syncUser = user;
            if (!syncPrefs.enabled) return;
            if (!user) {
              clearSyncListeners();
              setSyncStatus('signed_out');
              return;
            }
            try {
              setSyncStatus('syncing');
              await pullAndMaybePromptFirstSync();
              if (syncPrefs.firstSyncDone) {
                await startSyncListeners();
                await pushLocalToCloud();
              }
            } catch (err) {
              console.error(err);
              setSyncStatus('error', err.message || 'Sign-in sync failed');
            }
          });
          // Complete email-link sign-in if the user opened a magic link
          if (fb.authMod.isSignInWithEmailLink(fb.auth, window.location.href)) {
            let email = window.localStorage.getItem('gradecraft_email_for_signin') || '';
            if (!email) email = window.prompt('Confirm your email to finish signing in') || '';
            if (email) {
              await fb.authMod.signInWithEmailLink(fb.auth, email, window.location.href);
              window.localStorage.removeItem('gradecraft_email_for_signin');
              try {
                window.history.replaceState({}, document.title, window.location.pathname + window.location.hash.replace(/[?&]apiKey=[^#]*/, ''));
              } catch { /* ignore */ }
            }
          }
          setSyncStatus(fb.auth.currentUser ? 'syncing' : 'signed_out');
        } catch (err) {
          console.error(err);
          setSyncStatus('error', err.message || 'Could not start Firebase');
        }
      }

      async function sendSyncEmailLink() {
        const input = document.getElementById('syncEmailInput');
        const email = String(input?.value || '').trim();
        const msg = document.getElementById('syncAuthMessage');
        if (!email) {
          if (msg) msg.textContent = 'Enter an email address first.';
          return;
        }
        if (!isFirebaseConfigured()) {
          showToast('Firebase is not configured yet.', 'warning');
          return;
        }
        try {
          const fb = await loadFirebaseSdk();
          const actionCodeSettings = {
            url: window.location.href.split('#')[0] + '#/profile',
            handleCodeInApp: true
          };
          await fb.authMod.sendSignInLinkToEmail(fb.auth, email, actionCodeSettings);
          window.localStorage.setItem('gradecraft_email_for_signin', email);
          if (msg) msg.textContent = 'Check your email for the sign-in link. It opens back into GradeCraft.';
          showToast('Sign-in link sent', 'success');
        } catch (err) {
          console.error(err);
          if (msg) msg.textContent = err.message || 'Could not send email link';
          setSyncStatus('error', err.message || 'Email link failed');
        }
      }

      async function signInWithGoogle() {
        if (!isFirebaseConfigured()) {
          showToast('Firebase is not configured yet.', 'warning');
          return;
        }
        try {
          const fb = await loadFirebaseSdk();
          const provider = new fb.authMod.GoogleAuthProvider();
          await fb.authMod.signInWithPopup(fb.auth, provider);
          showToast('Signed in with Google', 'success');
        } catch (err) {
          console.error(err);
          setSyncStatus('error', err.message || 'Google sign-in failed');
          showToast(err.message || 'Google sign-in failed', 'warning');
        }
      }

      async function signOutSync() {
        if (!syncFirebase) {
          syncUser = null;
          setSyncStatus(syncPrefs.enabled ? 'signed_out' : 'local');
          return;
        }
        clearSyncListeners();
        await syncFirebase.authMod.signOut(syncFirebase.auth);
        syncUser = null;
        setSyncStatus('signed_out');
        showToast('Signed out. Local data stays on this device.', 'info');
      }

      async function deleteMyCloudData() {
        if (!syncUser) {
          showToast('Sign in first to delete cloud data.', 'warning');
          return;
        }
        openConfirmModal(
          'Delete my cloud data and account?',
          'This removes every GradeCraft document under your user in Firebase, then deletes the account. Local browser data is kept unless you factory-reset separately. You may need a recent sign-in.',
          async () => {
            try {
              setSyncStatus('syncing');
              const fb = await loadFirebaseSdk();
              const { db, fsMod, auth } = fb;
              const uid = syncUser.uid;
              const classesSnap = await fsMod.getDocs(fsMod.collection(db, 'users', uid, 'classes'));
              const batch = fsMod.writeBatch(db);
              classesSnap.forEach((d) => batch.delete(d.ref));
              batch.delete(fsMod.doc(db, 'users', uid, 'planner', 'main'));
              batch.delete(fsMod.doc(db, 'users', uid));
              await batch.commit();
              clearSyncListeners();
              await fb.authMod.deleteUser(auth.currentUser);
              syncUser = null;
              syncPrefs.firstSyncDone = false;
              syncPrefs.lastPushed = { classes: {}, plannerUpdatedAt: null, settingsUpdatedAt: null };
              syncPrefs.lastSyncedAt = null;
              saveSyncPrefs();
              setSyncStatus(syncPrefs.enabled ? 'signed_out' : 'local');
              showToast('Cloud data and account deleted', 'success');
            } catch (err) {
              console.error(err);
              setSyncStatus('error', err.message || 'Delete failed — sign in again and retry');
              showToast(err.message || 'Delete failed. Sign in again, then retry.', 'warning');
            }
          }
        );
      }

      function initSyncUi() {
        renderSyncAccountUI();
        if (syncPrefs.enabled) {
          enableSyncBeta(true);
        }
        window.addEventListener('online', () => {
          if (syncPrefs.enabled && syncUser) {
            setSyncStatus('syncing');
            pushLocalToCloud().catch(() => setSyncStatus('offline'));
          }
        });
        window.addEventListener('offline', () => {
          if (syncPrefs.enabled && syncUser) setSyncStatus('offline');
        });
      }
