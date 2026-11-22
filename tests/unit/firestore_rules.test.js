/**
 * Smoke checks for firestore.rules (owner-only path).
 * Full emulator suite can be added later; this guards the checked-in rule text.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('firestore.rules', () => {
  const rules = readFileSync(resolve('firestore.rules'), 'utf8');

  it('requires auth and matching uid for users/{uid}/**', () => {
    expect(rules).toMatch(/match \/users\/\{uid\}\/\{document=\*\*\}/);
    expect(rules).toMatch(/request\.auth != null && request\.auth\.uid == uid/);
    expect(rules).toMatch(/allow read, write:/);
  });

  it('does not allow open world access', () => {
    expect(rules).not.toMatch(/allow read, write:\s*if true/);
  });
});
