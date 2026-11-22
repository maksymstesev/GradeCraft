/**
 * GradeCraft shared constants — extracted from index.html for testability.
 * Keep in sync with the inline definitions in index.html.
 */

export const UC_BERKELEY_GRADE_DEFINITIONS = [
  { id: 'grade_ap', letter: 'A+', min: 97, gpa: 4.0, description: 'Extraordinary' },
  { id: 'grade_a',  letter: 'A',  min: 93, gpa: 4.0, description: 'Excellent' },
  { id: 'grade_am', letter: 'A-', min: 90, gpa: 3.7, description: 'Excellent' },
  { id: 'grade_bp', letter: 'B+', min: 87, gpa: 3.3, description: 'Good' },
  { id: 'grade_b',  letter: 'B',  min: 83, gpa: 3.0, description: 'Good' },
  { id: 'grade_bm', letter: 'B-', min: 80, gpa: 2.7, description: 'Good' },
  { id: 'grade_cp', letter: 'C+', min: 77, gpa: 2.3, description: 'Fair' },
  { id: 'grade_c',  letter: 'C',  min: 73, gpa: 2.0, description: 'Fair' },
  { id: 'grade_cm', letter: 'C-', min: 70, gpa: 1.7, description: 'Fair' },
  { id: 'grade_dp', letter: 'D+', min: 67, gpa: 1.3, description: 'Barely passed' },
  { id: 'grade_d',  letter: 'D',  min: 63, gpa: 1.0, description: 'Barely passed' },
  { id: 'grade_dm', letter: 'D-', min: 60, gpa: 0.7, description: 'Barely passed' },
  { id: 'grade_f',  letter: 'F',  min: 0,  gpa: 0.0, description: 'Failure' }
];

export const STORAGE_KEY = 'gradecraft_state_v4';

export const ALL_STORAGE_KEYS = [
  'gradecraft_state_v4',
  'gradecraft_state_v3',
  'gradecraft_state_v2',
  'gradecraft_state_v1',
  'gradecraft_state',
  'gradecraft_app_state_v7',
  'gradecraft_app_state_v6',
  'gradecraft_app_state_v5',
  'gradecraft_app_state_v4',
  'gradecraft_app_state_v3',
  'gradecraft_app_state_v2',
  'gradecraft_app_state',
  'gradecraft_data'
];

export const GPA_STORAGE_KEY = 'gradecraft_gpa_planner_v1';

export const DEFAULT_CLASS_UNITS = 4;

/** Upcoming panel looks this many days ahead (plus overdue items). */
export const UPCOMING_WINDOW_DAYS = 14;

/** Default grading policies for an assignment group (all off). */
export function createDefaultGroupPolicies() {
  return {
    dropLowest: 0,
    bestOf: 0,
    latePenalty: {
      enabled: false,
      percentPerDay: 10,
      cap: 100
    },
    replacement: {
      enabled: false,
      sourceAssignmentId: '',
      targetAssignmentId: ''
    }
  };
}

export const GROUP_DOT_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-violet-500',
  'bg-sky-500',
  'bg-rose-500',
  'bg-teal-500'
];
