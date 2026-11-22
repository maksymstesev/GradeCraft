/* Auto-generated browser global — keep in sync with presets.js */
(function (global) {
/** Standard UC letter ↔ grade-point table (A+ = 4.0, same as A). */
const UC_STANDARD_GRADE_POINTS = [
  { letter: 'A+', gpa: 4.0, description: 'Extraordinary' },
  { letter: 'A', gpa: 4.0, description: 'Excellent' },
  { letter: 'A-', gpa: 3.7, description: 'Excellent' },
  { letter: 'B+', gpa: 3.3, description: 'Good' },
  { letter: 'B', gpa: 3.0, description: 'Good' },
  { letter: 'B-', gpa: 2.7, description: 'Good' },
  { letter: 'C+', gpa: 2.3, description: 'Fair' },
  { letter: 'C', gpa: 2.0, description: 'Fair' },
  { letter: 'C-', gpa: 1.7, description: 'Fair' },
  { letter: 'D+', gpa: 1.3, description: 'Barely passing' },
  { letter: 'D', gpa: 1.0, description: 'Barely passing' },
  { letter: 'D-', gpa: 0.7, description: 'Barely passing' },
  { letter: 'F', gpa: 0.0, description: 'Failure' }
];

/** UC San Diego: plus/minus only on A–C; no D+ / D-. */
const UCSD_GRADE_POINTS = [
  { letter: 'A+', gpa: 4.0, description: 'Excellent' },
  { letter: 'A', gpa: 4.0, description: 'Excellent' },
  { letter: 'A-', gpa: 3.7, description: 'Excellent' },
  { letter: 'B+', gpa: 3.3, description: 'Good' },
  { letter: 'B', gpa: 3.0, description: 'Good' },
  { letter: 'B-', gpa: 2.7, description: 'Good' },
  { letter: 'C+', gpa: 2.3, description: 'Fair' },
  { letter: 'C', gpa: 2.0, description: 'Fair' },
  { letter: 'C-', gpa: 1.7, description: 'Fair' },
  { letter: 'D', gpa: 1.0, description: 'Poor (barely passing)' },
  { letter: 'F', gpa: 0.0, description: 'Fail' }
];

/**
 * UC Berkeley Registrar percentage cutoffs (also used as GradeCraft letter-mapping
 * defaults when a campus does not publish campus-wide percentage bands).
 */
const UCB_PERCENT_CUTOFFS = {
  'A+': 97, A: 93, 'A-': 90,
  'B+': 87, B: 83, 'B-': 80,
  'C+': 77, C: 73, 'C-': 70,
  'D+': 67, D: 63, 'D-': 60,
  F: 0
};

/** UCSD letter-mapping cutoffs without D+/D-. */
const UCSD_PERCENT_CUTOFFS = {
  'A+': 97, A: 93, 'A-': 90,
  'B+': 87, B: 83, 'B-': 80,
  'C+': 77, C: 73, 'C-': 70,
  D: 60,
  F: 0
};

const QUARTER_NOTE =
  'This campus uses the quarter system. A typical full course is often 4 quarter units. '
  + 'As a rough transfer guide, 1 semester unit ≈ 1.5 quarter units (1 quarter unit ≈ ⅔ semester unit).';

const SEMESTER_NOTE =
  'This campus uses the semester system. GradeCraft defaults new classes to 4 semester units.';

function buildDefinitions(points, cutoffs) {
  return points.map((row, idx) => ({
    id: `grade_${String(row.letter).toLowerCase().replace('+', 'p').replace('-', 'm')}`,
    letter: row.letter,
    min: cutoffs[row.letter] ?? 0,
    gpa: row.gpa,
    description: row.description || ''
  }));
}

function makePreset({
  id,
  name,
  shortName,
  unitSystem,
  unitNote,
  gradePoints,
  cutoffs,
  cutoffsAreOfficial,
  passMinLetter,
  gpaDecimals,
  sourceUrl,
  sourceLabel,
  lastVerified
}) {
  return {
    id,
    name,
    shortName,
    unitSystem,
    unitNote,
    rounding: { gpaDecimals },
    pnp: {
      excludeFromGpa: true,
      passMinLetter,
      note: `P/NP courses are excluded from GPA. Pass (P) typically requires ${passMinLetter} or better.`
    },
    cutoffsAreOfficial: !!cutoffsAreOfficial,
    cutoffsNote: cutoffsAreOfficial
      ? 'Percentage cutoffs follow the campus registrar grade definitions.'
      : 'This campus does not publish a single campus-wide percentage scale; instructors set cutoffs. GradeCraft uses common UC letter-mapping defaults so the gradebook still works.',
    sourceUrl,
    sourceLabel,
    lastVerified,
    gradeDefinitions: buildDefinitions(gradePoints, cutoffs)
  };
}

const INSTITUTION_PRESETS = [
  makePreset({
    id: 'uc_berkeley',
    name: 'UC Berkeley',
    shortName: 'Berkeley',
    unitSystem: 'semester',
    unitNote: SEMESTER_NOTE,
    gradePoints: UC_STANDARD_GRADE_POINTS,
    cutoffs: UCB_PERCENT_CUTOFFS,
    cutoffsAreOfficial: true,
    passMinLetter: 'C−',
    gpaDecimals: 3,
    sourceUrl: 'https://registrar.berkeley.edu/academic-records-grades/',
    sourceLabel: 'UC Berkeley Registrar — Grades',
    lastVerified: '2026-11-22'
  }),
  makePreset({
    id: 'uc_davis',
    name: 'UC Davis',
    shortName: 'Davis',
    unitSystem: 'quarter',
    unitNote: QUARTER_NOTE,
    gradePoints: UC_STANDARD_GRADE_POINTS,
    cutoffs: UCB_PERCENT_CUTOFFS,
    cutoffsAreOfficial: false,
    passMinLetter: 'C−',
    gpaDecimals: 3,
    sourceUrl: 'https://catalog.ucdavis.edu/academic-information-policies-regulations/grades-grading/',
    sourceLabel: 'UC Davis General Catalog — Grades & Grading',
    lastVerified: '2026-11-22'
  }),
  makePreset({
    id: 'uc_los_angeles',
    name: 'UCLA',
    shortName: 'UCLA',
    unitSystem: 'quarter',
    unitNote: QUARTER_NOTE,
    gradePoints: UC_STANDARD_GRADE_POINTS,
    cutoffs: UCB_PERCENT_CUTOFFS,
    cutoffsAreOfficial: false,
    passMinLetter: 'C',
    gpaDecimals: 3,
    sourceUrl: 'https://catalog.registrar.ucla.edu/Policies-and-Regulations/Academic-Policies/Grades',
    sourceLabel: 'UCLA Registrar Catalog — Grades',
    lastVerified: '2026-11-22'
  }),
  makePreset({
    id: 'uc_san_diego',
    name: 'UC San Diego',
    shortName: 'UCSD',
    unitSystem: 'quarter',
    unitNote: QUARTER_NOTE,
    gradePoints: UCSD_GRADE_POINTS,
    cutoffs: UCSD_PERCENT_CUTOFFS,
    cutoffsAreOfficial: false,
    passMinLetter: 'C−',
    gpaDecimals: 3,
    sourceUrl: 'https://students.ucsd.edu/academics/exams-grades-transcripts/grades/grading-system.html',
    sourceLabel: 'UC San Diego — Grading System',
    lastVerified: '2026-11-22'
  }),
  makePreset({
    id: 'uc_santa_barbara',
    name: 'UC Santa Barbara',
    shortName: 'UCSB',
    unitSystem: 'quarter',
    unitNote: QUARTER_NOTE,
    gradePoints: UC_STANDARD_GRADE_POINTS,
    cutoffs: UCB_PERCENT_CUTOFFS,
    cutoffsAreOfficial: false,
    passMinLetter: 'C',
    gpaDecimals: 3,
    sourceUrl: 'https://engineering.ucsb.edu/undergraduate/academic-advising/grading-gpa',
    sourceLabel: 'UCSB — Grading & GPA',
    lastVerified: '2026-11-22'
  }),
  makePreset({
    id: 'uc_irvine',
    name: 'UC Irvine',
    shortName: 'UCI',
    unitSystem: 'quarter',
    unitNote: QUARTER_NOTE,
    gradePoints: UC_STANDARD_GRADE_POINTS,
    cutoffs: UCB_PERCENT_CUTOFFS,
    cutoffsAreOfficial: false,
    passMinLetter: 'C−',
    gpaDecimals: 3,
    sourceUrl: 'https://www.reg.uci.edu/services/transcripts/notations.html',
    sourceLabel: 'UCI Registrar — Transcript Notations',
    lastVerified: '2026-11-22'
  }),
  makePreset({
    id: 'uc_santa_cruz',
    name: 'UC Santa Cruz',
    shortName: 'UCSC',
    unitSystem: 'quarter',
    unitNote: QUARTER_NOTE,
    gradePoints: UC_STANDARD_GRADE_POINTS,
    cutoffs: UCB_PERCENT_CUTOFFS,
    cutoffsAreOfficial: false,
    passMinLetter: 'C',
    gpaDecimals: 3,
    sourceUrl: 'https://catalog.ucsc.edu/en/current/general-catalog/undergraduate-information/undergraduate-academic-program/evaluating-academic-performance/',
    sourceLabel: 'UCSC Catalog — Evaluating Academic Performance',
    lastVerified: '2026-11-22'
  }),
  makePreset({
    id: 'uc_riverside',
    name: 'UC Riverside',
    shortName: 'UCR',
    unitSystem: 'quarter',
    unitNote: QUARTER_NOTE,
    gradePoints: UC_STANDARD_GRADE_POINTS,
    cutoffs: UCB_PERCENT_CUTOFFS,
    cutoffsAreOfficial: false,
    passMinLetter: 'C',
    gpaDecimals: 3,
    sourceUrl: 'https://www.senate.ucr.edu/regulations/division/full',
    sourceLabel: 'UCR Academic Senate — Divisional Regulations (Grading)',
    lastVerified: '2026-11-22'
  }),
  makePreset({
    id: 'uc_merced',
    name: 'UC Merced',
    shortName: 'Merced',
    unitSystem: 'semester',
    unitNote: SEMESTER_NOTE,
    gradePoints: UC_STANDARD_GRADE_POINTS,
    cutoffs: UCB_PERCENT_CUTOFFS,
    cutoffsAreOfficial: false,
    passMinLetter: 'C−',
    gpaDecimals: 3,
    sourceUrl: 'https://senate.ucmerced.edu/node/991',
    sourceLabel: 'UC Merced Academic Senate — Regulations (Grades)',
    lastVerified: '2026-11-22'
  })
];

const DEFAULT_PRESET_ID = 'uc_berkeley';

function getPresetById(id) {
  return INSTITUTION_PRESETS.find(p => p.id === id) || null;
}

function listPresets() {
  return INSTITUTION_PRESETS.map(p => ({
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    unitSystem: p.unitSystem
  }));
}

/**
 * Validate a preset-shaped object (built-in or imported JSON).
 * @returns {{ ok: boolean, errors: string[], preset?: object }}
 */
function validatePreset(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Preset must be a JSON object.'] };
  }
  if (!raw.id || typeof raw.id !== 'string') errors.push('Missing string id.');
  if (!raw.name || typeof raw.name !== 'string') errors.push('Missing string name.');
  if (!['semester', 'quarter'].includes(raw.unitSystem)) {
    errors.push('unitSystem must be "semester" or "quarter".');
  }
  if (!Array.isArray(raw.gradeDefinitions) || raw.gradeDefinitions.length < 2) {
    errors.push('gradeDefinitions must be an array with at least 2 rows.');
  } else {
    raw.gradeDefinitions.forEach((row, idx) => {
      if (!row || typeof row.letter !== 'string') errors.push(`Row ${idx}: missing letter.`);
      if (!Number.isFinite(Number(row.min))) errors.push(`Row ${idx}: min must be a number.`);
      if (!Number.isFinite(Number(row.gpa))) errors.push(`Row ${idx}: gpa must be a number.`);
    });
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    preset: {
      id: String(raw.id),
      name: String(raw.name),
      shortName: String(raw.shortName || raw.name),
      unitSystem: raw.unitSystem,
      unitNote: String(raw.unitNote || ''),
      rounding: {
        gpaDecimals: Math.max(0, Math.min(4, Number(raw.rounding?.gpaDecimals ?? 3) || 3))
      },
      pnp: {
        excludeFromGpa: raw.pnp?.excludeFromGpa !== false,
        passMinLetter: String(raw.pnp?.passMinLetter || 'C'),
        note: String(raw.pnp?.note || '')
      },
      cutoffsAreOfficial: !!raw.cutoffsAreOfficial,
      cutoffsNote: String(raw.cutoffsNote || ''),
      sourceUrl: String(raw.sourceUrl || ''),
      sourceLabel: String(raw.sourceLabel || ''),
      lastVerified: String(raw.lastVerified || ''),
      gradeDefinitions: raw.gradeDefinitions.map((d, idx) => ({
        id: String(d.id || `grade_${idx}`),
        letter: String(d.letter),
        min: Math.max(0, Math.min(100, Number(d.min) || 0)),
        gpa: Number(d.gpa),
        description: String(d.description || '')
      }))
    }
  };
}

function clonePresetGradeDefinitions(preset) {
  const p = typeof preset === 'string' ? getPresetById(preset) : preset;
  if (!p) return null;
  return p.gradeDefinitions.map(d => ({ ...d }));
}

function exportPresetToJson(preset) {
  const validated = validatePreset(preset);
  if (!validated.ok) throw new Error(validated.errors.join(' '));
  return JSON.stringify(validated.preset, null, 2);
}

function importPresetFromJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || ''));
  } catch {
    return { ok: false, errors: ['Invalid JSON.'] };
  }
  return validatePreset(parsed);
}

