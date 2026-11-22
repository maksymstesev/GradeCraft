/**
 * GradeCraft storage / state functions — extracted from index.html for testability.
 * Functions that touch localStorage accept it as a parameter for mockability.
 * Keep in sync with the inline definitions in index.html.
 */

import {
  UC_BERKELEY_GRADE_DEFINITIONS,
  STORAGE_KEY,
  ALL_STORAGE_KEYS,
  GPA_STORAGE_KEY,
  DEFAULT_CLASS_UNITS
} from './constants.js';

import {
  isGradedValue,
  normalizeTermName,
  normalizeUnits,
  cloneGradeScale
} from './calc.js';

// ─── Helpers ─────────────────────────────────────────────────────────

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Profile fields start empty. Older saves stored filler text as a real value — treat it as empty. */
export function cleanLegacyProfileValue(value, legacyFiller) {
  const str = String(value ?? '');
  return str.trim() === legacyFiller ? '' : str;
}

// ─── Deduplication ───────────────────────────────────────────────────

/**
 * Two classes are duplicates when they share an ID, or the same code, term and title
 * (case and extra spaces ignored). Keeps the first occurrence.
 */
export function classDedupeKeys(c) {
  const norm = v => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return {
    id: `ID::${norm(c.id)}`,
    content: `CONTENT::${norm(c.code)}::${norm(normalizeTermName(c.term))}::${norm(c.name)}`
  };
}

export function dedupeClasses(classes) {
  const seenIds = new Set();
  const seenContent = new Set();
  const out = [];
  classes.forEach(c => {
    const keys = classDedupeKeys(c);
    if (seenIds.has(keys.id) || seenContent.has(keys.content)) return;
    seenIds.add(keys.id);
    seenContent.add(keys.content);
    out.push(c);
  });
  return out;
}

// ─── Example / default data ──────────────────────────────────────────

export function createExampleCourses(defaultScale) {
  const scale = cloneGradeScale(defaultScale || UC_BERKELEY_GRADE_DEFINITIONS);
  return [
    {
      id: 'class_cs61a',
      code: 'CS 61A',
      name: 'Structure & Interpretation of Computer Programs',
      term: 'Fall 2026',
      units: 4,
      targetLetter: 'A',
      groups: [
        { id: 'grp_61a_hw',   name: 'Homework & Labs', weight: 15 },
        { id: 'grp_61a_proj', name: 'Projects', weight: 30 },
        { id: 'grp_61a_mt1',  name: 'Midterm 1', weight: 15 },
        { id: 'grp_61a_mt2',  name: 'Midterm 2', weight: 15 },
        { id: 'grp_61a_fin',  name: 'Final Exam', weight: 25 }
      ],
      buckets: cloneGradeScale(scale),
      assignments: [
        { id: 'asg_61a_1', name: 'Lab 01: Functions', groupId: 'grp_61a_hw', earned: 10, available: 10, whatIfEarned: null },
        { id: 'asg_61a_2', name: 'HW 01: Control', groupId: 'grp_61a_hw', earned: 2, available: 2, whatIfEarned: null },
        { id: 'asg_61a_3', name: 'Project 1: Hog', groupId: 'grp_61a_proj', earned: 25, available: 25, whatIfEarned: null },
        { id: 'asg_61a_4', name: 'Project 2: Cats', groupId: 'grp_61a_proj', earned: 24, available: 25, whatIfEarned: null },
        { id: 'asg_61a_5', name: 'Midterm 1', groupId: 'grp_61a_mt1', earned: 36, available: 40, whatIfEarned: null },
        { id: 'asg_61a_6', name: 'Midterm 2', groupId: 'grp_61a_mt2', earned: 35, available: 40, whatIfEarned: null },
        { id: 'asg_61a_7', name: 'Final Exam', groupId: 'grp_61a_fin', earned: null, available: 75, whatIfEarned: 68 }
      ]
    },
    {
      id: 'class_datac8',
      code: 'DATA C8',
      name: 'Foundations of Data Science',
      term: 'Fall 2026',
      units: 4,
      targetLetter: 'A',
      groups: [
        { id: 'grp_c8_lab',  name: 'Labs', weight: 10 },
        { id: 'grp_c8_hw',   name: 'Homeworks', weight: 20 },
        { id: 'grp_c8_proj', name: 'Projects', weight: 25 },
        { id: 'grp_c8_mt',   name: 'Midterm Exam', weight: 20 },
        { id: 'grp_c8_fin',  name: 'Final Exam', weight: 25 }
      ],
      buckets: cloneGradeScale(scale),
      assignments: [
        { id: 'asg_c8_1', name: 'Lab 01: Expressions', groupId: 'grp_c8_lab', earned: 10, available: 10, whatIfEarned: null },
        { id: 'asg_c8_2', name: 'HW 01: Causality', groupId: 'grp_c8_hw', earned: 18, available: 20, whatIfEarned: null },
        { id: 'asg_c8_3', name: 'Project 1: World Progress', groupId: 'grp_c8_proj', earned: 29, available: 30, whatIfEarned: null },
        { id: 'asg_c8_4', name: 'Midterm Exam', groupId: 'grp_c8_mt', earned: 44, available: 50, whatIfEarned: null },
        { id: 'asg_c8_5', name: 'Final Exam', groupId: 'grp_c8_fin', earned: null, available: 100, whatIfEarned: 90 }
      ]
    }
  ];
}

