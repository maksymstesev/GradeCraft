/**
 * GradeCraft calculation functions — extracted from index.html for testability.
 * These are pure functions with no DOM dependencies.
 * Keep in sync with the inline definitions in index.html.
 */

import {
  UC_BERKELEY_GRADE_DEFINITIONS,
  DEFAULT_CLASS_UNITS,
  createDefaultGroupPolicies
} from './constants.js';

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

// ─── Group policies ──────────────────────────────────────────────────

export function normalizeGroupPolicies(raw) {
  const defaults = createDefaultGroupPolicies();
  if (!raw || typeof raw !== 'object') return defaults;
  const late = raw.latePenalty && typeof raw.latePenalty === 'object' ? raw.latePenalty : {};
  const repl = raw.replacement && typeof raw.replacement === 'object' ? raw.replacement : {};
  return {
    dropLowest: Math.max(0, Math.floor(Number(raw.dropLowest) || 0)),
    bestOf: Math.max(0, Math.floor(Number(raw.bestOf) || 0)),
    latePenalty: {
      enabled: late.enabled === true,
      percentPerDay: Math.max(0, Number(late.percentPerDay ?? defaults.latePenalty.percentPerDay) || 0),
      cap: Math.max(0, Math.min(100, Number(late.cap ?? defaults.latePenalty.cap) || 0))
    },
    replacement: {
      enabled: repl.enabled === true,
      sourceAssignmentId: String(repl.sourceAssignmentId || ''),
      targetAssignmentId: String(repl.targetAssignmentId || '')
    }
  };
}

export function groupPoliciesAreActive(policies, assignmentsInGroup = []) {
  const p = normalizeGroupPolicies(policies);
  if (p.dropLowest > 0) return true;
  if (p.bestOf > 0) return true;
  if (p.latePenalty.enabled) return true;
  if (p.replacement.enabled && p.replacement.sourceAssignmentId && p.replacement.targetAssignmentId) return true;
  if ((assignmentsInGroup || []).some(a => a.extraCredit === true)) return true;
  return false;
}

export function describeActiveGroupPolicies(policies, assignmentsInGroup = []) {
  const p = normalizeGroupPolicies(policies);
  const labels = [];
  if (p.dropLowest > 0) labels.push(`Drop lowest ${p.dropLowest}`);
  if (p.bestOf > 0) labels.push(`Best ${p.bestOf}`);
  if (p.latePenalty.enabled) labels.push(`Late −${formatNumber(p.latePenalty.percentPerDay, 0, 1)}%/day`);
  if (p.replacement.enabled && p.replacement.sourceAssignmentId && p.replacement.targetAssignmentId) {
    labels.push('Score replace');
  }
  const ecCount = (assignmentsInGroup || []).filter(a => a.extraCredit === true).length;
  if (ecCount > 0) labels.push(ecCount === 1 ? '1 extra credit' : `${ecCount} extra credit`);
  return labels;
}

function getModeScore(assignment, mode) {
  if (mode === 'forecast') {
    if (isGradedValue(assignment.whatIfEarned)) return Number(assignment.whatIfEarned);
    if (isGradedValue(assignment.earned)) return Number(assignment.earned);
    return null;
  }
  return isGradedValue(assignment.earned) ? Number(assignment.earned) : null;
}

function applyLatePenaltyToScore(earned, lateDays, latePolicy) {
  if (!latePolicy?.enabled) return earned;
  const days = Math.max(0, Number(lateDays) || 0);
  if (days <= 0) return earned;
  const perDay = Math.max(0, Number(latePolicy.percentPerDay) || 0);
  const cap = Math.max(0, Math.min(100, Number(latePolicy.cap) || 0));
  const penaltyPct = Math.min(cap, days * perDay);
  return Math.max(0, earned * (1 - penaltyPct / 100));
}

function resolveAssignmentLatePolicy(assignment, group, groupsById) {
  const ownGroup = groupsById?.[assignment.groupId] || group;
  return normalizeGroupPolicies(ownGroup?.policies).latePenalty;
}

/**
 * Pure group scoring with policies applied in fixed order:
 * late penalty → replacement → drop lowest OR best-of → extra credit.
 *
 * @param {object} group
 * @param {Array} groupAssignments - assignments belonging to this group
 * @param {object} [options]
 * @param {'actual'|'forecast'} [options.mode]
 * @param {Array} [options.allAssignments] - full class list (for cross-group replacement sources)
 * @param {Object} [options.groupsById] - map of groupId → group (for source late penalties)
 */
