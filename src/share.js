/**
 * Share & export helpers — CSV, compressed share payloads, URL limits.
 */

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from './lzstring.js';
import { normalizeTermName, normalizeUnits } from './calc.js';

/** Practical max length for a share fragment before browsers/proxies truncate. */
export const SHARE_LINK_MAX_CHARS = 6000;

export function escapeCsvField(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(rows) {
  return (rows || []).map(row => row.map(escapeCsvField).join(',')).join('\r\n') + '\r\n';
}

/**
 * One CSV row per assignment.
 * Columns: Class Code, Class Title, Term, Units, P/NP, Group, Assignment, Earned, Available, Due, Extra Credit
 */
export function buildAssignmentsCsv(classesList) {
  const header = [
    'Class Code',
    'Class Title',
    'Term',
    'Units',
    'P/NP',
    'Group',
    'Assignment',
    'Earned',
    'Available',
    'Due',
    'Extra Credit'
  ];
  const rows = [header];

  (classesList || []).forEach(cls => {
    const groupsById = Object.fromEntries((cls.groups || []).map(g => [g.id, g]));
    const asgs = cls.assignments || [];
    if (asgs.length === 0) {
      rows.push([
        cls.code || '',
        cls.name || '',
        normalizeTermName(cls.term),
        normalizeUnits(cls.units),
        cls.pnp ? 'yes' : 'no',
        '',
        '',
        '',
        '',
        '',
        ''
      ]);
      return;
    }
    asgs.forEach(a => {
      const group = groupsById[a.groupId];
      rows.push([
        cls.code || '',
        cls.name || '',
        normalizeTermName(cls.term),
        normalizeUnits(cls.units),
        cls.pnp ? 'yes' : 'no',
        group?.name || '',
        a.name || '',
        a.earned === null || a.earned === undefined ? '' : a.earned,
        a.available ?? '',
        a.due || '',
        a.extraCredit ? 'yes' : 'no'
      ]);
    });
  });

  return rowsToCsv(rows);
}

/**
 * Compact planner-focused share payload (default).
 */
export function buildPlannerSharePayload({ classes, gpaPlan, defaultGradeDefinitions, exportedAt } = {}) {
  return {
    v: 1,
    type: 'planner',
    exportedAt: exportedAt || new Date().toISOString(),
    classes: (classes || []).map(c => ({
      id: c.id,
      code: c.code,
      name: c.name,
      term: c.term,
      units: c.units,
      pnp: !!c.pnp
    })),
    gpaPlan: {
      grades: { ...(gpaPlan?.grades || {}) },
      prior: gpaPlan?.prior ? { ...gpaPlan.prior } : { units: 0, gpa: null },
      goal: gpaPlan?.goal ? { ...gpaPlan.goal } : { targetGpa: null, futureUnits: null }
    },
    defaultGradeDefinitions: Array.isArray(defaultGradeDefinitions)
      ? defaultGradeDefinitions.map(d => ({
          id: d.id,
          letter: d.letter,
          min: d.min,
          gpa: d.gpa,
          description: d.description || ''
        }))
      : []
  };
}

export function encodeSharePayload(payload) {
  const json = JSON.stringify(payload);
  return compressToEncodedURIComponent(json);
}

export function decodeSharePayload(encoded) {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(String(encoded));
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) return null;
    if (!Array.isArray(parsed.classes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildShareUrl(baseUrl, encodedPayload) {
  const base = String(baseUrl || '').replace(/#.*$/, '').replace(/\?$/, '');
  const sep = base.endsWith('/') || /index\.html$/i.test(base) ? '' : '/';
  // Prefer hash so nothing is sent to a server as a query param.
  return `${base}${/index\.html$/i.test(base) || base.endsWith('/') ? '' : sep}#/share/${encodedPayload}`;
}

export function extractSharePayloadFromHash(hash) {
  const raw = String(hash || '');
  const match = raw.match(/#\/share\/(.+)$/i) || raw.match(/#share\/(.+)$/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function isSharePayloadTooLong(encoded, maxChars = SHARE_LINK_MAX_CHARS) {
  return String(encoded || '').length > maxChars;
}