export function createDefaultState() {
  const defaultScale = cloneGradeScale(UC_BERKELEY_GRADE_DEFINITIONS);
  return {
    activeView: 'gradebook',
    activeTermFilter: 'Fall 2026',
    activeClassId: 'class_cs61a',
    gradebookViewMode: 'grouped',
    theme: 'black',
    locale: 'en-US',
    profile: {
      displayName: '',
      email: '',
      institution: '',
      major: ''
    },
    defaultGradeDefinitions: cloneGradeScale(defaultScale),
    classes: createExampleCourses(defaultScale)
  };
}

// ─── Sanitization ────────────────────────────────────────────────────

export function sanitizeClassObject(c, idx, defaultDefs) {
  const safeGroups = Array.isArray(c?.groups) && c.groups.length > 0
    ? c.groups.map((g, gIdx) => ({
        id: String(g?.id || uid(`grp_${gIdx}`)),
        name: String(g?.name ?? `Group ${gIdx + 1}`),
        weight: Math.max(0, Number(g?.weight ?? 0) || 0)
      }))
    : [
        { id: uid('grp_1'), name: 'Assignments', weight: 30 },
        { id: uid('grp_2'), name: 'Midterm Exam', weight: 30 },
        { id: uid('grp_3'), name: 'Final Exam', weight: 40 }
      ];

  const firstGroupId = safeGroups[0].id;
  const validGroupIds = new Set(safeGroups.map(g => g.id));
  const rawBuckets = c?.buckets || c?.gradeScale || defaultDefs;

  const safeAssignments = Array.isArray(c?.assignments)
    ? c.assignments.map((a, aIdx) => {
        const availVal = a?.available !== undefined ? a.available : a?.possible;
        const whatIfVal = a?.whatIfEarned !== undefined ? a.whatIfEarned : a?.whatIf;
        return {
          id: String(a?.id || uid(`asg_${aIdx}`)),
          name: String(a?.name ?? `Assignment ${aIdx + 1}`),
          groupId: validGroupIds.has(a?.groupId) ? a.groupId : firstGroupId,
          earned: isGradedValue(a?.earned) ? Number(a.earned) : null,
          available: Math.max(0.01, Number(availVal ?? 100) || 100),
          whatIfEarned: isGradedValue(whatIfVal) ? Number(whatIfVal) : null
        };
      })
    : [];

  let courseCode = String(c?.code ?? '').trim();
  let courseName = String(c?.name ?? '').trim();
  if (!courseCode && courseName) {
    const splitParts = courseName.split(/[:—-]/);
    if (splitParts.length > 1) {
      courseCode = splitParts[0].trim();
      courseName = splitParts.slice(1).join(':').trim();
    } else {
      courseCode = courseName;
    }
  }

  return {
    id: String(c?.id || uid(`class_${idx}`)),
    code: courseCode || `COURSE ${101 + idx}`,
    name: courseName || `Academic Course ${idx + 1}`,
    term: normalizeTermName(c?.term ?? 'Fall 2026'),
    units: normalizeUnits(c?.units),
    pnp: c?.pnp === true,
    targetLetter: String(c?.targetLetter || c?.targetGrade || 'A'),
    groups: safeGroups,
    buckets: cloneGradeScale(rawBuckets),
    assignments: safeAssignments
  };
}

