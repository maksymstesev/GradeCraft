/**
 * Unit tests for chart / trend data builders.
 */

import { describe, it, expect } from 'vitest';
import {
  buildGroupPointsBreakdown,
  summarizeGroupPointsBreakdown,
  buildTermGpaSeries,
  buildGradeOverTimeSeries,
  cloneGradeScale,
} from '../../src/calc.js';
import { UC_BERKELEY_GRADE_DEFINITIONS } from '../../src/constants.js';

function makeClass(overrides = {}) {
  return {
    id: 'c1',
    code: 'TEST 1',
    name: 'Test',
    term: 'Fall 2026',
    units: 4,
    pnp: false,
    groups: [
      { id: 'g1', name: 'Homework', weight: 40 },
      { id: 'g2', name: 'Exams', weight: 60 },
    ],
    buckets: cloneGradeScale(UC_BERKELEY_GRADE_DEFINITIONS),
    assignments: [
      { id: 'a1', name: 'HW1', groupId: 'g1', earned: 80, available: 100, whatIfEarned: null, due: '2026-09-01', extraCredit: false },
      { id: 'a2', name: 'HW2', groupId: 'g1', earned: null, available: 100, whatIfEarned: null, due: '2026-09-15', extraCredit: false },
      { id: 'a3', name: 'Midterm', groupId: 'g2', earned: 90, available: 100, whatIfEarned: null, due: '2026-10-01', extraCredit: false },
    ],
    ...overrides,
  };
}

describe('buildGroupPointsBreakdown', () => {
  it('splits earned, lost, and remaining per group', () => {
    const rows = buildGroupPointsBreakdown(makeClass());
    const hw = rows.find(r => r.id === 'g1');
    const ex = rows.find(r => r.id === 'g2');
    expect(hw.earned).toBe(80);
    expect(hw.lost).toBe(20);
    expect(hw.remaining).toBe(100);
    expect(ex.earned).toBe(90);
    expect(ex.lost).toBe(10);
    expect(ex.remaining).toBe(0);
  });

  it('adds extra credit to earned only', () => {
    const cls = makeClass({
      assignments: [
        { id: 'a1', name: 'HW1', groupId: 'g1', earned: 50, available: 50, due: '', extraCredit: false },
        { id: 'ec', name: 'Bonus', groupId: 'g1', earned: 5, available: 5, due: '', extraCredit: true },
      ],
    });
    const hw = buildGroupPointsBreakdown(cls).find(r => r.id === 'g1');
    expect(hw.earned).toBe(55);
    expect(hw.lost).toBe(0);
    expect(hw.remaining).toBe(0);
    expect(hw.total).toBe(50);
  });
});

describe('summarizeGroupPointsBreakdown', () => {
  it('totals across groups', () => {
    const summary = summarizeGroupPointsBreakdown(buildGroupPointsBreakdown(makeClass()));
    expect(summary.earned).toBe(170);
    expect(summary.lost).toBe(30);
    expect(summary.remaining).toBe(100);
  });
});

describe('buildTermGpaSeries', () => {
  const defs = cloneGradeScale(UC_BERKELEY_GRADE_DEFINITIONS);

  it('computes GPA per term in given order', () => {
    const classes = [
      { id: 'c1', term: 'Fall 2026', units: 4, pnp: false },
      { id: 'c2', term: 'Spring 2027', units: 3, pnp: false },
      { id: 'c3', term: 'Fall 2026', units: 4, pnp: false },
    ];
    const grades = { c1: 'A', c2: 'B+', c3: 'A-' };
    const series = buildTermGpaSeries(classes, defs, grades, ['Fall 2026', 'Spring 2027']);
    expect(series).toHaveLength(2);
    // Fall: A 4.0*4 + A- 3.7*4 = 16+14.8=30.8 / 8 = 3.85
    expect(series[0].avg).toBeCloseTo(3.85, 2);
    expect(series[1].avg).toBeCloseTo(3.3, 2);
  });
});

describe('buildGradeOverTimeSeries', () => {
  it('returns running weighted % after each dated scored assignment', () => {
    const series = buildGradeOverTimeSeries(makeClass());
    expect(series).toHaveLength(2); // HW1 then Midterm; HW2 ungraded
    expect(series[0].due).toBe('2026-09-01');
    expect(series[0].name).toBe('HW1');
    // Only HW1 graded in weight 40 → 80%
    expect(series[0].pct).toBeCloseTo(80, 1);
    // HW1 80% w40 + Midterm 90% w60 → (80*40 + 90*60)/100 = 86
    expect(series[1].pct).toBeCloseTo(86, 1);
    expect(series[1].letter).toBeTruthy();
  });

  it('returns empty when no dated scores exist', () => {
    const cls = makeClass({
      assignments: [
        { id: 'a1', name: 'HW1', groupId: 'g1', earned: 80, available: 100, due: '', extraCredit: false },
      ],
    });
    expect(buildGradeOverTimeSeries(cls)).toEqual([]);
  });
});