/** Detect whether current definitions still match a built-in preset (by letter/gpa/min). */
function matchPresetId(gradeDefinitions) {
  const rows = Array.isArray(gradeDefinitions) ? gradeDefinitions : [];
  for (const preset of INSTITUTION_PRESETS) {
    const defs = preset.gradeDefinitions;
    if (defs.length !== rows.length) continue;
    const same = defs.every((d, i) => {
      const r = rows[i];
      return r
        && String(r.letter) === d.letter
        && Number(r.gpa) === d.gpa
        && Number(r.min) === d.min;
    });
    if (same) return preset.id;
  }
  return 'custom';
}

function getGpaDisplayDecimals(presetOrId, fallback = 2) {
  const p = typeof presetOrId === 'string' ? getPresetById(presetOrId) : presetOrId;
  const n = Number(p?.rounding?.gpaDecimals);
  return Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : fallback;
}

  global.GRADECRAFT_PRESETS = {
    INSTITUTION_PRESETS,
    DEFAULT_PRESET_ID,
    getPresetById,
    listPresets,
    validatePreset,
    clonePresetGradeDefinitions,
    exportPresetToJson,
    importPresetFromJson,
    matchPresetId,
    getGpaDisplayDecimals
  };
})(typeof window !== 'undefined' ? window : globalThis);
