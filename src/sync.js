/**
 * Cloud sync helpers — pure merge / diff / tombstone logic (Firebase-agnostic).
 * Keep in sync with the inline copies used by index.html.
 */

import { classDedupeKeys, dedupeClasses, sanitizeClassObject, sanitizeGpaPlan } from './storage.js';
import { cloneGradeScale } from './calc.js';
import { UC_BERKELEY_GRADE_DEFINITIONS } from './constants.js';

export const SYNC_SCHEMA_VERSION = 1;
export const SYNC_DEBOUNCE_MS = 2000;

export function nowIso(date = new Date()) {
  return date.toISOString();
}

export function normalizeUpdatedAt(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  const str = String(value);
  const t = Date.parse(str);
  if (!Number.isFinite(t)) return fallback;
  return new Date(t).toISOString();
}

export function compareUpdatedAt(a, b) {
  const ta = Date.parse(normalizeUpdatedAt(a, '1970-01-01T00:00:00.000Z'));
  const tb = Date.parse(normalizeUpdatedAt(b, '1970-01-01T00:00:00.000Z'));
  if (ta === tb) return 0;
  return ta > tb ? 1 : -1;
}

export function isNewerUpdatedAt(candidate, current) {
  return compareUpdatedAt(candidate, current) > 0;
}

export function touchUpdatedAt(record, at = nowIso()) {
  const next = record && typeof record === 'object' ? { ...record } : {};
  next.updatedAt = at;
  return next;
}

/**
 * Soft-delete marker stored locally and as a cloud class document.
 */
export function createClassTombstone(classId, at = nowIso()) {
  return {
    id: String(classId),
    deleted: true,
    updatedAt: at
  };
}

