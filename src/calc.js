/**
 * GradeCraft calculation functions — extracted from index.html for testability.
 * These are pure functions with no DOM dependencies.
 * Keep in sync with the inline definitions in index.html.
 */

import { UC_BERKELEY_GRADE_DEFINITIONS, DEFAULT_CLASS_UNITS } from './constants.js';

// ─── Primitive helpers ───────────────────────────────────────────────

export function isGradedValue(val) {
  return val !== null && val !== undefined && val !== '' && !isNaN(Number(val));
}

export function normalizeTermName(termStr) {
  const trimmed = String(termStr ?? '').trim();
  return trimmed || 'Fall 2026';
}

export function normalizeUnits(value, fallback = DEFAULT_CLASS_UNITS) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(20, Math.round(n * 100) / 100);
}

// ─── Grade scale helpers ─────────────────────────────────────────────

export function cloneGradeScale(scale) {
  const src = Array.isArray(scale) && scale.length > 0 ? scale : UC_BERKELEY_GRADE_DEFINITIONS;
  return src.map((item, idx) => {
    const ucbMatch = UC_BERKELEY_GRADE_DEFINITIONS.find(u => u.letter === item.letter) || UC_BERKELEY_GRADE_DEFINITIONS[idx] || {};
    return {
      id: String(item.id || ucbMatch.id || `b_${idx}`),
      letter: String(item.letter || ucbMatch.letter || 'F'),
      min: Number(item.min ?? ucbMatch.min ?? 0),
      gpa: item.gpa !== undefined && item.gpa !== null ? Number(item.gpa) : (ucbMatch.gpa ?? 0.0),
      description: String(item.description || ucbMatch.description || '')
    };
  });
}

export function getSortedBuckets(buckets) {
  return [...(buckets || [])].sort((a, b) => Number(b.min) - Number(a.min));
}

export function resolveBucket(buckets, percentage) {
  const sorted = getSortedBuckets(buckets);
  if (sorted.length === 0 || percentage === null || percentage === undefined || isNaN(percentage)) {
    return { current: null, nextHigher: null, nextLower: null };
  }
  const eps = percentage + 1e-9;
  let idx = sorted.findIndex(b => eps >= Number(b.min));
  if (idx === -1) idx = sorted.length - 1;
  return {
    current: sorted[idx],
    nextHigher: idx > 0 ? sorted[idx - 1] : null,
    nextLower: idx < sorted.length - 1 ? sorted[idx + 1] : null
  };
}

// ─── Formatting ──────────────────────────────────────────────────────

export function formatNumber(value, minDecimals = 0, maxDecimals = 2, locale = 'en-US') {
  if (value === null || value === undefined || isNaN(Number(value))) return '--';
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals
    }).format(Number(value));
  } catch {
    return Number(value).toFixed(maxDecimals);
  }
}

export function formatPercent(value, decimals = 2, locale = 'en-US') {
  if (value === null || value === undefined || isNaN(Number(value))) return '--%';
  return `${formatNumber(value, decimals, decimals, locale)}%`;
}

// ─── Class grade computation ─────────────────────────────────────────

