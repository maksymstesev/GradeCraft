/**
 * Rule-based syllabus grading-section parser (v1 — no LLM).
 * Finds name + percent pairs and checks that weights total ~100%.
 */

/** Allowed absolute deviation from 100% before flagging. */
export const WEIGHT_TOTAL_TOLERANCE = 1;

/** Words that usually mean a letter-grade scale row, not an assignment group. */
const LETTER_GRADE_NAME = /^(?:letter\s*grade|grade\s*range|percentage|percent(?:age)?|score|points?|gpa)$/i;
const LETTER_GRADE_LINE = /^(?:[A-F][+\-]?|P|NP|Pass|No\s*Pass)\b/i;
const RANGE_PERCENT = /\d{1,3}(?:\.\d+)?\s*[-–—]\s*\d{1,3}(?:\.\d+)?\s*%/;

/**
 * Normalize a candidate group name for display / dedupe.
 */
export function cleanGroupName(raw) {
  let name = String(raw || '')
    .replace(/^[\s•●◦▪▫\-–—*·]+/, '')
    .replace(/^\d{1,2}[.)]\s*/, '')
    .replace(/\s+/g, ' ')
    .replace(/[:\-–—|,.;]+$/g, '')
    .trim();
  // Strip trailing weight leftovers accidentally captured
  name = name.replace(/\(?\s*\d{1,3}(?:\.\d+)?\s*%\s*\)?$/g, '').trim();
  return name;
}

function looksLikeLetterGradeRow(name, line) {
  if (LETTER_GRADE_NAME.test(name)) return true;
  if (LETTER_GRADE_LINE.test(name)) return true;
  if (RANGE_PERCENT.test(line) && /grade|scale|letter/i.test(line)) return true;
  // "A 90%" / "A+: 97%" style rows
  if (/^[A-F][+\-]?\b/i.test(name) && name.length <= 3) return true;
  return false;
}

function pushUnique(groups, name, weight, sourceLine, warnings) {
  const cleaned = cleanGroupName(name);
  if (!cleaned || cleaned.length < 2) return;
  if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
    warnings.push(`Skipped invalid weight on: "${sourceLine.trim()}"`);
    return;
  }
  if (looksLikeLetterGradeRow(cleaned, sourceLine)) return;

  const key = cleaned.toLowerCase();
  const existing = groups.find(g => g.name.toLowerCase() === key);
  if (existing) {
    // Prefer the later occurrence (often the grading breakdown repeats)
    existing.weight = weight;
    existing.sourceLine = sourceLine.trim();
    return;
  }
  groups.push({
    name: cleaned,
    weight: Math.round(weight * 100) / 100,
    sourceLine: sourceLine.trim()
  });
}

/**
 * Extract pairs from a single line. Returns array of {name, weight}.
 */
export function extractPairsFromLine(line) {
  const raw = String(line || '').trim();
  if (!raw || raw.length < 3) return [];
  // Letter-grade bands like "A: 90-100%" or "80-89%" are not group weights
  if (RANGE_PERCENT.test(raw)) return [];
  if (LETTER_GRADE_LINE.test(raw) && /%/.test(raw)) return [];

  const results = [];

  // Inline list: "Homework (20%), Midterm (25%), Final (55%)"
  const inlineRe = /([A-Za-z][^,%()]{1,60}?)\s*\((\d{1,3}(?:\.\d+)?)\s*%\)/g;
  let inlineMatch;
  const inlineHits = [];
  while ((inlineMatch = inlineRe.exec(raw)) !== null) {
    inlineHits.push({ name: inlineMatch[1], weight: Number(inlineMatch[2]) });
  }
  if (inlineHits.length >= 2) {
    return inlineHits;
  }

  // Name … percent  OR  Name: 20%  OR  Name — 20%  OR  Name (20%)
  const nameThenPct = raw.match(
    /^(?:[\s•●◦▪▫\-–—*·]+|\d{1,2}[.)]\s*)*(.+?)\s*[:\-–—]?\s*\(?\s*(\d{1,3}(?:\.\d+)?)\s*%\s*\)?\s*\.?$/i
  );
  if (nameThenPct) {
    const name = nameThenPct[1].trim();
    // Avoid matching pure "20%" lines or "worth 20%" without a real name
    if (!/^\d/.test(name) && /[A-Za-z]/.test(name)) {
      results.push({ name, weight: Number(nameThenPct[2]) });
      return results;
    }
  }

  // Percent first: "20% Homework" / "20% — Midterm Exam"
  const pctThenName = raw.match(
    /^(?:[\s•●◦▪▫\-–—*·]+|\d{1,2}[.)]\s*)*(\d{1,3}(?:\.\d+)?)\s*%\s*[:\-–—]?\s*(.+?)\s*$/i
  );
  if (pctThenName && /[A-Za-z]/.test(pctThenName[2])) {
    results.push({ name: pctThenName[2].trim(), weight: Number(pctThenName[1]) });
    return results;
  }

  // Tab / multi-space separated: "Homework    20"
  const spaced = raw.match(/^(.+?)(?:\t+|\s{2,})(\d{1,3}(?:\.\d+)?)\s*%?\s*$/);
  if (spaced && /[A-Za-z]/.test(spaced[1]) && !RANGE_PERCENT.test(raw)) {
    results.push({ name: spaced[1].trim(), weight: Number(spaced[2]) });
  }

  return results;
}

