/**
 * Unit tests for grading policy rules per assignment group.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeGroupPolicies,
  groupPoliciesAreActive,
  computeGroupResult,
  computeClassMetrics,
  cloneGradeScale,
} from '../../src/calc.js';
import { createDefaultGroupPolicies, UC_BERKELEY_GRADE_DEFINITIONS } from '../../src/constants.js';
import { sanitizeClassObject } from '../../src/storage.js';

function makeGroup(overrides = {}) {
  const { policies, ...rest } = overrides;
  return {
    id: 'g1',
    name: 'Homework',
    weight: 100,
    ...rest,
    policies: normalizeGroupPolicies(policies ?? createDefaultGroupPolicies()),
  };
}

function asg(id, earned, available, extras = {}) {
  return {
    id,
    name: id,
    groupId: 'g1',
    earned,
    available,
    whatIfEarned: null,
    extraCredit: false,
    lateDays: 0,
    ...extras,
  };
}

describe('normalizeGroupPolicies', () => {
  it('fills defaults for missing policies (legacy migration)', () => {
    const p = normalizeGroupPolicies(undefined);
    expect(p).toEqual(createDefaultGroupPolicies());
  });

  it('clamps and coerces partial objects', () => {
    const p = normalizeGroupPolicies({
      dropLowest: 2.9,
      bestOf: -1,
      latePenalty: { enabled: true, percentPerDay: 5, cap: 150 },
      replacement: { enabled: true, sourceAssignmentId: 'a', targetAssignmentId: 'b' },
    });
    expect(p.dropLowest).toBe(2);
    expect(p.bestOf).toBe(0);
    expect(p.latePenalty.cap).toBe(100);
    expect(p.latePenalty.enabled).toBe(true);
    expect(p.replacement.sourceAssignmentId).toBe('a');
  });
});

describe('groupPoliciesAreActive', () => {
  it('is false when everything is off', () => {
    expect(groupPoliciesAreActive(createDefaultGroupPolicies(), [])).toBe(false);
  });

  it('is true for drop / best-of / late / replace / extra credit', () => {
    expect(groupPoliciesAreActive({ dropLowest: 1 })).toBe(true);
    expect(groupPoliciesAreActive({ bestOf: 2 })).toBe(true);
    expect(groupPoliciesAreActive({ latePenalty: { enabled: true } })).toBe(true);
    expect(groupPoliciesAreActive({
      replacement: { enabled: true, sourceAssignmentId: 'a1', targetAssignmentId: 'a2' },
    })).toBe(true);
    expect(groupPoliciesAreActive({}, [{ extraCredit: true }])).toBe(true);
  });
});

describe('computeGroupResult — drop lowest', () => {
  it('drops the lowest N percentages', () => {
    const group = makeGroup({ policies: { dropLowest: 1 } });
    const assignments = [
      asg('a1', 100, 100),
      asg('a2', 50, 100),
      asg('a3', 80, 100),
    ];
    const result = computeGroupResult(group, assignments);
    // Drop 50% → (100+80)/200 = 90%
    expect(result.pct).toBeCloseTo(90, 5);
    expect(result.droppedIds).toEqual(['a2']);
    expect(result.earned).toBe(180);
    expect(result.available).toBe(200);
  });
});

describe('computeGroupResult — best of N', () => {
  it('keeps only the best N scores', () => {
    const group = makeGroup({ policies: { bestOf: 2 } });
    const assignments = [
      asg('a1', 60, 100),
      asg('a2', 90, 100),
      asg('a3', 80, 100),
      asg('a4', 70, 100),
    ];
    const result = computeGroupResult(group, assignments);
    // Best 2: 90 and 80 → 170/200 = 85%
    expect(result.pct).toBeCloseTo(85, 5);
    expect(result.droppedIds.sort()).toEqual(['a1', 'a4']);
  });

  it('prefers bestOf over dropLowest when both set', () => {
    const group = makeGroup({ policies: { dropLowest: 1, bestOf: 1 } });
    const assignments = [
      asg('a1', 100, 100),
      asg('a2', 50, 100),
      asg('a3', 80, 100),
    ];
    const result = computeGroupResult(group, assignments);
    expect(result.pct).toBeCloseTo(100, 5);
    expect(result.droppedIds.sort()).toEqual(['a2', 'a3']);
  });
});

describe('computeGroupResult — extra credit', () => {
  it('adds earned points without adding available', () => {
    const group = makeGroup();
    const assignments = [
      asg('a1', 80, 100),
      asg('ec', 10, 10, { extraCredit: true }),
    ];
    const result = computeGroupResult(group, assignments);
    expect(result.earned).toBe(90);
    expect(result.available).toBe(100);
    expect(result.pct).toBeCloseTo(90, 5);
    expect(result.totalAllAvailable).toBe(100);
  });
});

describe('computeGroupResult — late penalty', () => {
  it('applies percent-per-day with a cap before averaging', () => {
    const group = makeGroup({
      policies: {
        latePenalty: { enabled: true, percentPerDay: 10, cap: 30 },
      },
    });
    const assignments = [
      asg('a1', 100, 100, { lateDays: 2 }), // 20% penalty → 80
      asg('a2', 100, 100, { lateDays: 5 }), // would be 50%, capped at 30% → 70
    ];
    const result = computeGroupResult(group, assignments);
    expect(result.earned).toBeCloseTo(150, 5);
    expect(result.available).toBe(200);
    expect(result.pct).toBeCloseTo(75, 5);
  });
});

describe('computeGroupResult — score replacement', () => {
  it('raises the target to the source percentage when higher', () => {
    const group = makeGroup({
      policies: {
        replacement: {
          enabled: true,
          sourceAssignmentId: 'final',
          targetAssignmentId: 'mt',
        },
      },
    });
    const assignments = [
      asg('mt', 60, 100),
      asg('final', 90, 100),
    ];
    const result = computeGroupResult(group, assignments);
    // mt becomes 90%, final stays 90% → 180/200
    expect(result.pct).toBeCloseTo(90, 5);
    expect(result.replacedIds).toEqual(['mt']);
  });

  it('can use a source assignment from another group', () => {
    const group = makeGroup({
      id: 'exams',
      policies: {
        replacement: {
          enabled: true,
          sourceAssignmentId: 'final',
          targetAssignmentId: 'mt',
        },
      },
    });
    const groupAssignments = [asg('mt', 70, 100, { groupId: 'exams' })];
    const allAssignments = [
      ...groupAssignments,
      asg('final', 95, 100, { groupId: 'fin' }),
    ];
    const result = computeGroupResult(group, groupAssignments, { allAssignments });
    expect(result.pct).toBeCloseTo(95, 5);
    expect(result.replacedIds).toEqual(['mt']);
  });

  it('does not lower the target when source is worse', () => {
    const group = makeGroup({
      policies: {
        replacement: {
          enabled: true,
          sourceAssignmentId: 'final',
          targetAssignmentId: 'mt',
        },
      },
    });
    const assignments = [
      asg('mt', 90, 100),
      asg('final', 70, 100),
    ];
    const result = computeGroupResult(group, assignments);
    expect(result.pct).toBeCloseTo(80, 5);
    expect(result.replacedIds).toEqual([]);
  });
});

describe('computeGroupResult — policy order', () => {
  it('applies late → replace → drop → extra credit', () => {
    const group = makeGroup({
      policies: {
        dropLowest: 1,
        latePenalty: { enabled: true, percentPerDay: 10, cap: 100 },
        replacement: {
          enabled: true,
          sourceAssignmentId: 'a3',
          targetAssignmentId: 'a1',
        },
      },
    });
    const assignments = [
      asg('a1', 100, 100, { lateDays: 2 }), // late → 80%, then replaced by a3 (90%) → 90
      asg('a2', 40, 100),                   // lowest → dropped
      asg('a3', 90, 100),
      asg('ec', 5, 5, { extraCredit: true }),
    ];
    const result = computeGroupResult(group, assignments);
    // Keep a1@90 and a3@90, drop a2, +5 EC → earned 185 / avail 200 = 92.5%
    expect(result.droppedIds).toEqual(['a2']);
    expect(result.replacedIds).toEqual(['a1']);
    expect(result.earned).toBeCloseTo(185, 5);
    expect(result.available).toBe(200);
    expect(result.pct).toBeCloseTo(92.5, 5);
  });
});

describe('computeGroupResult — What-If / forecast mode', () => {
  it('uses What-If scores when present', () => {
    const group = makeGroup({ policies: { dropLowest: 1 } });
    const assignments = [
      asg('a1', 100, 100),
      asg('a2', null, 100, { whatIfEarned: 40 }),
      asg('a3', 80, 100),
    ];
    const actual = computeGroupResult(group, assignments, { mode: 'actual' });
    const forecast = computeGroupResult(group, assignments, { mode: 'forecast' });
    // Actual: only a1+a3, dropLowest 1 → keep higher of 100 and 80 → 100%
    expect(actual.pct).toBeCloseTo(100, 5);
    // Forecast: drop 40 → (100+80)/200 = 90%
    expect(forecast.pct).toBeCloseTo(90, 5);
    expect(forecast.forecastIsApproximate).toBe(false);
  });

  it('marks forecast approximate when drop rule + ungraded remain', () => {
    const group = makeGroup({ policies: { dropLowest: 1 } });
    const assignments = [
      asg('a1', 90, 100),
      asg('a2', null, 100),
    ];
    const result = computeGroupResult(group, assignments, { mode: 'actual' });
    expect(result.forecastIsApproximate).toBe(true);
  });
});

describe('computeClassMetrics with policies', () => {
  it('feeds group policies into class weighted grade', () => {
    const cls = {
      id: 'c1',
      buckets: cloneGradeScale(UC_BERKELEY_GRADE_DEFINITIONS),
      groups: [
        makeGroup({ id: 'g1', weight: 100, policies: { dropLowest: 1 } }),
      ],
      assignments: [
        asg('a1', 100, 100),
        asg('a2', 50, 100),
      ],
    };
    const m = computeClassMetrics(cls);
    expect(m.actualPct).toBeCloseTo(100, 5);
    expect(m.droppedAssignmentIds).toEqual(['a2']);
  });
});

describe('sanitizeClassObject migrates policies', () => {
  it('adds default policies and assignment flags to legacy saves', () => {
    const cleaned = sanitizeClassObject({
      code: 'TEST 1',
      name: 'Test',
      groups: [{ id: 'g1', name: 'HW', weight: 100 }],
      assignments: [{ id: 'a1', name: 'HW1', groupId: 'g1', earned: 10, available: 10 }],
    }, 0, UC_BERKELEY_GRADE_DEFINITIONS);

    expect(cleaned.groups[0].policies).toEqual(createDefaultGroupPolicies());
    expect(cleaned.assignments[0].extraCredit).toBe(false);
    expect(cleaned.assignments[0].lateDays).toBe(0);
  });
});
