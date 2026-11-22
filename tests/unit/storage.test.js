/**
 * Unit tests for GradeCraft storage functions (src/storage.js).
 *
 * Covers: state sanitization, duplicate merging, legacy migration,
 * example course creation, localStorage loading, and class deduplication.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  uid,
  cleanLegacyProfileValue,
  classDedupeKeys,
  dedupeClasses,
  createExampleCourses,
  createDefaultState,
  sanitizeClassObject,
  sanitizeState,
  loadState,
  saveState,
  loadGpaPlan,
  saveGpaPlan,
} from '../../src/storage.js';

import { UC_BERKELEY_GRADE_DEFINITIONS, STORAGE_KEY, GPA_STORAGE_KEY } from '../../src/constants.js';

// ─── In-memory localStorage mock ─────────────────────────────────────

function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => key in store ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    _store: store,
  };
}

// ─── uid ─────────────────────────────────────────────────────────────

describe('uid', () => {
  it('generates unique ids', () => {
    const a = uid('test');
    const b = uid('test');
    expect(a).not.toBe(b);
  });

  it('uses the given prefix', () => {
    const id = uid('class');
    expect(id.startsWith('class_')).toBe(true);
  });
});

// ─── cleanLegacyProfileValue ─────────────────────────────────────────

describe('cleanLegacyProfileValue', () => {
  it('replaces known filler text with empty string', () => {
    expect(cleanLegacyProfileValue('Student Name', 'Student Name')).toBe('');
  });

  it('preserves real user input', () => {
    expect(cleanLegacyProfileValue('Alice', 'Student Name')).toBe('Alice');
  });

  it('handles null/undefined', () => {
    expect(cleanLegacyProfileValue(null, 'Student Name')).toBe('');
    expect(cleanLegacyProfileValue(undefined, 'Student Name')).toBe('');
  });
});

// ─── classDedupeKeys ─────────────────────────────────────────────────

describe('classDedupeKeys', () => {
  it('generates normalized ID and content keys', () => {
    const keys = classDedupeKeys({
      id: 'cls_1',
      code: ' CS 61A ',
      term: 'Fall 2026',
      name: ' Structure ',
    });
    expect(keys.id).toBe('ID::CLS_1');
    expect(keys.content).toBe('CONTENT::CS 61A::FALL 2026::STRUCTURE');
  });

  it('collapses extra whitespace', () => {
    const keys = classDedupeKeys({
      id: 'x',
      code: 'CS  61A',
      term: '  Fall   2026 ',
      name: 'Test',
    });
    expect(keys.content).toContain('CS 61A');
  });
});

// ─── dedupeClasses ───────────────────────────────────────────────────

describe('dedupeClasses', () => {
  it('removes duplicate by ID', () => {
    const classes = [
      { id: 'c1', code: 'CS 61A', term: 'Fall 2026', name: 'SICP' },
      { id: 'c1', code: 'CS 61B', term: 'Fall 2026', name: 'Data Structures' },
    ];
    const result = dedupeClasses(classes);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('CS 61A');
  });

  it('removes duplicate by code + term + name', () => {
    const classes = [
      { id: 'c1', code: 'CS 61A', term: 'Fall 2026', name: 'SICP' },
      { id: 'c2', code: 'CS 61A', term: 'Fall 2026', name: 'SICP' },
    ];
    const result = dedupeClasses(classes);
    expect(result).toHaveLength(1);
  });

  it('keeps classes with different terms', () => {
    const classes = [
      { id: 'c1', code: 'CS 61A', term: 'Fall 2026', name: 'SICP' },
      { id: 'c2', code: 'CS 61A', term: 'Spring 2027', name: 'SICP' },
    ];
    const result = dedupeClasses(classes);
    expect(result).toHaveLength(2);
  });
});

// ─── createExampleCourses ────────────────────────────────────────────

describe('createExampleCourses', () => {
  it('creates CS 61A and DATA C8', () => {
    const courses = createExampleCourses();
    expect(courses).toHaveLength(2);
    expect(courses[0].code).toBe('CS 61A');
    expect(courses[1].code).toBe('DATA C8');
  });

  it('each course has groups, assignments, and buckets', () => {
    const courses = createExampleCourses();
    courses.forEach(c => {
      expect(c.groups.length).toBeGreaterThan(0);
      expect(c.assignments.length).toBeGreaterThan(0);
      expect(c.buckets.length).toBe(13);
    });
  });
});

// ─── createDefaultState ──────────────────────────────────────────────

describe('createDefaultState', () => {
  it('returns a valid state with two example classes', () => {
    const state = createDefaultState();
    expect(state.classes).toHaveLength(2);
    expect(state.activeView).toBe('gradebook');
    expect(state.theme).toBe('black');
    expect(state.defaultGradeDefinitions).toHaveLength(13);
  });
});

// ─── sanitizeClassObject ─────────────────────────────────────────────

describe('sanitizeClassObject', () => {
  it('provides defaults for missing fields', () => {
    const result = sanitizeClassObject({}, 0, UC_BERKELEY_GRADE_DEFINITIONS);
    expect(result.code).toBe('COURSE 101');
    expect(result.units).toBe(4);
    expect(result.pnp).toBe(false);
    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.buckets.length).toBe(13);
  });

  it('preserves valid input', () => {
    const result = sanitizeClassObject({
      id: 'c1',
      code: 'MATH 54',
      name: 'Linear Algebra',
      term: 'Spring 2027',
      units: 3,
      pnp: true,
      groups: [{ id: 'g1', name: 'HW', weight: 50 }],
      assignments: [],
    }, 0, UC_BERKELEY_GRADE_DEFINITIONS);
    expect(result.code).toBe('MATH 54');
    expect(result.units).toBe(3);
    expect(result.pnp).toBe(true);
    expect(result.groups).toHaveLength(1);
  });

  it('remaps assignments to valid groups', () => {
    const result = sanitizeClassObject({
      groups: [{ id: 'g1', name: 'HW', weight: 100 }],
      assignments: [
        { id: 'a1', name: 'Test', groupId: 'invalid_group', earned: 10, available: 20 },
      ],
    }, 0, UC_BERKELEY_GRADE_DEFINITIONS);
    expect(result.assignments[0].groupId).toBe('g1');
  });

  it('extracts code from name when code is missing', () => {
    const result = sanitizeClassObject({
      name: 'CS 61A: SICP',
    }, 0, UC_BERKELEY_GRADE_DEFINITIONS);
    expect(result.code).toBe('CS 61A');
    expect(result.name).toBe('SICP');
  });

  it('reads legacy "possible" and "whatIf" fields', () => {
    const result = sanitizeClassObject({
      groups: [{ id: 'g1', name: 'HW', weight: 100 }],
      assignments: [
        { id: 'a1', name: 'Test', groupId: 'g1', earned: 10, possible: 50, whatIf: 45 },
      ],
    }, 0, UC_BERKELEY_GRADE_DEFINITIONS);
    expect(result.assignments[0].available).toBe(50);
    expect(result.assignments[0].whatIfEarned).toBe(45);
  });
});

// ─── sanitizeState ───────────────────────────────────────────────────

describe('sanitizeState', () => {
  it('returns default state for null input', () => {
    const state = sanitizeState(null);
    expect(state.classes.length).toBeGreaterThanOrEqual(2);
    expect(state.activeView).toBe('gradebook');
  });

  it('sanitizes valid input preserving classes', () => {
    const state = sanitizeState({
      theme: 'midnight',
      locale: 'de-DE',
      classes: [
        {
          id: 'c1',
          code: 'TEST 101',
          name: 'Test',
          term: 'Fall 2026',
          groups: [{ id: 'g1', name: 'HW', weight: 100 }],
          assignments: [],
        },
      ],
    });
    expect(state.theme).toBe('midnight');
    expect(state.locale).toBe('de-DE');
    expect(state.classes).toHaveLength(1);
    expect(state.activeClassId).toBe('c1');
  });

  it('deduplicates classes', () => {
    const state = sanitizeState({
      classes: [
        { id: 'c1', code: 'CS 61A', name: 'SICP', term: 'Fall 2026', groups: [{ id: 'g1', name: 'HW', weight: 100 }] },
        { id: 'c1', code: 'CS 61A', name: 'SICP', term: 'Fall 2026', groups: [{ id: 'g1', name: 'HW', weight: 100 }] },
      ],
    });
    expect(state.classes).toHaveLength(1);
  });

  it('falls back to example courses when classes array is empty', () => {
    const state = sanitizeState({ classes: [] });
    expect(state.classes.length).toBeGreaterThanOrEqual(2);
  });

  it('cleans legacy profile filler values', () => {
    const state = sanitizeState({
      profile: {
        displayName: 'Student Name',
        email: 'student@university.edu',
        institution: 'University Campus',
      },
      classes: [{ id: 'c1', groups: [{ id: 'g1', name: 'HW', weight: 100 }] }],
    });
    expect(state.profile.displayName).toBe('');
    expect(state.profile.email).toBe('');
    expect(state.profile.institution).toBe('');
  });

  it('reads legacy keys: viewMode, language, defaultBuckets, customDefaultScale', () => {
    const state = sanitizeState({
      viewMode: 'unified',
      language: 'fr-FR',
      customDefaultScale: UC_BERKELEY_GRADE_DEFINITIONS,
      classes: [{ id: 'c1', groups: [{ id: 'g1', name: 'HW', weight: 100 }] }],
    });
    expect(state.gradebookViewMode).toBe('unified');
    expect(state.locale).toBe('fr-FR');
  });
});

// ─── loadState / saveState (with mock localStorage) ──────────────────

describe('loadState', () => {
  it('returns default state when storage is empty', () => {
    const storage = createMockStorage();
    const state = loadState(storage);
    expect(state.classes.length).toBeGreaterThanOrEqual(2);
    expect(state.activeView).toBe('gradebook');
  });

  it('loads from current storage key', () => {
    const saved = {
      theme: 'light',
      classes: [
        {
          id: 'c1', code: 'PHYS 101', name: 'Physics',
          term: 'Fall 2026',
          groups: [{ id: 'g1', name: 'Labs', weight: 100 }],
          assignments: [],
        },
      ],
    };
    const storage = createMockStorage({
      [STORAGE_KEY]: JSON.stringify(saved),
    });
    const state = loadState(storage);
    expect(state.theme).toBe('light');
    expect(state.classes).toHaveLength(1);
    expect(state.classes[0].code).toBe('PHYS 101');
  });

  it('migrates from legacy keys when current key is absent', () => {
    const legacyState = {
      classes: [
        {
          id: 'legacy1', code: 'OLD 101', name: 'Old Course',
          term: 'Fall 2025',
          groups: [{ id: 'g1', name: 'Work', weight: 100 }],
          assignments: [],
        },
      ],
    };
    const storage = createMockStorage({
      'gradecraft_state_v3': JSON.stringify(legacyState),
    });
    const state = loadState(storage);
    expect(state.classes.some(c => c.code === 'OLD 101')).toBe(true);
  });

  it('handles corrupted JSON gracefully', () => {
    const storage = createMockStorage({
      [STORAGE_KEY]: 'not valid json{{{',
    });
    const state = loadState(storage);
    expect(state.classes.length).toBeGreaterThanOrEqual(2);
  });
});

describe('saveState', () => {
  it('writes state to storage', () => {
    const storage = createMockStorage();
    const state = createDefaultState();
    saveState(state, storage);
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    expect(saved.classes).toHaveLength(2);
  });
});

// ─── loadGpaPlan / saveGpaPlan ───────────────────────────────────────

describe('GPA Planner storage', () => {
  it('returns empty grades when storage is empty', () => {
    const storage = createMockStorage();
    const plan = loadGpaPlan(storage);
    expect(plan.grades).toEqual({});
  });

  it('round-trips planner grades', () => {
    const storage = createMockStorage();
    const plan = { grades: { c1: 'A', c2: 'B+' } };
    saveGpaPlan(plan, storage);
    const loaded = loadGpaPlan(storage);
    expect(loaded.grades).toEqual({ c1: 'A', c2: 'B+' });
  });

  it('handles corrupted planner data gracefully', () => {
    const storage = createMockStorage({
      [GPA_STORAGE_KEY]: '{{bad json',
    });
    const plan = loadGpaPlan(storage);
    expect(plan.grades).toEqual({});
  });
});
