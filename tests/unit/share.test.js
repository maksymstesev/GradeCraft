/**
 * Unit tests for CSV export and share-link encode/decode.
 */

import { describe, it, expect } from 'vitest';
import {
  escapeCsvField,
  rowsToCsv,
  buildAssignmentsCsv,
  buildPlannerSharePayload,
  encodeSharePayload,
  decodeSharePayload,
  buildShareUrl,
  extractSharePayloadFromHash,
  isSharePayloadTooLong,
  SHARE_LINK_MAX_CHARS,
} from '../../src/share.js';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from '../../src/lzstring.js';

describe('CSV helpers', () => {
  it('escapes commas and quotes', () => {
    expect(escapeCsvField('Hello, world')).toBe('"Hello, world"');
    expect(escapeCsvField('Say "hi"')).toBe('"Say ""hi"""');
    expect(escapeCsvField('plain')).toBe('plain');
  });

  it('joins rows with CRLF', () => {
    expect(rowsToCsv([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2\r\n');
  });

  it('builds one row per assignment with class metadata', () => {
    const csv = buildAssignmentsCsv([
      {
        code: 'CS 61A',
        name: 'SICP',
        term: 'Fall 2026',
        units: 4,
        pnp: false,
        groups: [{ id: 'g1', name: 'HW' }],
        assignments: [
          { name: 'HW 01', groupId: 'g1', earned: 10, available: 10, due: '2026-09-01', extraCredit: false },
          { name: 'Bonus, "extra"', groupId: 'g1', earned: 2, available: 2, due: '', extraCredit: true },
        ],
      },
    ]);
    expect(csv).toContain('Class Code,Class Title,Term,Units');
    expect(csv).toContain('CS 61A,SICP,Fall 2026,4,no,HW,HW 01,10,10,2026-09-01,no');
    expect(csv).toContain('"Bonus, ""extra"""');
  });
});

describe('lz-string URI codec', () => {
  it('round-trips unicode JSON', () => {
    const src = JSON.stringify({ hello: 'café', n: 42 });
    const enc = compressToEncodedURIComponent(src);
    expect(enc).toMatch(/^[A-Za-z0-9+\-$]+$/);
    expect(decompressFromEncodedURIComponent(enc)).toBe(src);
  });
});

describe('share payload', () => {
  it('encodes and decodes a planner payload', () => {
    const payload = buildPlannerSharePayload({
      classes: [{ id: 'c1', code: 'CS 61A', name: 'SICP', term: 'Fall 2026', units: 4, pnp: false }],
      gpaPlan: { grades: { c1: 'A' }, prior: { units: 30, gpa: 3.5 }, goal: { targetGpa: 3.7, futureUnits: 24 } },
      defaultGradeDefinitions: [{ id: 'g', letter: 'A', min: 93, gpa: 4.0 }],
      exportedAt: '2026-11-22T00:00:00.000Z',
    });
    expect(payload.type).toBe('planner');
    const enc = encodeSharePayload(payload);
    const decoded = decodeSharePayload(enc);
    expect(decoded.classes[0].code).toBe('CS 61A');
    expect(decoded.gpaPlan.grades.c1).toBe('A');
    expect(decoded.gpaPlan.prior.gpa).toBe(3.5);
  });

  it('rejects malformed payloads', () => {
    expect(decodeSharePayload('%%%')).toBeNull();
    expect(decodeSharePayload(encodeSharePayload({ v: 2, classes: [] }))).toBeNull();
  });

  it('builds and extracts share URLs', () => {
    const enc = encodeSharePayload(buildPlannerSharePayload({
      classes: [{ id: 'c1', code: 'X', name: 'Y', term: 'Fall 2026', units: 4 }],
      gpaPlan: { grades: {} },
      defaultGradeDefinitions: [],
    }));
    const url = buildShareUrl('https://example.com/GradeCraft/', enc);
    expect(url).toContain('#/share/');
    const extracted = extractSharePayloadFromHash(url.slice(url.indexOf('#')));
    expect(decodeSharePayload(extracted).classes[0].code).toBe('X');
  });

  it('flags oversized payloads', () => {
    expect(isSharePayloadTooLong('x'.repeat(SHARE_LINK_MAX_CHARS + 1))).toBe(true);
    expect(isSharePayloadTooLong('short')).toBe(false);
  });
});
