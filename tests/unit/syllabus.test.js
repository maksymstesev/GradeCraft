/**
 * Unit tests for rule-based syllabus weight parsing (no LLM).
 */

import { describe, it, expect } from 'vitest';
import {
  cleanGroupName,
  extractPairsFromLine,
  parseSyllabusWeights,
  summarizeWeightTotal,
  proposedGroupsToClassGroups,
  WEIGHT_TOTAL_TOLERANCE,
} from '../../src/syllabus.js';

describe('cleanGroupName', () => {
  it('strips bullets and trailing punctuation', () => {
    expect(cleanGroupName('• Homework:')).toBe('Homework');
    expect(cleanGroupName('1. Midterm Exam —')).toBe('Midterm Exam');
  });
});

describe('extractPairsFromLine', () => {
  it('parses name-then-percent forms', () => {
    expect(extractPairsFromLine('Homework 20%')).toEqual([{ name: 'Homework', weight: 20 }]);
    expect(extractPairsFromLine('Midterm: 25%')).toEqual([{ name: 'Midterm', weight: 25 }]);
    expect(extractPairsFromLine('Final Exam (30%)')).toEqual([{ name: 'Final Exam', weight: 30 }]);
    expect(extractPairsFromLine('- Projects — 15%')).toEqual([{ name: 'Projects', weight: 15 }]);
  });

  it('parses percent-then-name forms', () => {
    expect(extractPairsFromLine('20% Homework')).toEqual([{ name: 'Homework', weight: 20 }]);
    expect(extractPairsFromLine('25% - Midterm')).toEqual([{ name: 'Midterm', weight: 25 }]);
  });

  it('parses inline comma lists with parentheses', () => {
    const pairs = extractPairsFromLine('Homework (20%), Midterm (30%), Final (50%)');
    expect(pairs).toHaveLength(3);
    expect(pairs[0]).toEqual({ name: 'Homework', weight: 20 });
    expect(pairs[2]).toEqual({ name: 'Final', weight: 50 });
  });

  it('skips letter-grade scale ranges', () => {
    expect(extractPairsFromLine('A: 90-100%')).toEqual([]);
    expect(extractPairsFromLine('Letter grade range 80-89%')).toEqual([]);
  });
});

describe('parseSyllabusWeights', () => {
  it('parses a typical grading breakdown totaling 100%', () => {
    const text = `
Grading
Homework 20%
Labs 10%
Midterm 30%
Final 40%
`;
    const result = parseSyllabusWeights(text);
    expect(result.groups).toHaveLength(4);
    expect(result.groups.map(g => g.name)).toEqual(['Homework', 'Labs', 'Midterm', 'Final']);
    expect(result.total).toBe(100);
    expect(result.ok).toBe(true);
  });

  it('flags totals that are not about 100%', () => {
    const result = parseSyllabusWeights('Homework 20%\nMidterm 20%\nFinal 20%');
    expect(result.groups).toHaveLength(3);
    expect(result.total).toBe(60);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/short of 100%/);
  });

  it('ignores letter grade tables mixed into the paste', () => {
    const text = `
Grading breakdown:
Quizzes: 15%
Projects: 25%
Midterm: 25%
Final: 35%

Letter grades:
A 90-100%
B 80-89%
`;
    const result = parseSyllabusWeights(text);
    expect(result.groups.map(g => g.name)).toEqual(['Quizzes', 'Projects', 'Midterm', 'Final']);
    expect(result.ok).toBe(true);
  });

  it('returns a helpful message when nothing matches', () => {
    const result = parseSyllabusWeights('Welcome to CS 61A. Office hours are TuTh.');
    expect(result.groups).toHaveLength(0);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/No assignment-group/);
  });

  it('dedupes repeated names keeping the later weight', () => {
    const result = parseSyllabusWeights('Homework 10%\nHomework 20%\nMidterm 30%\nFinal 50%');
    const hw = result.groups.find(g => g.name === 'Homework');
    expect(hw.weight).toBe(20);
    expect(result.total).toBe(100);
  });
});

describe('summarizeWeightTotal', () => {
  it('accepts totals within tolerance', () => {
    const summary = summarizeWeightTotal([
      { weight: 33.3 },
      { weight: 33.3 },
      { weight: 33.4 },
    ], WEIGHT_TOTAL_TOLERANCE);
    expect(summary.ok).toBe(true);
  });
});

describe('proposedGroupsToClassGroups', () => {
  it('maps rows to class group objects with policies', () => {
    const groups = proposedGroupsToClassGroups(
      [{ name: 'Homework', weight: 40 }, { name: 'Final', weight: 60 }],
      {
        uidFn: (prefix) => `${prefix}_x`,
        createPolicies: () => ({ dropLowest: 0 }),
      }
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ id: 'grp_syll_0_x', name: 'Homework', weight: 40 });
    expect(groups[0].policies).toEqual({ dropLowest: 0 });
  });
});