export function sanitizeState(rawState) {
  const fallback = createDefaultState();
  if (!rawState || typeof rawState !== 'object') return fallback;

  const defaultDefs = cloneGradeScale(
    rawState.defaultGradeDefinitions || rawState.defaultBuckets || rawState.customDefaultScale || UC_BERKELEY_GRADE_DEFINITIONS
  );

  const clean = {
    activeView: 'gradebook',
    activeTermFilter: String(rawState.activeTermFilter || ''),
    activeClassId: String(rawState.activeClassId || ''),
    gradebookViewMode: (rawState.gradebookViewMode === 'unified' || rawState.viewMode === 'unified') ? 'unified' : 'grouped',
    theme: ['black', 'midnight', 'light'].includes(rawState.theme) ? rawState.theme : 'black',
    locale: String(rawState.locale || rawState.language || 'en-US'),
    profile: {
      displayName: cleanLegacyProfileValue(rawState.profile?.displayName, 'Student Name'),
      email: cleanLegacyProfileValue(rawState.profile?.email, 'student@university.edu'),
      institution: cleanLegacyProfileValue(rawState.profile?.institution, 'University Campus'),
      major: String(rawState.profile?.major || '')
    },
    defaultGradeDefinitions: defaultDefs,
    classes: []
  };

  if (Array.isArray(rawState.classes) && rawState.classes.length > 0) {
    clean.classes = dedupeClasses(rawState.classes.map((c, idx) => sanitizeClassObject(c, idx, defaultDefs)));
  } else {
    clean.classes = createExampleCourses(defaultDefs);
  }

  if (clean.classes.length === 0) {
    clean.classes = createExampleCourses(defaultDefs);
  }

  if (!clean.classes.some(c => c.id === clean.activeClassId)) {
    clean.activeClassId = clean.classes[0].id;
  }

  const activeCls = clean.classes.find(c => c.id === clean.activeClassId) || clean.classes[0];
  const allTerms = new Set(clean.classes.map(c => normalizeTermName(c.term)));
  if (clean.activeTermFilter !== 'ALL' && !allTerms.has(clean.activeTermFilter)) {
    clean.activeTermFilter = normalizeTermName(activeCls.term);
  }

  return clean;
}

// ─── localStorage wrappers (injectable for testing) ──────────────────

export function loadState(storage = globalThis.localStorage) {
  try {
    const parseSafe = (key) => {
      try {
        const parsed = JSON.parse(storage.getItem(key) || 'null');
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch {
        return null;
      }
    };
    const currentParsed = parseSafe(STORAGE_KEY);
    const keysToRead = currentParsed ? [STORAGE_KEY] : ALL_STORAGE_KEYS;

    let baseParsed = null;
    const discoveredClasses = [];
    for (const key of keysToRead) {
      const parsed = key === STORAGE_KEY ? currentParsed : parseSafe(key);
      if (!parsed) continue;
      if (!baseParsed) baseParsed = parsed;
      if (Array.isArray(parsed.classes)) {
        parsed.classes.forEach((c, idx) => {
          discoveredClasses.push(sanitizeClassObject(c, idx, UC_BERKELEY_GRADE_DEFINITIONS));
        });
      }
    }

    if (!baseParsed) return createDefaultState();
    if (discoveredClasses.length > 0) {
      baseParsed.classes = discoveredClasses;
    }
    return sanitizeState(baseParsed);
  } catch (err) {
    console.warn('Recovering default state:', err);
    return createDefaultState();
  }
}

export function saveState(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

export function loadGpaPlan(storage = globalThis.localStorage) {
  const grades = {};
  try {
    const raw = storage.getItem(GPA_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.grades && typeof parsed.grades === 'object') {
      Object.keys(parsed.grades).forEach(k => {
        const v = parsed.grades[k];
        if (typeof v === 'string' && v) grades[k] = v;
      });
    }
  } catch {
    // Ignore malformed record
  }
  return { grades };
}

export function saveGpaPlan(gpaPlan, storage = globalThis.localStorage) {
  try {
    storage.setItem(GPA_STORAGE_KEY, JSON.stringify(gpaPlan));
  } catch (err) {
    console.error('Failed to save GPA planner:', err);
  }
}
