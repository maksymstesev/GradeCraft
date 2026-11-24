/**
 * Unit tests for cloud sync merge / tombstone / first-sign-in helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  compareUpdatedAt,
  isNewerUpdatedAt,
  createClassTombstone,
  classToCloudDoc,
  cloudDocToClass,
  mergeClassCollections,
  resolveFirstSignIn,
  buildOutgoingSyncPayload,
  needsFirstSignInChoice,
  collapseContentDuplicates,
  sanitizeSyncPrefs,
  applyCloudSettings,
  touchUpdatedAt,
} from '../../src/sync.js';

const older = '2026-01-01T00:00:00.000Z';
const newer = '2026-06-01T00:00:00.000Z';

function sampleClass(id, overrides = {}) {
  return {
    id,
    code: 'CS 61A',
    name: 'SICP',
    term: 'Fall 2026',
    units: 4,
    pnp: false,
    targetLetter: 'A',
    groups: [{ id: 'g1', name: 'HW', weight: 100, policies: { dropLowest: 0, bestOf: 0, latePenalty: { enabled: false, percentPerDay: 10, cap: 100 }, replacement: { enabled: false, sourceAssignmentId: '', targetAssignmentId: '' } } }],
    buckets: [],
    assignments: [],
    updatedAt: older,
    ...overrides,
  };
}

describe('updatedAt helpers', () => {
  it('compares ISO timestamps', () => {
    expect(compareUpdatedAt(newer, older)).toBe(1);
    expect(isNewerUpdatedAt(newer, older)).toBe(true);
    expect(isNewerUpdatedAt(older, newer)).toBe(false);
  });

  it('touches updatedAt', () => {
    const touched = touchUpdatedAt({ a: 1 }, newer);
    expect(touched.updatedAt).toBe(newer);
    expect(touched.a).toBe(1);
  });
});

describe('tombstones and cloud docs', () => {
  it('creates deletion markers', () => {
    const t = createClassTombstone('class_1', newer);
    expect(t).toEqual({ id: 'class_1', deleted: true, updatedAt: newer });
  });

  it('round-trips a live class through cloud shape', () => {
    const cls = sampleClass('class_1', { updatedAt: newer });
    const doc = classToCloudDoc(cls);
    expect(doc.deleted).toBe(false);
    expect(doc.code).toBe('CS 61A');
    const back = cloudDocToClass(doc);
    expect(back.id).toBe('class_1');
    expect(back.updatedAt).toBe(newer);
    expect(back.deleted).toBeUndefined();
  });

  it('converts deleted cloud docs to tombstones', () => {
    const t = cloudDocToClass({ id: 'x', deleted: true, updatedAt: newer });
    expect(t.deleted).toBe(true);
  });
});

describe('mergeClassCollections', () => {
  it('keeps the newer class by id', () => {
    const local = [sampleClass('c1', { name: 'Local', updatedAt: older })];
    const remote = [classToCloudDoc(sampleClass('c1', { name: 'Remote', updatedAt: newer }))];
    const merged = mergeClassCollections({ localClasses: local, remoteDocs: remote });
    expect(merged.classes).toHaveLength(1);
    expect(merged.classes[0].name).toBe('Remote');
  });

  it('applies a newer deletion marker', () => {
    const local = [sampleClass('c1', { updatedAt: older })];
    const remote = [{ id: 'c1', deleted: true, updatedAt: newer }];
    const merged = mergeClassCollections({ localClasses: local, remoteDocs: remote });
    expect(merged.classes).toHaveLength(0);
    expect(merged.tombstones).toHaveLength(1);
    expect(merged.tombstones[0].id).toBe('c1');
  });

  it('does not resurrect a class when local tombstone is newer', () => {
    const localTombstones = [createClassTombstone('c1', newer)];
    const remote = [classToCloudDoc(sampleClass('c1', { updatedAt: older }))];
    const merged = mergeClassCollections({
      localClasses: [],
      localTombstones,
      remoteDocs: remote,
    });
    expect(merged.classes).toHaveLength(0);
    expect(merged.tombstones[0].id).toBe('c1');
  });
});

describe('first sign-in resolution', () => {
  it('detects when a choice is needed', () => {
    expect(needsFirstSignInChoice([sampleClass('a')], [classToCloudDoc(sampleClass('b'))])).toBe(true);
    expect(needsFirstSignInChoice([], [classToCloudDoc(sampleClass('b'))])).toBe(false);
  });

  it('use_cloud pulls remote classes', () => {
    const result = resolveFirstSignIn({
      localClasses: [sampleClass('local', { code: 'LOCAL' })],
      remoteClasses: [classToCloudDoc(sampleClass('remote', { code: 'REMOTE', updatedAt: newer }))],
      choice: 'use_cloud',
    });
    expect(result.classes.map(c => c.id)).toEqual(['remote']);
    expect(result.direction).toBe('pull');
  });

  it('use_device keeps local classes', () => {
    const result = resolveFirstSignIn({
      localClasses: [sampleClass('local')],
      remoteClasses: [classToCloudDoc(sampleClass('remote'))],
      choice: 'use_device',
    });
    expect(result.classes.map(c => c.id)).toEqual(['local']);
    expect(result.direction).toBe('push');
  });

  it('merge keeps newer per id then can collapse content dupes', () => {
    const result = resolveFirstSignIn({
      localClasses: [sampleClass('id1', { updatedAt: newer })],
      remoteClasses: [classToCloudDoc(sampleClass('id2', {
        code: 'CS 61A',
        name: 'SICP',
        term: 'Fall 2026',
        updatedAt: older,
      }))],
      choice: 'merge',
    });
    expect(result.classes.length).toBeGreaterThanOrEqual(1);
    const collapsed = collapseContentDuplicates(result.classes);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe('id1');
  });
});

describe('buildOutgoingSyncPayload', () => {
  it('emits only changed documents', () => {
    const cls = sampleClass('c1', { updatedAt: newer });
    const payload = buildOutgoingSyncPayload({
      classes: [cls],
      tombstones: [],
      gpaPlan: { grades: {}, prior: { units: 0, gpa: null }, goal: {}, updatedAt: newer },
      settingsState: {
        profile: { displayName: '', email: '', institution: '', major: '' },
        theme: 'black',
        locale: 'en-US',
        defaultGradeDefinitions: [],
        settingsUpdatedAt: newer,
      },
      lastPushed: {
        classes: { c1: newer },
        plannerUpdatedAt: newer,
        settingsUpdatedAt: newer,
      },
    });
    expect(payload.hasChanges).toBe(false);
    expect(payload.classWrites).toHaveLength(0);
  });

  it('includes tombstones that are newer than last push', () => {
    const payload = buildOutgoingSyncPayload({
      classes: [],
      tombstones: [createClassTombstone('gone', newer)],
      gpaPlan: { grades: {}, updatedAt: older },
      lastPushed: { classes: {}, plannerUpdatedAt: newer, settingsUpdatedAt: newer },
    });
    expect(payload.classWrites).toHaveLength(1);
    expect(payload.classWrites[0].deleted).toBe(true);
  });
});

describe('settings + prefs', () => {
  it('applies cloud settings onto state', () => {
    const state = applyCloudSettings(
      { theme: 'black', locale: 'en-US', profile: { displayName: '', email: '', institution: '', major: '' } },
      { theme: 'light', locale: 'en-GB', profile: { displayName: 'Ada', email: '', institution: '', major: '' }, updatedAt: newer }
    );
    expect(state.theme).toBe('light');
    expect(state.locale).toBe('en-GB');
    expect(state.profile.displayName).toBe('Ada');
  });

  it('preserves local avatar when applying cloud settings', () => {
    const localAvatar = 'data:image/jpeg;base64,/9j/local';
    const state = applyCloudSettings(
      {
        theme: 'black',
        locale: 'en-US',
        profile: { displayName: 'Local', email: '', institution: '', major: '', avatarDataUrl: localAvatar }
      },
      { theme: 'light', profile: { displayName: 'Cloud', email: '', institution: '', major: '' }, updatedAt: newer }
    );
    expect(state.profile.displayName).toBe('Cloud');
    expect(state.profile.avatarDataUrl).toBe(localAvatar);
  });

  it('sanitizes sync prefs with enabled default false', () => {
    expect(sanitizeSyncPrefs(null).enabled).toBe(false);
    expect(sanitizeSyncPrefs({ enabled: true, lastSyncedAt: newer }).enabled).toBe(true);
  });
});
