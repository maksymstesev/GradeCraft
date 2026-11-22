/**
 * Unit tests for due dates, Upcoming view helpers, and ICS export.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeDueDate,
  toLocalDateString,
  addDaysToDateString,
  formatDueDateDisplay,
  computeAssignmentWeightAtStake,
  buildUpcomingAssignments,
  buildAssignmentIcsUid,
  buildCalendarEventsFromClasses,
  buildIcsCalendar,
} from '../../src/calc.js';
import { sanitizeClassObject } from '../../src/storage.js';
import { UC_BERKELEY_GRADE_DEFINITIONS, UPCOMING_WINDOW_DAYS } from '../../src/constants.js';

describe('normalizeDueDate', () => {
  it('accepts valid YYYY-MM-DD', () => {
    expect(normalizeDueDate('2026-11-25')).toBe('2026-11-25');
  });

  it('rejects invalid or empty values', () => {
    expect(normalizeDueDate('')).toBe('');
    expect(normalizeDueDate(null)).toBe('');
    expect(normalizeDueDate('11/25/2026')).toBe('');
    expect(normalizeDueDate('2026-13-01')).toBe('');
    expect(normalizeDueDate('2026-02-30')).toBe('');
  });
});

describe('addDaysToDateString / formatDueDateDisplay', () => {
  it('adds days across month boundaries', () => {
    expect(addDaysToDateString('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('formats with locale', () => {
    const formatted = formatDueDateDisplay('2026-11-25', 'en-US');
    expect(formatted).toMatch(/Nov/);
    expect(formatted).toMatch(/25/);
  });
});

describe('computeAssignmentWeightAtStake', () => {
  it('is group weight times share of group points', () => {
    const group = { id: 'g1', weight: 40 };
    const assignments = [
      { id: 'a1', available: 50 },
      { id: 'a2', available: 50 },
    ];
    // 40% * (50/100) = 20
    expect(computeAssignmentWeightAtStake(assignments[0], group, assignments)).toBeCloseTo(20, 5);
  });

  it('returns 0 when group has no points', () => {
    expect(computeAssignmentWeightAtStake({ available: 10 }, { weight: 20 }, [])).toBe(0);
  });
});

describe('buildUpcomingAssignments', () => {
  const classes = [
    {
      id: 'c1',
      code: 'CS 61A',
      name: 'SICP',
      term: 'Fall 2026',
      groups: [{ id: 'g1', name: 'HW', weight: 20 }],
      assignments: [
        { id: 'overdue', name: 'Old HW', groupId: 'g1', earned: null, available: 100, due: '2026-11-01' },
        { id: 'soon', name: 'Soon HW', groupId: 'g1', earned: null, available: 50, due: '2026-11-28' },
        { id: 'graded', name: 'Done', groupId: 'g1', earned: 10, available: 10, due: '2026-11-20' },
        { id: 'far', name: 'Far HW', groupId: 'g1', earned: null, available: 100, due: '2027-01-15' },
        { id: 'nodue', name: 'No Due', groupId: 'g1', earned: null, available: 100, due: '' },
      ],
    },
  ];

  it('includes overdue and next-14-day unscored work, ranked by weight', () => {
    const items = buildUpcomingAssignments(classes, { today: '2026-11-21', windowDays: 14 });
    expect(items.map(i => i.assignmentId)).toEqual(['overdue', 'soon']);
    // overdue has 100 of 260 unscored+graded available in group... wait all assignments count
    // total available = 100+50+10+100+100 = 360
    // overdue stake = 20 * 100/360
    expect(items[0].overdue).toBe(true);
    expect(items[1].overdue).toBe(false);
    expect(items[0].weightAtStake).toBeGreaterThan(items[1].weightAtStake);
  });

  it('uses default window of UPCOMING_WINDOW_DAYS', () => {
    expect(UPCOMING_WINDOW_DAYS).toBe(14);
    const items = buildUpcomingAssignments(classes, { today: '2026-11-21' });
    expect(items.some(i => i.assignmentId === 'soon')).toBe(true);
    expect(items.some(i => i.assignmentId === 'far')).toBe(false);
  });
});

describe('ICS export', () => {
  it('builds stable UIDs', () => {
    expect(buildAssignmentIcsUid('asg_61a_1')).toBe('gradecraft-asg_61a_1@gradecraft.local');
  });

  it('emits all-day VEVENTs with class/weight description', () => {
    const classes = [
      {
        id: 'c1',
        code: 'DATA C8',
        name: 'Foundations',
        groups: [{ id: 'g1', name: 'HW', weight: 20 }],
        assignments: [
          { id: 'a1', name: 'HW 01', groupId: 'g1', available: 20, due: '2026-12-01' },
        ],
      },
    ];
    const events = buildCalendarEventsFromClasses(classes);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe('DATA C8: HW 01');
    expect(events[0].description).toContain('Weight at stake');

    const ics = buildIcsCalendar(events, { now: new Date(Date.UTC(2026, 10, 21, 12, 0, 0)) });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:gradecraft-a1@gradecraft.local');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).toContain('DTEND;VALUE=DATE:20261202');
    expect(ics).toContain('SUMMARY:DATA C8: HW 01');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('escapes commas and semicolons in ICS text', () => {
    const ics = buildIcsCalendar([
      { uid: 'u1', due: '2026-12-01', summary: 'A; B, C', description: 'line1\nline2' },
    ]);
    expect(ics).toContain('SUMMARY:A\\; B\\, C');
    expect(ics).toContain('DESCRIPTION:line1\\nline2');
  });
});

describe('sanitize migrates due field', () => {
  it('adds empty due on legacy assignments', () => {
    const cleaned = sanitizeClassObject({
      code: 'T 1',
      name: 'Test',
      groups: [{ id: 'g1', name: 'HW', weight: 100 }],
      assignments: [{ id: 'a1', name: 'HW1', groupId: 'g1', earned: 1, available: 1 }],
    }, 0, UC_BERKELEY_GRADE_DEFINITIONS);
    expect(cleaned.assignments[0].due).toBe('');
  });

  it('keeps valid due dates', () => {
    const cleaned = sanitizeClassObject({
      code: 'T 1',
      name: 'Test',
      groups: [{ id: 'g1', name: 'HW', weight: 100 }],
      assignments: [{ id: 'a1', name: 'HW1', groupId: 'g1', earned: null, available: 10, due: '2026-12-15' }],
    }, 0, UC_BERKELEY_GRADE_DEFINITIONS);
    expect(cleaned.assignments[0].due).toBe('2026-12-15');
  });
});

describe('toLocalDateString', () => {
  it('formats a fixed local date', () => {
    const d = new Date(2026, 10, 21); // local Nov 21 2026
    expect(toLocalDateString(d)).toBe('2026-11-21');
  });
});