/**
 * Summarize whether proposed weights total about 100%.
 */
export function summarizeWeightTotal(groups, tolerance = WEIGHT_TOTAL_TOLERANCE) {
  const list = Array.isArray(groups) ? groups : [];
  const total = list.reduce((sum, g) => sum + (Number(g.weight) || 0), 0);
  const rounded = Math.round(total * 100) / 100;
  const delta = Math.abs(rounded - 100);
  const ok = list.length > 0 && delta <= tolerance;
  let message = '';
  if (list.length === 0) {
    message = 'No assignment-group weights found. Paste the grading breakdown (e.g. “Homework 20%, Midterm 30%, Final 50%”).';
  } else if (ok) {
    message = `Weights total ${rounded}% (within ±${tolerance}% of 100%).`;
  } else if (rounded < 100) {
    message = `Weights total ${rounded}% — ${Math.round((100 - rounded) * 100) / 100}% short of 100%.`;
  } else {
    message = `Weights total ${rounded}% — ${Math.round((rounded - 100) * 100) / 100}% over 100%.`;
  }
  return { total: rounded, ok, message, delta };
}

/**
 * Parse pasted syllabus / grading-section text into proposed groups.
 * @returns {{ groups: Array<{name, weight, sourceLine}>, warnings: string[], total: number, ok: boolean, message: string }}
 */
export function parseSyllabusWeights(text) {
  const warnings = [];
  const groups = [];
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Prefer a "Grading" section if present
  let focused = raw;
  const sectionMatch = raw.match(
    /(?:^|\n)\s*(?:grading|grade\s*breakdown|course\s*grading|assessment|evaluation|components?|weight(?:s|ing)?)\s*[:\n]([\s\S]{20,2500}?)(?=\n\s*(?:schedule|calendar|policies|late\s*work|academic|office\s*hours|textbook|readings|week\s*\d)\b|$)/i
  );
  if (sectionMatch) {
    focused = sectionMatch[1];
  }

  const lines = focused.split('\n');
  lines.forEach(line => {
    extractPairsFromLine(line).forEach(pair => {
      pushUnique(groups, pair.name, pair.weight, line, warnings);
    });
  });

  // If line-based parse found nothing, try the whole text as one inline list
  if (groups.length === 0) {
    extractPairsFromLine(focused.replace(/\n/g, ', ')).forEach(pair => {
      pushUnique(groups, pair.name, pair.weight, pair.name, warnings);
    });
  }

  const summary = summarizeWeightTotal(groups);
  if (groups.length > 0 && !summary.ok) {
    warnings.push(summary.message);
  }

  return {
    groups,
    warnings,
    total: summary.total,
    ok: summary.ok,
    message: summary.message
  };
}

/**
 * Map proposed rows into class group objects (ids assigned by caller via uidFn).
 */
export function proposedGroupsToClassGroups(proposed, { uidFn, createPolicies } = {}) {
  const makeId = typeof uidFn === 'function' ? uidFn : (() => `grp_${Math.random().toString(36).slice(2, 9)}`);
  const policiesFn = typeof createPolicies === 'function'
    ? createPolicies
    : (() => ({
      dropLowest: 0,
      bestOf: 0,
      latePenalty: { enabled: false, percentPerDay: 10, cap: 100 },
      replacement: { enabled: false, sourceAssignmentId: '', targetAssignmentId: '' }
    }));

  return (proposed || [])
    .filter(g => g && cleanGroupName(g.name) && Number(g.weight) > 0)
    .map((g, idx) => ({
      id: makeId(`grp_syll_${idx}`),
      name: cleanGroupName(g.name),
      weight: Math.round(Number(g.weight) * 100) / 100,
      policies: policiesFn()
    }));
}