export function computeGroupResult(group, groupAssignments, options = {}) {
  const mode = options.mode === 'forecast' ? 'forecast' : 'actual';
  const allAssignments = Array.isArray(options.allAssignments) ? options.allAssignments : groupAssignments;
  const groupsById = options.groupsById || {};
  const policies = normalizeGroupPolicies(group?.policies);

  const items = [];
  let totalAllAvailable = 0;
  let gradedAvailableBeforeDrop = 0;

  (groupAssignments || []).forEach(a => {
    const available = Math.max(0, Number(a.available) || 0);
    const isExtraCredit = a.extraCredit === true;
    if (!isExtraCredit && available > 0) totalAllAvailable += available;

    const rawScore = getModeScore(a, mode);
    if (rawScore === null) {
      items.push({
        id: a.id,
        available,
        earned: null,
        isExtraCredit,
        scored: false,
        dropped: false,
        replaced: false
      });
      return;
    }

    const latePolicy = resolveAssignmentLatePolicy(a, group, groupsById);
    const earnedAfterLate = applyLatePenaltyToScore(rawScore, a.lateDays, latePolicy);
    if (!isExtraCredit && available > 0) gradedAvailableBeforeDrop += available;

    items.push({
      id: a.id,
      available,
      earned: earnedAfterLate,
      isExtraCredit,
      scored: true,
      dropped: false,
      replaced: false
    });
  });

  // Replacement: source score % can raise the target's effective % (target keeps its available).
  if (
    policies.replacement.enabled &&
    policies.replacement.sourceAssignmentId &&
    policies.replacement.targetAssignmentId
  ) {
    const sourceAsg = allAssignments.find(a => a.id === policies.replacement.sourceAssignmentId);
    const targetItem = items.find(i => i.id === policies.replacement.targetAssignmentId);
    if (sourceAsg && targetItem && targetItem.scored && targetItem.available > 0 && !targetItem.isExtraCredit) {
      const sourceRaw = getModeScore(sourceAsg, mode);
      const sourceAvail = Math.max(0, Number(sourceAsg.available) || 0);
      if (sourceRaw !== null && sourceAvail > 0) {
        const sourceLate = resolveAssignmentLatePolicy(sourceAsg, group, groupsById);
        const sourceEarned = applyLatePenaltyToScore(sourceRaw, sourceAsg.lateDays, sourceLate);
        const sourcePct = (sourceEarned / sourceAvail) * 100;
        const targetPct = (targetItem.earned / targetItem.available) * 100;
        if (sourcePct > targetPct + 1e-12) {
          targetItem.earned = (sourcePct / 100) * targetItem.available;
          targetItem.replaced = true;
        }
      }
    }
  }

  // Drop lowest OR best-of (bestOf wins when both are set).
  const regularScored = items.filter(i => i.scored && !i.isExtraCredit && i.available > 0);
  const dropCount = policies.bestOf > 0
    ? Math.max(0, regularScored.length - policies.bestOf)
    : Math.min(policies.dropLowest, regularScored.length);

  if (dropCount > 0) {
    const ranked = [...regularScored].sort((a, b) => {
      const pa = a.earned / a.available;
      const pb = b.earned / b.available;
      if (pa !== pb) return pa - pb;
      return String(a.id).localeCompare(String(b.id));
    });
    ranked.slice(0, dropCount).forEach(item => {
      item.dropped = true;
    });
  }

  let earned = 0;
  let available = 0;
  const droppedIds = [];
  const replacedIds = [];

  items.forEach(item => {
    if (item.replaced) replacedIds.push(item.id);
    if (item.dropped) {
      droppedIds.push(item.id);
      return;
    }
    if (!item.scored) return;
    if (item.isExtraCredit) {
      earned += item.earned;
      return;
    }
    if (item.available <= 0) return;
    earned += item.earned;
    available += item.available;
  });

  const pct = available > 0 ? (earned / available) * 100 : null;
  const hasDropOrBestOf = policies.dropLowest > 0 || policies.bestOf > 0;
  const hasUngradedRegular = items.some(i => !i.scored && !i.isExtraCredit && i.available > 0);

  return {
    earned,
    available,
    pct,
    totalAllAvailable,
    gradedAvailableBeforeDrop,
    droppedIds,
    replacedIds,
    hasActivePolicies: groupPoliciesAreActive(policies, groupAssignments),
    forecastIsApproximate: hasDropOrBestOf && hasUngradedRegular
  };
}

// ─── Class grade computation ─────────────────────────────────────────

