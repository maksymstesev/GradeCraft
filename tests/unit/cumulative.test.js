/**
 * Unit tests for cumulative GPA and goal calculator.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePriorCredit,
  normalizeGoalInputs,
  computePriorGradePoints,
  computeCumulativeGpa,
  computeGoalGpaNeeded,
  computePlannerSummary,
  cloneGradeScale,
} from '../../src/calc.js';
import { UC_BERKELEY_GRADE_DEFINITIONS } from '../../src/constants.js';
import {
  createDefaultGpaPlan,
  sanitizeGpaPlan,
  loadGpaPlan,
  saveGpaPlan,
} from '../../src/storage.js';
import { GPA_STORAGE_KEY } from '../../src/constants.js';

function createMockStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => key in store ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    _store: store,
  };
}

describe('normalizePriorCredit', () => {
  it('defaults to unused prior', () => {
    expect(normalizePriorCredit(null)).toEqual({ units: 0, gpa: null });
  });

  it('parses units and GPA', () => {
    expect(normalizePriorCredit({ units: 30, gpa: 3.5 })).toEqual({ units: 30, gpa: 3.5 });
  });
});

describe('computePriorGradePoints', () => {
  it('returns units × GPA', () => {
    expect(computePriorGradePoints({ units: 30, gpa: 3.5 })).toBeCloseTo(105, 5);
  });

  it('returns 0 when GPA unset', () => {
    expect(computePriorGradePoints({ units: 30, gpa: null })).toBe(0);
  });
});

describe('computeCumulativeGpa', () => {
  it('combines planner and prior credit', () => {
    const cumulative = computeCumulativeGpa(
      { gradePoints: 16, gradedUnits: 4 }, // A in 4 units
      { units: 30, gpa: 3.5 }
    );
    // (16 + 105) / (4 + 30) = 121 / 34 ≈ 3.5588
    expect(cumulative.avg).toBeCloseTo(121 / 34, 5);
    expect(cumulative.gradedUnits).toBe(34);
    expect(cumulative.priorActive).toBe(true);
  });

  it('ignores prior units when GPA is unset', () => {
    const cumulative = computeCumulativeGpa(
      { gradePoints: 16, gradedUnits: 4 },
      { units: 30, gpa: null }
    );
    expect(cumulative.avg).toBeCloseTo(4.0, 5);
    expect(cumulative.gradedUnits).toBe(4);
    expect(cumulative.priorActive).toBe(false);
  });

  it('works with prior only (no planner grades)', () => {
    const cumulative = computeCumulativeGpa(
      { gradePoints: 0, gradedUnits: 0 },
      { units: 60, gpa: 3.2 }
    );
    expect(cumulative.avg).toBeCloseTo(3.2, 5);
  });
});

describe('computeGoalGpaNeeded', () => {
  const current = { gradePoints: 105, gradedUnits: 30, avg: 3.5 }; // from prior alone

  it('computes needed average on future units', () => {
    // Target 3.7 with 30 current @ 3.5 and 30 future:
    // needed = (3.7*(30+30) - 105) / 30 = (222 - 105) / 30 = 3.9
    const result = computeGoalGpaNeeded(current, { targetGpa: 3.7, futureUnits: 30 });
    expect(result.status).toBe('ok');
    expect(result.neededGpa).toBeCloseTo(3.9, 5);
  });

  it('flags unreachable when needed > 4.0', () => {
    // Target 4.0 with 30 @ 3.0 and 10 future → needed = (4*40 - 90)/10 = 7.0
    const result = computeGoalGpaNeeded(
      { gradePoints: 90, gradedUnits: 30 },
      { targetGpa: 4.0, futureUnits: 10 }
    );
    expect(result.status).toBe('unreachable_above_max');
    expect(result.neededGpa).toBeCloseTo(7.0, 5);
    expect(result.maxPossible).toBeCloseTo((90 + 40) / 40, 5);
  });

  it('flags already met when needed ≤ 0', () => {
    // 30 units @ 4.0; even 0.0 on 10 future units keeps cumulative ≥ 3.0
    // needed = (3.0*40 - 120) / 10 = 0
    const result = computeGoalGpaNeeded(
      { gradePoints: 120, gradedUnits: 30 },
      { targetGpa: 3.0, futureUnits: 10 }
    );
    expect(result.status).toBe('already_met');
    expect(result.neededGpa).toBeCloseTo(0, 5);
  });

  it('handles zero future units', () => {
    const met = computeGoalGpaNeeded(current, { targetGpa: 3.0, futureUnits: 0 });
    expect(met.status).toBe('already_met');
    const miss = computeGoalGpaNeeded(current, { targetGpa: 3.9, futureUnits: 0 });
    expect(miss.status).toBe('unreachable_zero_future');
  });

  it('returns incomplete when inputs missing', () => {
    expect(computeGoalGpaNeeded(current, { targetGpa: null, futureUnits: 10 }).status).toBe('incomplete');
    expect(computeGoalGpaNeeded(current, { targetGpa: 3.7, futureUnits: null }).status).toBe('incomplete');
  });

  it('matches the document formula with prior-only current', () => {
    // G_needed = (G_target*(U_prior+U_future) - GP_prior) / U_future
    const prior = { units: 45, gpa: 3.4 };
    const gp = computePriorGradePoints(prior);
    const cum = computeCumulativeGpa({ gradePoints: 0, gradedUnits: 0 }, prior);
    const result = computeGoalGpaNeeded(cum, { targetGpa: 3.6, futureUnits: 15 });
    const expected = (3.6 * (45 + 15) - gp) / 15;
    expect(result.neededGpa).toBeCloseTo(expected, 8);
  });
});

describe('computePlannerSummary exposes gradePoints', () => {
  it('returns grade points for cumulative math', () => {
    const defs = cloneGradeScale(UC_BERKELEY_GRADE_DEFINITIONS);
    const summary = computePlannerSummary(
      [{ id: 'c1', units: 4, pnp: false }],
      defs,
      { c1: 'A' }
    );
    expect(summary.gradePoints).toBeCloseTo(16, 5);
    expect(summary.avg).toBeCloseTo(4.0, 5);
  });
});

describe('GPA plan sanitize / migration', () => {
  it('fills prior and goal defaults for legacy grades-only saves', () => {
    const cleaned = sanitizeGpaPlan({ grades: { c1: 'B+' } });
    expect(cleaned.grades).toEqual({ c1: 'B+' });
    expect(cleaned.prior).toEqual({ units: 0, gpa: null });
    expect(cleaned.goal).toEqual({ targetGpa: null, futureUnits: null });
  });

  it('accepts prior gradePoints as an alternate input', () => {
    const cleaned = sanitizeGpaPlan({
      grades: {},
      prior: { units: 20, gradePoints: 70 },
    });
    expect(cleaned.prior.gpa).toBeCloseTo(3.5, 5);
  });

  it('round-trips prior and goal through storage', () => {
    const storage = createMockStorage();
    const plan = {
      grades: { c1: 'A' },
      prior: { units: 30, gpa: 3.5 },
      goal: { targetGpa: 3.7, futureUnits: 24 },
    };
    saveGpaPlan(plan, storage);
    const loaded = loadGpaPlan(storage);
    expect(loaded.prior).toEqual({ units: 30, gpa: 3.5 });
    expect(loaded.goal).toEqual({ targetGpa: 3.7, futureUnits: 24 });
    expect(loaded.grades).toEqual({ c1: 'A' });
  });

  it('createDefaultGpaPlan returns empty structure', () => {
    const plan = createDefaultGpaPlan();
    expect(plan.grades).toEqual({});
    expect(plan.prior).toEqual({ units: 0, gpa: null });
    expect(plan.goal).toEqual({ targetGpa: null, futureUnits: null });
    expect(typeof plan.updatedAt).toBe('string');
    expect(Number.isFinite(Date.parse(plan.updatedAt))).toBe(true);
  });

  it('loads empty plan when storage key missing', () => {
    const storage = createMockStorage();
    const loaded = loadGpaPlan(storage);
    expect(loaded.grades).toEqual({});
    expect(loaded.prior).toEqual({ units: 0, gpa: null });
    expect(loaded.goal).toEqual({ targetGpa: null, futureUnits: null });
    expect(storage.getItem(GPA_STORAGE_KEY)).toBeNull();
  });
});

describe('normalizeGoalInputs', () => {
  it('parses and clamps negatives', () => {
    expect(normalizeGoalInputs({ targetGpa: -1, futureUnits: -5 })).toEqual({
      targetGpa: 0,
      futureUnits: 0,
    });
  });
});