export function classToCloudDoc(cls, at = null) {
  const updatedAt = normalizeUpdatedAt(at || cls?.updatedAt, nowIso());
  if (cls?.deleted === true) {
    return {
      id: String(cls.id),
      deleted: true,
      updatedAt,
      serverUpdatedAt: null
    };
  }
  return {
    id: String(cls.id),
    deleted: false,
    updatedAt,
    serverUpdatedAt: null,
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

export function cloudDocToClass(doc, defaultDefs = UC_BERKELEY_GRADE_DEFINITIONS) {
  if (!doc || typeof doc !== 'object') return null;
  if (doc.deleted === true) {
    return createClassTombstone(doc.id, normalizeUpdatedAt(doc.updatedAt, nowIso()));
  }
  const cleaned = sanitizeClassObject(doc, 0, defaultDefs);
  cleaned.updatedAt = normalizeUpdatedAt(doc.updatedAt, nowIso());
  return cleaned;
}

export function settingsToCloudDoc(state, at = null) {
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    updatedAt: normalizeUpdatedAt(at || state?.settingsUpdatedAt, nowIso()),
    profile: {
      displayName: state?.profile?.displayName || '',
      email: state?.profile?.email || '',
      institution: state?.profile?.institution || '',
      major: state?.profile?.major || ''
    },
    theme: state?.theme || 'black',
    locale: state?.locale || 'en-US',
    defaultGradeDefinitions: cloneGradeScale(
      state?.defaultGradeDefinitions || UC_BERKELEY_GRADE_DEFINITIONS
    ),
    activePresetId: typeof state?.activePresetId === 'string' && state.activePresetId
      ? state.activePresetId
      : 'uc_berkeley'
  };
}

export function applyCloudSettings(state, settingsDoc) {
  if (!settingsDoc || typeof settingsDoc !== 'object') return state;
  const next = { ...state };
  if (settingsDoc.profile && typeof settingsDoc.profile === 'object') {
    next.profile = {
      displayName: String(settingsDoc.profile.displayName || ''),
      email: String(settingsDoc.profile.email || ''),
      institution: String(settingsDoc.profile.institution || ''),
      major: String(settingsDoc.profile.major || '')
    };
  }
  if (['black', 'midnight', 'light'].includes(settingsDoc.theme)) {
    next.theme = settingsDoc.theme;
  }
  if (settingsDoc.locale) next.locale = String(settingsDoc.locale);
  if (Array.isArray(settingsDoc.defaultGradeDefinitions) && settingsDoc.defaultGradeDefinitions.length) {
    next.defaultGradeDefinitions = cloneGradeScale(settingsDoc.defaultGradeDefinitions);
  }
  if (typeof settingsDoc.activePresetId === 'string' && settingsDoc.activePresetId) {
    next.activePresetId = settingsDoc.activePresetId;
  }
  next.settingsUpdatedAt = normalizeUpdatedAt(settingsDoc.updatedAt, nowIso());
  return next;
}

export function plannerToCloudDoc(gpaPlan, at = null) {
  const plan = sanitizeGpaPlan(gpaPlan);
  return {
    ...plan,
    updatedAt: normalizeUpdatedAt(at || gpaPlan?.updatedAt, nowIso())
  };
}

/**
 * Merge local live classes + tombstones with remote class documents.
 * Newer updatedAt wins. Deletion markers remove a live class when newer.
 */
export function mergeClassCollections({
  localClasses = [],
  localTombstones = [],
  remoteDocs = [],
  defaultDefs = UC_BERKELEY_GRADE_DEFINITIONS
} = {}) {
  const byId = new Map();

  const upsert = (entry) => {
    if (!entry?.id) return;
    const id = String(entry.id);
    const prev = byId.get(id);
    if (!prev || isNewerUpdatedAt(entry.updatedAt, prev.updatedAt)) {
      byId.set(id, entry);
    }
  };

  (localClasses || []).forEach((c, idx) => {
    const cleaned = sanitizeClassObject(c, idx, defaultDefs);
    cleaned.updatedAt = normalizeUpdatedAt(c.updatedAt, nowIso());
    upsert({ ...cleaned, deleted: false });
  });

  (localTombstones || []).forEach((t) => {
    upsert(createClassTombstone(t.id, normalizeUpdatedAt(t.updatedAt, nowIso())));
  });

  (remoteDocs || []).forEach((doc) => {
    const converted = cloudDocToClass(doc, defaultDefs);
    if (converted) upsert(converted);
  });

  const live = [];
  const tombstones = [];
  byId.forEach((entry) => {
    if (entry.deleted) {
      tombstones.push(createClassTombstone(entry.id, entry.updatedAt));
    } else {
      const { deleted, ...rest } = entry;
      live.push(rest);
    }
  });

  return {
    classes: dedupeClasses(live),
    tombstones
  };
}

/**
 * First-sign-in resolution.
 * choice: 'use_cloud' | 'use_device' | 'merge'
 */
export function resolveFirstSignIn({
  localClasses = [],
  localTombstones = [],
  localPlanner = null,
  localSettingsState = null,
  remoteClasses = [],
  remotePlanner = null,
  remoteSettings = null,
  choice = 'merge',
  defaultDefs = UC_BERKELEY_GRADE_DEFINITIONS
} = {}) {
  const localHas = (localClasses || []).length > 0;
  const remoteHas = (remoteClasses || []).some(d => d && d.deleted !== true);

  if (choice === 'use_cloud' || (!localHas && remoteHas)) {
    const merged = mergeClassCollections({
      localClasses: [],
      localTombstones: [],
      remoteDocs: remoteClasses,
      defaultDefs
    });
    return {
      classes: merged.classes,
      tombstones: merged.tombstones,
      gpaPlan: remotePlanner ? sanitizeGpaPlan(remotePlanner) : sanitizeGpaPlan(localPlanner),
      settings: remoteSettings || null,
      direction: 'pull'
    };
  }

  if (choice === 'use_device' || (localHas && !remoteHas)) {
    return {
      classes: dedupeClasses(localClasses.map((c, i) => {
        const cleaned = sanitizeClassObject(c, i, defaultDefs);
        cleaned.updatedAt = normalizeUpdatedAt(c.updatedAt, nowIso());
        return cleaned;
      })),
      tombstones: (localTombstones || []).map(t => createClassTombstone(t.id, t.updatedAt)),
      gpaPlan: sanitizeGpaPlan(localPlanner),
      settings: localSettingsState ? settingsToCloudDoc(localSettingsState) : null,
      direction: 'push'
    };
  }

  // merge
  const merged = mergeClassCollections({
    localClasses,
    localTombstones,
    remoteDocs: remoteClasses,
    defaultDefs
  });

  // Prefer newer planner
  let gpaPlan = sanitizeGpaPlan(localPlanner);
  const remotePlan = remotePlanner ? sanitizeGpaPlan(remotePlanner) : null;
  if (remotePlan && isNewerUpdatedAt(remotePlanner?.updatedAt, localPlanner?.updatedAt)) {
    gpaPlan = { ...remotePlan, updatedAt: normalizeUpdatedAt(remotePlanner.updatedAt, nowIso()) };
  } else {
    gpaPlan = touchUpdatedAt(gpaPlan, normalizeUpdatedAt(localPlanner?.updatedAt, nowIso()));
  }

  let settings = localSettingsState ? settingsToCloudDoc(localSettingsState) : null;
  if (remoteSettings && isNewerUpdatedAt(remoteSettings.updatedAt, settings?.updatedAt)) {
    settings = remoteSettings;
  }

  return {
    classes: merged.classes,
    tombstones: merged.tombstones,
    gpaPlan,
    settings,
    direction: 'both'
  };
}

/**
 * Build cloud write set after comparing local vs last-acked snapshots.
 */
export function buildOutgoingSyncPayload({
  classes = [],
  tombstones = [],
  gpaPlan = null,
  settingsState = null,
  lastPushed = null
} = {}) {
  const last = lastPushed || { classes: {}, plannerUpdatedAt: null, settingsUpdatedAt: null };
  const classWrites = [];

  (classes || []).forEach((cls) => {
    const doc = classToCloudDoc(cls);
    const prevAt = last.classes?.[cls.id];
    if (!prevAt || isNewerUpdatedAt(doc.updatedAt, prevAt)) {
      classWrites.push(doc);
    }
  });

  (tombstones || []).forEach((t) => {
    const doc = classToCloudDoc(t);
    const prevAt = last.classes?.[t.id];
    if (!prevAt || isNewerUpdatedAt(doc.updatedAt, prevAt)) {
      classWrites.push(doc);
    }
  });

  const plannerDoc = plannerToCloudDoc(gpaPlan);
  const pushPlanner = !last.plannerUpdatedAt || isNewerUpdatedAt(plannerDoc.updatedAt, last.plannerUpdatedAt);

  const settingsDoc = settingsState ? settingsToCloudDoc(settingsState) : null;
  const pushSettings = !!settingsDoc && (
    !last.settingsUpdatedAt || isNewerUpdatedAt(settingsDoc.updatedAt, last.settingsUpdatedAt)
  );

  return {
    classWrites,
    plannerDoc: pushPlanner ? plannerDoc : null,
    settingsDoc: pushSettings ? settingsDoc : null,
    hasChanges: classWrites.length > 0 || pushPlanner || pushSettings
  };
}

/**
 * Apply a remote class snapshot that this device did not just write (loop avoidance
 * is handled by the caller via ignoreIds / self-write tokens).
 */
export function applyRemoteClassChange(localClasses, localTombstones, remoteDoc, defaultDefs) {
  return mergeClassCollections({
    localClasses,
    localTombstones,
    remoteDocs: [remoteDoc],
    defaultDefs
  });
}

/**
 * Detect whether local and remote both have meaningful data (first-sign-in prompt).
 */
export function needsFirstSignInChoice(localClasses, remoteClasses) {
  const localLive = (localClasses || []).length > 0;
  const remoteLive = (remoteClasses || []).some(d => d && d.deleted !== true);
  return localLive && remoteLive;
}

/**
 * After merge-by-id, also collapse content duplicates (same code/term/title),
 * keeping the newer updatedAt.
 */
export function collapseContentDuplicates(classes) {
  const bestByContent = new Map();
  (classes || []).forEach((c) => {
    const key = classDedupeKeys(c).content;
    const prev = bestByContent.get(key);
    if (!prev || isNewerUpdatedAt(c.updatedAt, prev.updatedAt)) {
      bestByContent.set(key, c);
    }
  });
  return [...bestByContent.values()];
}

export function createDefaultSyncPrefs() {
  return {
    enabled: false,
    lastSyncedAt: null,
    firstSyncDone: false,
    lastPushed: {
      classes: {},
      plannerUpdatedAt: null,
      settingsUpdatedAt: null
    }
  };
}

export function sanitizeSyncPrefs(raw) {
  const clean = createDefaultSyncPrefs();
  if (!raw || typeof raw !== 'object') return clean;
  clean.enabled = raw.enabled === true;
  clean.firstSyncDone = raw.firstSyncDone === true;
  clean.lastSyncedAt = normalizeUpdatedAt(raw.lastSyncedAt, null);
  if (raw.lastPushed && typeof raw.lastPushed === 'object') {
    clean.lastPushed = {
      classes: raw.lastPushed.classes && typeof raw.lastPushed.classes === 'object'
        ? { ...raw.lastPushed.classes }
        : {},
      plannerUpdatedAt: normalizeUpdatedAt(raw.lastPushed.plannerUpdatedAt, null),
      settingsUpdatedAt: normalizeUpdatedAt(raw.lastPushed.settingsUpdatedAt, null)
    };
  }
  return clean;
}