export function computeClassMetrics(cls) {
  const groupMap = {};
  let totalConfiguredWeight = 0;

  cls.groups.forEach(g => {
    const w = Math.max(0, Number(g.weight) || 0);
    totalConfiguredWeight += w;
    groupMap[g.id] = {
      id: g.id,
      name: g.name,
      weight: w,
      actualEarned: 0,
      actualAvailable: 0,
      actualPct: null,
      forecastEarned: 0,
      forecastAvailable: 0,
      forecastPct: null,
      totalAllAvailable: 0
    };
  });

  let activeWhatIfCount = 0;

  cls.assignments.forEach(a => {
    const g = groupMap[a.groupId];
    if (!g) return;
    const avail = Math.max(0, Number(a.available) || 0);
    if (avail <= 0) return;
    g.totalAllAvailable += avail;

    const hasActual = isGradedValue(a.earned);
    const hasWhatIf = isGradedValue(a.whatIfEarned);
    if (hasWhatIf) activeWhatIfCount++;

    if (hasActual) {
      g.actualEarned += Number(a.earned);
      g.actualAvailable += avail;
    }
    if (hasWhatIf) {
      g.forecastEarned += Number(a.whatIfEarned);
      g.forecastAvailable += avail;
    } else if (hasActual) {
      g.forecastEarned += Number(a.earned);
      g.forecastAvailable += avail;
    }
  });

  let actualWeightedNumerator = 0;
  let actualActiveWeight = 0;
  let totalActualEarnedPts = 0;
  let totalActualAvailPts = 0;
  let forecastWeightedNumerator = 0;
  let forecastActiveWeight = 0;
  let lockedWeightedContribution = 0;
  let remainingUngradedWeight = 0;

  cls.groups.forEach(grp => {
    const st = groupMap[grp.id];
    totalActualEarnedPts += st.actualEarned;
    totalActualAvailPts += st.actualAvailable;

    if (st.actualAvailable > 0) {
      st.actualPct = (st.actualEarned / st.actualAvailable) * 100;
      actualWeightedNumerator += st.actualPct * st.weight;
      actualActiveWeight += st.weight;
    }
    if (st.forecastAvailable > 0) {
      st.forecastPct = (st.forecastEarned / st.forecastAvailable) * 100;
      forecastWeightedNumerator += st.forecastPct * st.weight;
      forecastActiveWeight += st.weight;
    }
    if (st.totalAllAvailable > 0) {
      const gradedFraction = st.actualAvailable / st.totalAllAvailable;
      const ungradedFraction = Math.max(0, 1 - gradedFraction);
      const currentGroupPct = st.actualPct !== null ? st.actualPct : 0;
      lockedWeightedContribution += (currentGroupPct / 100) * (st.weight * gradedFraction);
      remainingUngradedWeight += st.weight * ungradedFraction;
    } else {
      remainingUngradedWeight += st.weight;
    }
  });

  const actualPct = actualActiveWeight > 0 ? (actualWeightedNumerator / actualActiveWeight) : null;
  const forecastPct = forecastActiveWeight > 0 ? (forecastWeightedNumerator / forecastActiveWeight) : null;
  const actualBucket = resolveBucket(cls.buckets, actualPct);
  const forecastBucket = resolveBucket(cls.buckets, forecastPct);

  return {
    groupMap,
    totalConfiguredWeight,
    actualActiveWeight,
    forecastActiveWeight,
    totalActualEarnedPts,
    totalActualAvailPts,
    actualPct,
    forecastPct,
    actualBucket,
    forecastBucket,
    activeWhatIfCount,
    lockedWeightedContribution,
    remainingUngradedWeight
  };
}

// ─── Term and GPA summaries ──────────────────────────────────────────

/**
 * UC Berkeley GPA: total grade points (course grade points × units) / total graded units.
 * Classes without a grade yet, P/NP classes, or classes with 0 units don't count toward the GPA.
 */
export function computeTermSummary(classesList) {
  let gradePoints = 0;
  let gradedUnits = 0;
  let totalUnits = 0;
  classesList.forEach(c => {
    const units = normalizeUnits(c.units);
    totalUnits += units;
    const m = computeClassMetrics(c);
    if (!c.pnp && units > 0 && m.actualPct !== null && m.actualBucket.current && m.actualBucket.current.gpa !== null && m.actualBucket.current.gpa !== undefined) {
      gradePoints += Number(m.actualBucket.current.gpa) * units;
      gradedUnits += units;
    }
  });
  return {
    count: classesList.length,
    totalUnits,
    gradedUnits,
    avgGpa: gradedUnits > 0 ? (gradePoints / gradedUnits) : null
  };
}

/**
 * GPA Planner summary — takes explicit parameters instead of globals.
 * @param {Array} classesList   - Array of class objects
 * @param {Array} gradeDefinitions - The default grade definitions (sorted high→low)
 * @param {Object} plannerGrades  - Map of classId → letter grade string
 */
export function getPlannerGradeDef(classId, plannerGrades, gradeDefinitions) {
  const letter = plannerGrades[classId];
  if (!letter) return null;
  return (gradeDefinitions || []).find(d => d.letter === letter) || null;
}

export function computePlannerSummary(classesList, gradeDefinitions, plannerGrades) {
  let gradePoints = 0;
  let graded = 0;
  let gradedUnits = 0;
  let totalUnits = 0;
  let gpaUnits = 0;
  let gradable = 0;
  let pnpCount = 0;
  classesList.forEach(c => {
    const units = normalizeUnits(c.units);
    totalUnits += units;
    if (c.pnp) { pnpCount++; return; }
    gradable++;
    gpaUnits += units;
    const def = getPlannerGradeDef(c.id, plannerGrades, gradeDefinitions);
    if (def && def.gpa !== null && def.gpa !== undefined) {
      graded++;
      if (units > 0) {
        gradePoints += Number(def.gpa) * units;
        gradedUnits += units;
      }
    }
  });
  return {
    total: gradable,
    graded,
    totalUnits,
    gpaUnits,
    pnpCount,
    gradedUnits,
    avg: gradedUnits > 0 ? gradePoints / gradedUnits : null
  };
}
