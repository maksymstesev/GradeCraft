/**
 * Unit tests for GradeCraft calculation functions (src/calc.js).
 *
 * Covers: UC Berkeley GPA, unit weighting, P/NP exclusion, zero-unit classes,
 * ungraded classes, group metrics, bucket resolution, and number formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  isGradedValue,
  normalizeTermName,
  normalizeUnits,
  cloneGradeScale,
  getSortedBuckets,
  resolveBucket,
  computeClassMetrics,
  computeTermSummary,
  getPlannerGradeDef,
  computePlannerSummary,
  formatNumber,
  formatPercent,
} from '../../src/calc.js';

import { UC_BERKELEY_GRADE_DEFINITIONS } from '../../src/constants.js';

// ─── Helper: build a minimal class for testing ───────────────────────

function makeClass(overrides = {}) {
  return {
    id: 'cls_test',
    code: 'TEST 101',
    name: 'Test Course',
    term: 'Fall 2026',
    units: 4,
    pnp: false,
    targetLetter: 'A',
    groups: [
      { id: 'g1', name: 'Homework', weight: 40 },
      { id: 'g2', name: 'Exams', weight: 60 },
    ],
    buckets: cloneGradeScale(UC_BERKELEY_GRADE_DEFINITIONS),
    assignments: [
      { id: 'a1', name: 'HW1', groupId: 'g1', earned: 90, available: 100, whatIfEarned: null },
      { id: 'a2', name: 'Midterm', groupId: 'g2', earned: 85, available: 100, whatIfEarned: null },
    ],
    ...overrides,
  };
}

// ─── isGradedValue ───────────────────────────────────────────────────

describe('isGradedValue', () => {
  it('returns true for numeric values', () => {
    expect(isGradedValue(0)).toBe(true);
    expect(isGradedValue(42)).toBe(true);
    expect(isGradedValue('95')).toBe(true);
    expect(isGradedValue(0.5)).toBe(true);
  });

  it('returns false for null, undefined, empty string, NaN', () => {
    expect(isGradedValue(null)).toBe(false);
    expect(isGradedValue(undefined)).toBe(false);
    expect(isGradedValue('')).toBe(false);
    expect(isGradedValue('abc')).toBe(false);
  });
});

// ─── normalizeTermName ───────────────────────────────────────────────

describe('normalizeTermName', () => {
  it('trims whitespace', () => {
    expect(normalizeTermName('  Fall 2026  ')).toBe('Fall 2026');
  });

  it('defaults to Fall 2026 for empty/null', () => {
    expect(normalizeTermName('')).toBe('Fall 2026');
    expect(normalizeTermName(null)).toBe('Fall 2026');
    expect(normalizeTermName(undefined)).toBe('Fall 2026');
  });
});

// ─── normalizeUnits ──────────────────────────────────────────────────

describe('normalizeUnits', () => {
  it('returns fallback for null/undefined/empty', () => {
    expect(normalizeUnits(null)).toBe(4);
    expect(normalizeUnits(undefined)).toBe(4);
    expect(normalizeUnits('')).toBe(4);
  });

  it('clamps to 20 max', () => {
    expect(normalizeUnits(25)).toBe(20);
  });

  it('returns fallback for negative', () => {
    expect(normalizeUnits(-3)).toBe(4);
  });

  it('rounds to nearest hundredth', () => {
    expect(normalizeUnits(3.456)).toBe(3.46);
  });

  it('allows zero', () => {
    expect(normalizeUnits(0)).toBe(0);
  });

  it('uses custom fallback', () => {
    expect(normalizeUnits(null, 3)).toBe(3);
  });
});

// ─── cloneGradeScale ─────────────────────────────────────────────────

describe('cloneGradeScale', () => {
  it('clones the UC Berkeley scale by default', () => {
    const scale = cloneGradeScale();
    expect(scale).toHaveLength(13);
    expect(scale[0].letter).toBe('A+');
    expect(scale[0].gpa).toBe(4.0);
    expect(scale[12].letter).toBe('F');
    expect(scale[12].gpa).toBe(0.0);
  });

  it('returns a deep copy (not same reference)', () => {
    const scale = cloneGradeScale(UC_BERKELEY_GRADE_DEFINITIONS);
    scale[0].min = 999;
    expect(UC_BERKELEY_GRADE_DEFINITIONS[0].min).toBe(97);
  });

  it('falls back to UCB for empty arrays', () => {
    const scale = cloneGradeScale([]);
    expect(scale).toHaveLength(13);
  });
});

// ─── getSortedBuckets ────────────────────────────────────────────────

describe('getSortedBuckets', () => {
  it('sorts by min descending', () => {
    const buckets = [
      { id: 'f', min: 0 },
      { id: 'a', min: 93 },
      { id: 'b', min: 83 },
    ];
    const sorted = getSortedBuckets(buckets);
    expect(sorted[0].id).toBe('a');
    expect(sorted[1].id).toBe('b');
    expect(sorted[2].id).toBe('f');
  });

  it('handles null/empty input', () => {
    expect(getSortedBuckets(null)).toEqual([]);
    expect(getSortedBuckets([])).toEqual([]);
  });
});

// ─── resolveBucket ───────────────────────────────────────────────────

describe('resolveBucket', () => {
  const scale = cloneGradeScale(UC_BERKELEY_GRADE_DEFINITIONS);

  it('resolves A for 95%', () => {
    const result = resolveBucket(scale, 95);
    expect(result.current.letter).toBe('A');
    expect(result.nextHigher.letter).toBe('A+');
    expect(result.nextLower.letter).toBe('A-');
  });

  it('resolves A+ for 97%', () => {
    const result = resolveBucket(scale, 97);
    expect(result.current.letter).toBe('A+');
    expect(result.nextHigher).toBeNull();
  });

  it('resolves F for 50%', () => {
    const result = resolveBucket(scale, 50);
    expect(result.current.letter).toBe('F');
    expect(result.nextLower).toBeNull();
  });

  it('returns nulls for null percentage', () => {
    const result = resolveBucket(scale, null);
    expect(result.current).toBeNull();
  });

  it('resolves boundary exactly (93% → A)', () => {
    const result = resolveBucket(scale, 93);
    expect(result.current.letter).toBe('A');
  });

  it('resolves just below boundary (92.99% → A-)', () => {
    const result = resolveBucket(scale, 89.9999);
    expect(result.current.letter).toBe('B+');
  });
});

// ─── formatNumber / formatPercent ────────────────────────────────────

describe('formatNumber', () => {
  it('formats basic numbers', () => {
    expect(formatNumber(94.75, 2, 2)).toBe('94.75');
  });

  it('returns -- for null', () => {
    expect(formatNumber(null)).toBe('--');
  });

  it('returns -- for NaN', () => {
    expect(formatNumber(NaN)).toBe('--');
  });

  it('respects decimal args', () => {
    expect(formatNumber(3.0, 2, 2)).toBe('3.00');
  });
});

describe('formatPercent', () => {
  it('formats percentage', () => {
    expect(formatPercent(94.75, 2)).toBe('94.75%');
  });

  it('returns --% for null', () => {
    expect(formatPercent(null)).toBe('--%');
  });
});

// ─── computeClassMetrics ─────────────────────────────────────────────

describe('computeClassMetrics', () => {
  it('computes weighted grade for simple two-group class', () => {
    const cls = makeClass();
    const m = computeClassMetrics(cls);
    // Homework: 90/100 = 90%, weight 40
    // Exams: 85/100 = 85%, weight 60
    // Weighted: (90*40 + 85*60) / (40+60) = (3600+5100)/100 = 87.0%
    expect(m.actualPct).toBeCloseTo(87.0, 1);
    expect(m.actualBucket.current.letter).toBe('B+');
  });

  it('handles all ungraded assignments', () => {
    const cls = makeClass({
      assignments: [
        { id: 'a1', name: 'HW1', groupId: 'g1', earned: null, available: 100, whatIfEarned: null },
      ],
    });
    const m = computeClassMetrics(cls);
    expect(m.actualPct).toBeNull();
    expect(m.actualBucket.current).toBeNull();
  });

  it('computes What-If forecast correctly', () => {
    const cls = makeClass({
      assignments: [
        { id: 'a1', name: 'HW1', groupId: 'g1', earned: 90, available: 100, whatIfEarned: null },
        { id: 'a2', name: 'Midterm', groupId: 'g2', earned: null, available: 100, whatIfEarned: 95 },
      ],
    });
    const m = computeClassMetrics(cls);
    // Actual: only HW1 graded → 90% on weight 40
    expect(m.actualPct).toBeCloseTo(90.0, 1);
    // Forecast: HW1 90% (weight 40) + Midterm What-If 95% (weight 60)
    // = (90*40 + 95*60) / 100 = (3600+5700)/100 = 93.0%
    expect(m.forecastPct).toBeCloseTo(93.0, 1);
    expect(m.forecastBucket.current.letter).toBe('A');
    expect(m.activeWhatIfCount).toBe(1);
  });

  it('tracks per-group metrics', () => {
    const cls = makeClass();
    const m = computeClassMetrics(cls);
    expect(m.groupMap['g1'].actualPct).toBeCloseTo(90.0, 1);
    expect(m.groupMap['g2'].actualPct).toBeCloseTo(85.0, 1);
  });

  it('computes total configured weight', () => {
    const cls = makeClass();
    const m = computeClassMetrics(cls);
    expect(m.totalConfiguredWeight).toBe(100);
  });

  it('handles 0-available assignments gracefully', () => {
    const cls = makeClass({
      assignments: [
        { id: 'a1', name: 'HW1', groupId: 'g1', earned: 10, available: 0, whatIfEarned: null },
      ],
    });
    const m = computeClassMetrics(cls);
    expect(m.actualPct).toBeNull();
  });
});

// ─── computeTermSummary ──────────────────────────────────────────────

describe('computeTermSummary', () => {
  it('computes unit-weighted GPA for graded classes', () => {
    // Class 1: 90% → A- (3.7 GPA), 4 units
    // Class 2: 95% → A  (4.0 GPA), 3 units
    const cls1 = makeClass({
      id: 'c1', units: 4,
      assignments: [
        { id: 'a1', name: 'HW', groupId: 'g1', earned: 90, available: 100, whatIfEarned: null },
        { id: 'a2', name: 'Exam', groupId: 'g2', earned: 90, available: 100, whatIfEarned: null },
      ],
    });
    const cls2 = makeClass({
      id: 'c2', units: 3,
      assignments: [
        { id: 'a1', name: 'HW', groupId: 'g1', earned: 95, available: 100, whatIfEarned: null },
        { id: 'a2', name: 'Exam', groupId: 'g2', earned: 95, available: 100, whatIfEarned: null },
      ],
    });
    const summary = computeTermSummary([cls1, cls2]);
    // cls1: 90% → A- (3.7), cls2: 95% → A (4.0)
    // GPA = (3.7*4 + 4.0*3) / (4+3) = (14.8+12.0)/7 = 26.8/7 ≈ 3.829
    expect(summary.avgGpa).toBeCloseTo(3.829, 2);
    expect(summary.gradedUnits).toBe(7);
    expect(summary.totalUnits).toBe(7);
  });

  it('excludes P/NP classes from GPA', () => {
    const cls1 = makeClass({ id: 'c1', units: 4, pnp: true });
    const cls2 = makeClass({
      id: 'c2', units: 3, pnp: false,
      assignments: [
        { id: 'a1', name: 'HW', groupId: 'g1', earned: 95, available: 100, whatIfEarned: null },
        { id: 'a2', name: 'Exam', groupId: 'g2', earned: 95, available: 100, whatIfEarned: null },
      ],
    });
    const summary = computeTermSummary([cls1, cls2]);
    // Only cls2 counts: 95% → A (4.0), 3 units
    expect(summary.avgGpa).toBeCloseTo(4.0, 1);
    expect(summary.gradedUnits).toBe(3);
    expect(summary.totalUnits).toBe(7);
  });

  it('excludes zero-unit classes from GPA', () => {
    const cls = makeClass({
      units: 0,
      assignments: [
        { id: 'a1', name: 'HW', groupId: 'g1', earned: 50, available: 100, whatIfEarned: null },
        { id: 'a2', name: 'Exam', groupId: 'g2', earned: 50, available: 100, whatIfEarned: null },
      ],
    });
    const summary = computeTermSummary([cls]);
    expect(summary.avgGpa).toBeNull();
    expect(summary.gradedUnits).toBe(0);
  });

  it('returns null GPA when no classes are graded', () => {
    const cls = makeClass({
      assignments: [
        { id: 'a1', name: 'HW', groupId: 'g1', earned: null, available: 100, whatIfEarned: null },
      ],
    });
    const summary = computeTermSummary([cls]);
    expect(summary.avgGpa).toBeNull();
  });
});

// ─── computePlannerSummary ───────────────────────────────────────────

describe('computePlannerSummary', () => {
  const defs = cloneGradeScale(UC_BERKELEY_GRADE_DEFINITIONS);

  it('computes unit-weighted planner GPA', () => {
    const classes = [
      { id: 'c1', units: 4, pnp: false },
      { id: 'c2', units: 3, pnp: false },
    ];
    const grades = { c1: 'A', c2: 'B+' };
    const summary = computePlannerSummary(classes, defs, grades);
    // A = 4.0, B+ = 3.3
    // GPA = (4.0*4 + 3.3*3) / (4+3) = (16+9.9)/7 = 25.9/7 ≈ 3.70
    expect(summary.avg).toBeCloseTo(3.70, 2);
    expect(summary.graded).toBe(2);
    expect(summary.total).toBe(2);
  });

  it('excludes P/NP classes from GPA but counts units', () => {
    const classes = [
      { id: 'c1', units: 4, pnp: true },
      { id: 'c2', units: 3, pnp: false },
    ];
    const grades = { c2: 'A' };
    const summary = computePlannerSummary(classes, defs, grades);
    expect(summary.avg).toBeCloseTo(4.0, 1);
    expect(summary.pnpCount).toBe(1);
    expect(summary.totalUnits).toBe(7);
    expect(summary.gradedUnits).toBe(3);
  });

  it('returns null for no graded classes', () => {
    const classes = [{ id: 'c1', units: 4, pnp: false }];
    const summary = computePlannerSummary(classes, defs, {});
    expect(summary.avg).toBeNull();
  });
});

// ─── getPlannerGradeDef ──────────────────────────────────────────────

describe('getPlannerGradeDef', () => {
  const defs = cloneGradeScale(UC_BERKELEY_GRADE_DEFINITIONS);

  it('returns the matching grade definition', () => {
    const result = getPlannerGradeDef('c1', { c1: 'B+' }, defs);
    expect(result.letter).toBe('B+');
    expect(result.gpa).toBe(3.3);
  });

  it('returns null when class has no planner grade', () => {
    const result = getPlannerGradeDef('c1', {}, defs);
    expect(result).toBeNull();
  });
});
