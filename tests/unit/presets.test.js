/**
 * Unit tests for institution presets (UC undergraduate campuses).
 */

import { describe, it, expect } from 'vitest';
import {
  INSTITUTION_PRESETS,
  DEFAULT_PRESET_ID,
  getPresetById,
  validatePreset,
  importPresetFromJson,
  exportPresetToJson,
  matchPresetId,
  clonePresetGradeDefinitions,
  getGpaDisplayDecimals,
  UCSD_GRADE_POINTS,
} from '../../src/presets.js';

describe('INSTITUTION_PRESETS', () => {
  it('includes Berkeley as default and all requested UC campuses', () => {
    expect(DEFAULT_PRESET_ID).toBe('uc_berkeley');
    const ids = INSTITUTION_PRESETS.map(p => p.id);
    expect(ids).toEqual(expect.arrayContaining([
      'uc_berkeley',
      'uc_davis',
      'uc_los_angeles',
      'uc_san_diego',
      'uc_santa_barbara',
      'uc_irvine',
      'uc_santa_cruz',
      'uc_riverside',
      'uc_merced',
    ]));
    expect(INSTITUTION_PRESETS).toHaveLength(9);
  });

  it('marks semester vs quarter correctly', () => {
    expect(getPresetById('uc_berkeley').unitSystem).toBe('semester');
    expect(getPresetById('uc_merced').unitSystem).toBe('semester');
    expect(getPresetById('uc_davis').unitSystem).toBe('quarter');
    expect(getPresetById('uc_los_angeles').unitSystem).toBe('quarter');
    expect(getPresetById('uc_san_diego').unitSystem).toBe('quarter');
  });

  it('keeps A+ at 4.0 for every UC preset', () => {
    INSTITUTION_PRESETS.forEach((preset) => {
      const ap = preset.gradeDefinitions.find(d => d.letter === 'A+');
      const a = preset.gradeDefinitions.find(d => d.letter === 'A');
      expect(ap?.gpa).toBe(4.0);
      expect(a?.gpa).toBe(4.0);
    });
  });

  it('uses UCSD scale without D+ / D-', () => {
    const ucsd = getPresetById('uc_san_diego');
    const letters = ucsd.gradeDefinitions.map(d => d.letter);
    expect(letters).not.toContain('D+');
    expect(letters).not.toContain('D-');
    expect(letters).toContain('D');
    expect(UCSD_GRADE_POINTS.some(r => r.letter === 'D+')).toBe(false);
  });

  it('every preset validates and has a source URL', () => {
    INSTITUTION_PRESETS.forEach((preset) => {
      const result = validatePreset(preset);
      expect(result.ok, preset.id + ': ' + result.errors.join('; ')).toBe(true);
      expect(preset.sourceUrl).toMatch(/^https?:\/\//);
      expect(preset.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('validate / import / export', () => {
  it('rejects incomplete presets', () => {
    expect(validatePreset({ id: 'x' }).ok).toBe(false);
    expect(importPresetFromJson('{not json').ok).toBe(false);
  });

  it('round-trips export JSON', () => {
    const preset = getPresetById('uc_irvine');
    const json = exportPresetToJson(preset);
    const imported = importPresetFromJson(json);
    expect(imported.ok).toBe(true);
    expect(imported.preset.id).toBe('uc_irvine');
    expect(imported.preset.gradeDefinitions).toHaveLength(preset.gradeDefinitions.length);
  });
});

describe('matchPresetId / helpers', () => {
  it('matches Berkeley defaults', () => {
    const defs = clonePresetGradeDefinitions('uc_berkeley');
    expect(matchPresetId(defs)).toBe('uc_berkeley');
  });

  it('returns custom when cutoffs change', () => {
    const defs = clonePresetGradeDefinitions('uc_berkeley');
    defs[0].min = 99;
    expect(matchPresetId(defs)).toBe('custom');
  });

  it('reads GPA display decimals', () => {
    expect(getGpaDisplayDecimals('uc_davis')).toBe(3);
    expect(getGpaDisplayDecimals(null)).toBe(2);
  });
});
