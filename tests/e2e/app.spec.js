/**
 * GradeCraft E2E smoke tests.
 *
 * Opens the app in a real browser and verifies core user flows:
 * - Gradebook renders with example data
 * - Navigation between views works
 * - Adding a class
 * - GPA Planner loads
 * - Changelog loads
 * - Accessibility checks pass
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = 'http://localhost:4173';

test.describe('GradeCraft App Smoke Tests', () => {

  test('loads gradebook with example data', async ({ page }) => {
    await page.goto(BASE_URL);
    // Title should contain GradeCraft
    await expect(page).toHaveTitle(/GradeCraft/);
    // Header brand text should be visible
    await expect(page.locator('#btnBrandReload')).toBeVisible();
    // At least one class tab should render (CS 61A)
    await expect(page.locator('[data-action="select-class"]').first()).toBeVisible();
  });

  test('navigates to GPA Planner', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('#navBtnGpa');
    // GPA Planner overall summary should appear
    await expect(page.locator('#gpaOverallContainer')).toBeVisible({ timeout: 5000 });
    // URL should update to include gpa hash
    expect(page.url()).toContain('#/gpa');
  });

  test('navigates to Profile & Settings', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('#navBtnProfile');
    // Profile fields should appear
    await expect(page.locator('#profileDisplayName')).toBeVisible({ timeout: 5000 });
    expect(page.url()).toContain('#/profile');
  });

  test('navigates to Changelog', async ({ page }) => {
    await page.goto(BASE_URL);
    // Click the footer changelog link
    await page.click('#btnFooterChangelog');
    await expect(page.locator('#viewChangelog')).toBeVisible({ timeout: 5000 });
    expect(page.url()).toContain('#/changelog');
  });

  test('adds a new class', async ({ page }) => {
    await page.goto(BASE_URL);
    // Click Add Class button
    await page.click('#btnAddClass');
    // A toast should confirm the new class
    await expect(page.locator('text=Added new class')).toBeVisible({ timeout: 3000 });
  });

  test('navigates back to Gradebook from GPA Planner', async ({ page }) => {
    await page.goto(`${BASE_URL}#/gpa`);
    await page.click('#navBtnGradebook');
    // Gradebook view should become visible
    await expect(page.locator('#viewGradebook')).toBeVisible({ timeout: 5000 });
  });

  test('accessibility: no critical violations on Gradebook', async ({ page }) => {
    await page.goto(BASE_URL);
    // Wait for content to render
    await page.waitForSelector('text=CS 61A', { timeout: 5000 });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast']) // Theme-based contrast checked manually
      .analyze();
    // Allow no critical or serious violations
    const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toEqual([]);
  });

  test('accessibility: no critical violations on Profile', async ({ page }) => {
    await page.goto(`${BASE_URL}#/profile`);
    await page.waitForSelector('#profileDisplayName', { timeout: 5000 });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();
    const critical = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
    expect(critical).toEqual([]);
  });
});