export function computeClassMetrics(cls) {
  const groupMap = {};
  let totalConfiguredWeight = 0;
  const groupsById = {};

  cls.groups.forEach(g => {
    const w = Math.max(0, Number(g.weight) || 0);
    totalConfiguredWeight += w;
    const normalized = {
      ...g,
      policies: normalizeGroupPolicies(g.policies)
    };
    groupsById[g.id] = normalized;
    groupMap[g.id] = {
      id: g.id,
      name: g.name,
      weight: w,
      policies: normalized.policies,
      actualEarned: 0,
      actualAvailable: 0,
      actualPct: null,
      forecastEarned: 0,
      forecastAvailable: 0,
      forecastPct: null,
      totalAllAvailable: 0,
      gradedAvailableBeforeDrop: 0,
      droppedIds: [],
      replacedIds: [],
      hasActivePolicies: false,
      forecastIsApproximate: false
    };
  });

  let activeWhatIfCount = 0;
  cls.assignments.forEach(a => {
    if (isGradedValue(a.whatIfEarned)) activeWhatIfCount++;
  });

  let actualWeightedNumerator = 0;
  let actualActiveWeight = 0;
  let totalActualEarnedPts = 0;
  let totalActualAvailPts = 0;
  let forecastWeightedNumerator = 0;
  let forecastActiveWeight = 0;
  let lockedWeightedContribution = 0;
  let remainingUngradedWeight = 0;
  let forecastIsApproximate = false;
  const allDroppedIds = new Set();
  const allReplacedIds = new Set();

  cls.groups.forEach(grp => {
    const st = groupMap[grp.id];
    const groupAssignments = cls.assignments.filter(a => a.groupId === grp.id);
    const actual = computeGroupResult(groupsById[grp.id], groupAssignments, {
      mode: 'actual',
      allAssignments: cls.assignments,
      groupsById
    });
    const forecast = computeGroupResult(groupsById[grp.id], groupAssignments, {
      mode: 'forecast',
      allAssignments: cls.assignments,
      groupsById
    });

    st.actualEarned = actual.earned;
    st.actualAvailable = actual.available;
    st.actualPct = actual.pct;
    st.forecastEarned = forecast.earned;
    st.forecastAvailable = forecast.available;
    st.forecastPct = forecast.pct;
    st.totalAllAvailable = actual.totalAllAvailable;
    st.gradedAvailableBeforeDrop = actual.gradedAvailableBeforeDrop;
    st.droppedIds = actual.droppedIds;
    st.replacedIds = actual.replacedIds;
    st.hasActivePolicies = actual.hasActivePolicies;
    st.forecastIsApproximate = actual.forecastIsApproximate || forecast.forecastIsApproximate;

    actual.droppedIds.forEach(id => allDroppedIds.add(id));
    actual.replacedIds.forEach(id => allReplacedIds.add(id));
    if (st.forecastIsApproximate) forecastIsApproximate = true;

    totalActualEarnedPts += st.actualEarned;
    totalActualAvailPts += st.actualAvailable;

    if (st.actualAvailable > 0 && st.actualPct !== null) {
      actualWeightedNumerator += st.actualPct * st.weight;
      actualActiveWeight += st.weight;
    }
    if (st.forecastAvailable > 0 && st.forecastPct !== null) {
      forecastWeightedNumerator += st.forecastPct * st.weight;
      forecastActiveWeight += st.weight;
    }

    if (st.totalAllAvailable > 0) {
      const gradedFraction = st.gradedAvailableBeforeDrop / st.totalAllAvailable;
      const ungradedFraction = Math.max(0, 1 - gradedFraction);
      const currentGroupPct = st.actualPct !== null ? st.actualPct : 0;
      lockedWeightedContribution += (currentGroupPct / 100) * (st.weight * gradedFraction);
      remainingUngradedWeight += st.weight * ungradedFraction;
    } else if (groupAssignments.some(a => a.extraCredit === true)) {
      // Extra-credit-only group still contributes its weight as remaining until scored.
      if (st.actualPct === null) remainingUngradedWeight += st.weight;
      else lockedWeightedContribution += (st.actualPct / 100) * st.weight;
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
    remainingUngradedWeight,
    forecastIsApproximate,
    droppedAssignmentIds: [...allDroppedIds],
    replacedAssignmentIds: [...allReplacedIds]
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
    gradePoints,
    avg: gradedUnits > 0 ? gradePoints / gradedUnits : null
  };
}

// ─── Cumulative GPA + goal calculator ────────────────────────────────

/** Normalize prior credit (units + GPA). Empty GPA means prior is unused. */
export function normalizePriorCredit(raw) {
  const unitsRaw = raw?.units;
  const gpaRaw = raw?.gpa;
  const units = unitsRaw === null || unitsRaw === undefined || unitsRaw === ''
    ? 0
    : Math.max(0, Number(unitsRaw) || 0);
  let gpa = null;
  if (gpaRaw !== null && gpaRaw !== undefined && gpaRaw !== '' && Number.isFinite(Number(gpaRaw))) {
    gpa = Math.max(0, Number(gpaRaw));
  }
  return { units, gpa };
}

export function normalizeGoalInputs(raw) {
  const targetRaw = raw?.targetGpa;
  const futureRaw = raw?.futureUnits;
  let targetGpa = null;
  let futureUnits = null;
  if (targetRaw !== null && targetRaw !== undefined && targetRaw !== '' && Number.isFinite(Number(targetRaw))) {
    targetGpa = Math.max(0, Number(targetRaw));
  }
  if (futureRaw !== null && futureRaw !== undefined && futureRaw !== '' && Number.isFinite(Number(futureRaw))) {
    futureUnits = Math.max(0, Number(futureRaw));
  }
  return { targetGpa, futureUnits };
}

/**
 * Grade points from prior credit. Returns 0 when GPA is unset or units are 0.
 */
export function computePriorGradePoints(prior) {
  const p = normalizePriorCredit(prior);
  if (p.gpa === null || p.units <= 0) return 0;
  return p.gpa * p.units;
}

/**
 * Cumulative GPA = (planner grade points + prior grade points) / (planner units + prior units).
 * Prior units only count when a prior GPA is set.
 */
export function computeCumulativeGpa(plannerSummary, prior) {
  const p = normalizePriorCredit(prior);
  const plannerGP = Number(plannerSummary?.gradePoints) || 0;
  const plannerUnits = Number(plannerSummary?.gradedUnits) || 0;
  const priorActive = p.gpa !== null && p.units > 0;
  const priorUnits = priorActive ? p.units : 0;
  const priorGP = priorActive ? p.gpa * p.units : 0;
  const gradedUnits = plannerUnits + priorUnits;
  const gradePoints = plannerGP + priorGP;
  return {
    priorActive,
    priorUnits,
    priorGradePoints: priorGP,
    plannerUnits,
    plannerGradePoints: plannerGP,
    gradedUnits,
    gradePoints,
    avg: gradedUnits > 0 ? gradePoints / gradedUnits : null
  };
}

/**
 * Average GPA needed on future units to hit a target cumulative GPA.
 * G_needed = (G_target * (U_current + U_future) - GP_current) / U_future
 *
 * @returns {{
 *   status: 'incomplete'|'unreachable_zero_future'|'already_met'|'unreachable_above_max'|'ok',
 *   neededGpa: number|null,
 *   currentAvg: number|null,
 *   currentUnits: number,
 *   currentGradePoints: number,
 *   targetGpa: number|null,
 *   futureUnits: number|null,
 *   maxPossible: number|null
 * }}
 */
export function computeGoalGpaNeeded(cumulative, goal, maxGpa = 4.0) {
  const g = normalizeGoalInputs(goal);
  const currentUnits = Number(cumulative?.gradedUnits) || 0;
  const currentGP = Number(cumulative?.gradePoints) || 0;
  const currentAvg = currentUnits > 0 ? currentGP / currentUnits : null;
  const ceiling = Number.isFinite(Number(maxGpa)) ? Number(maxGpa) : 4.0;

  const base = {
    neededGpa: null,
    currentAvg,
    currentUnits,
    currentGradePoints: currentGP,
    targetGpa: g.targetGpa,
    futureUnits: g.futureUnits,
    maxPossible: null
  };

  if (g.targetGpa === null || g.futureUnits === null) {
    return { ...base, status: 'incomplete' };
  }

  if (g.futureUnits <= 0) {
    const met = currentAvg !== null && currentAvg + 1e-12 >= g.targetGpa;
    return {
      ...base,
      status: met ? 'already_met' : 'unreachable_zero_future',
      maxPossible: currentAvg
    };
  }

  const needed = (g.targetGpa * (currentUnits + g.futureUnits) - currentGP) / g.futureUnits;
  const maxPossible = (currentGP + ceiling * g.futureUnits) / (currentUnits + g.futureUnits);

  if (needed <= 0 + 1e-12) {
    return { ...base, status: 'already_met', neededGpa: needed, maxPossible };
  }

  if (needed > ceiling + 1e-12) {
    return { ...base, status: 'unreachable_above_max', neededGpa: needed, maxPossible };
  }

  return { ...base, status: 'ok', neededGpa: needed, maxPossible };
}
