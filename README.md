# GradeCraft

**Browser-based class grade calculator, What-If forecaster, and unit-weighted GPA planner.**

[![CI — Tests & Accessibility](https://github.com/theMaximmus/GradeCraft/actions/workflows/ci.yml/badge.svg)](https://github.com/theMaximmus/GradeCraft/actions/workflows/ci.yml)

| | |
|---|---|
| **Live app** | [maksymstesev.github.io/GradeCraft](https://maksymstesev.github.io/GradeCraft/) |
| **Version** | `1.26.1` (`package.json`) · product log through `v1_26_2` + later fixes |
| **License** | [MIT](./LICENSE) |
| **Stack** | Vanilla HTML/CSS/JS · Tailwind CDN · optional Firebase Auth + Firestore |
| **Tests** | 190 Vitest unit tests · Playwright E2E + axe-core accessibility |

GradeCraft is a **single-page app** (`index.html`) that runs entirely in the browser. Grades, What-If scores, GPA plans, and settings persist in `localStorage` by default. Optional **Sync (beta)** backs them up to Firebase when you sign in. Opening a compressed share link never writes to local storage.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Quick start](#quick-start)
3. [Using the app](#using-the-app)
4. [Views & URL routing](#views--url-routing)
5. [Grade math](#grade-math)
6. [Grading policies](#grading-policies)
7. [GPA Planner](#gpa-planner)
8. [Institution presets](#institution-presets)
9. [Syllabus import](#syllabus-import)
10. [Due dates, Upcoming & calendar](#due-dates-upcoming--calendar)
11. [Charts & trends](#charts--trends)
12. [Share & export](#share--export)
13. [Cloud sync (beta)](#cloud-sync-beta)
14. [Feedback](#feedback)
15. [Themes, locale & accessibility](#themes-locale--accessibility)
16. [Data model & persistence](#data-model--persistence)
17. [Repository layout](#repository-layout)
18. [Architecture notes](#architecture-notes)
19. [Development](#development)
20. [Testing & CI](#testing--ci)
21. [Deployment](#deployment)
22. [Security & privacy](#security--privacy)
23. [Changelog](#changelog)
24. [License](#license)

---

## What it does

GradeCraft helps students answer questions like:

- **What is my current grade** in this class, given weighted groups and scored work?
- **What if I get X on the final?** (What-If overrides without changing real scores)
- **What average do I need on remaining work** to hit a letter target?
- **What is my term / overall GPA** if I plan letter grades (and prior credit)?
- **What GPA do I need on future units** to reach a cumulative goal?

Built-in demos use UC Berkeley–style courses (**CS 61A**, **DATA C8**) and the UC Berkeley registrar letter scale (A+ = 4.0). You can switch to other UC campus presets or edit a custom scale.

---

## Quick start

### Run locally

```bash
# clone the repo, then:
npx serve . -l 4173 --no-clipboard
# open http://localhost:4173
```

Or open `index.html` directly in a browser. CDN assets (Tailwind, fonts, Font Awesome, Firebase SDK when sync is used) require network access.

### Install & test

```bash
npm ci
npm run test:unit          # Vitest (190 tests)
npm run test:e2e:install   # Chromium for Playwright (once)
npm run test:e2e           # serves the app + smoke/a11y tests
npm run test:all           # unit + e2e
```

Node **20+** is recommended (matches CI).

---

## Using the app

### Gradebook (home)

1. Pick an **Academic Term** tab (or **All Terms** / **New Term**).
2. Select a class tab, or **Add Class** / **Duplicate** / **Delete** (Undo toast after delete until you navigate away).
3. Edit **Course Code**, **Title**, **Term**, **Units** (0–20), and optional **P/NP**.
4. Read the three summary cards:
   - **Current Actual Grade** — scored work only
   - **Forecast / What-If Grade** — actuals + What-If overrides
   - **Target Grade Planner** — average needed on remaining weight for a letter target
5. Manage **Assignment Groups** (weights, drag reorder, Policies menu).
6. Enter scores in **Grouped** or **Unified** assignment views; optional **due dates**, late days, extra credit, What-If columns.
7. Use **Import from Syllabus**, **Normalize Weights**, charts, **Upcoming**, and **Export calendar (.ics)** as needed.

### Profile & Settings

- Profile fields (display name, email, institution, major)
- **Profile photo** — click the header or Profile avatar to upload/remove; image is compressed in-browser (JPEG ≤ ~112px) and stored as `profile.avatarDataUrl` in local state only (not sent to Firestore yet)
- Theme: True Black (default), Midnight, Light
- Locale for number/date formatting
- Default grade definitions + **institution presets** (Apply / Export / Import JSON)
- Sync (beta), JSON backup import/export, CSV export, demo reset, print helpers

### GPA Planner

Separate from the gradebook: assign planned letter grades per class, see term and overall unit-weighted GPA, prior credit, cumulative GPA, and a goal calculator. Planner data lives in its own `localStorage` key and does not rewrite gradebook scores. **Prior GPA** and **Target cumulative GPA** accept decimal values (text + `inputmode="decimal"`); prior graded units and future units remain `type="number"` with `step="0.5"`.

---

## Views & URL routing

Hash (and some path/query) routing keeps the gradebook as the landing page:

| View | Typical URL |
|------|-------------|
| Gradebook | `/` or `/GradeCraft/` |
| Profile & Settings | `#/profile` |
| GPA Planner | `#/gpa` |
| Changelog | `#/changelog` |
| Read-only shared planner | `#/share/<lz-string-payload>` |

Browser Back/Forward updates the active panel. The brand control links to the GitHub Pages home. Share mode shows a banner and keeps inputs read-only; it **does not** persist into `localStorage`.

---

## Grade math

Core pure functions live in [`src/calc.js`](./src/calc.js) (mirrored inline in `index.html` for the SPA).

### Actual vs forecast

- An assignment is **graded** when `earned` is a finite number (not `null` / `''`).
- **Actual** mode uses `earned` only.
- **Forecast** mode uses `whatIfEarned` if set, otherwise `earned`.

### Group → class percentage

1. For each assignment group, compute group % via [`computeGroupResult`](./src/calc.js) (policies applied — see below).
2. Class actual % = weight-weighted average of groups that have graded available points.
3. Forecast % is the same with forecast scores.
4. Letter grades come from the class **buckets** (min percentage → letter + GPA points) via `resolveBucket`.

### Units & term GPA

- Default units: **4** (clamped 0–20).
- Term / overall gradebook GPA:  
  \(\sum(\text{letter GPA} \times \text{units}) / \sum(\text{graded units})\)
- **P/NP** and **0-unit** classes are excluded from GPA numerators/denominators; P/NP units still count toward **total units**.

### Target Grade Planner

Uses locked contribution from already-graded weight and remaining ungraded weight to estimate the average % needed on remaining work for the selected target letter. When drop-lowest / best-of policies leave ungraded regular work, the forecast may be marked **approximate**.

---

## Grading policies

Per assignment group (`policies` object). Defaults are all inactive (`createDefaultGroupPolicies` in [`src/constants.js`](./src/constants.js)).

| Policy | Behavior |
|--------|----------|
| **Drop lowest N** | After scoring, drop the N lowest % among regular (non–extra-credit) scored items |
| **Best of N** | Keep only the best N; if both drop and best-of are set, **best-of wins** |
| **Late penalty** | `% per day` × `lateDays`, capped; applied to earned points before replace/drop |
| **Score replacement** | If source % (after late) beats target %, target’s points are raised to that % × target available |
| **Extra credit** | Adds to earned only; does not increase available; skipped by drop/best-of ranking |

**Fixed order:** late penalty → replacement → drop lowest **or** best-of → extra credit.

Active rules show as badges; the Policies UI configures them. Legacy saves get empty policies on sanitize.

---

## GPA Planner

Storage key: `gradecraft_gpa_planner_v1`.

```json
{
  "grades": { "<classId>": "A-" },
  "prior": { "units": 0, "gpa": null },
  "goal": { "targetGpa": null, "futureUnits": null },
  "updatedAt": "ISO-8601"
}
```

- Planned letters map through the active default grade definitions (preset-aware display decimals).
- **Prior credit:** graded units (`step` 0.5) + GPA (or legacy grade-points ÷ units). Mid-keystroke decimals like `3.` are kept until blur on Prior GPA / target GPA fields (avoids `type="number"` swallowing `.`).
- **Cumulative GPA:** planner grade points + prior, over planner graded units + prior units (prior only counts when GPA is set and units &gt; 0).
- **Goal calculator:**  
  \(G_{\text{needed}} = \frac{G_{\text{target}}(U_{\text{current}} + U_{\text{future}}) - GP_{\text{current}}}{U_{\text{future}}}\)  
  Statuses: `incomplete`, `already_met`, `unreachable_zero_future`, `unreachable_above_max`, `ok`.
- **Clear All Grades** clears planned letters only; prior/goal remain.
- Print/PDF styles hide chrome for a clean planner printout.
- **Share** builds a compressed read-only link (see [Share & export](#share--export)).

---

## Institution presets

Defined in [`src/presets.js`](./src/presets.js) (browser build: `presets-browser.js`).

| ID | Campus | Unit system | Notes |
|----|--------|-------------|--------|
| `uc_berkeley` | UC Berkeley (default) | semester | Official % cutoffs from registrar |
| `uc_davis` | UC Davis | quarter | Common UC % defaults (instructor-set on campus) |
| `uc_los_angeles` | UCLA | quarter | |
| `uc_san_diego` | UC San Diego | quarter | No D+ / D− in grade-point table |
| `uc_santa_barbara` | UCSB | quarter | |
| `uc_irvine` | UCI | quarter | |
| `uc_santa_cruz` | UCSC | quarter | |
| `uc_riverside` | UCR | quarter | |
| `uc_merced` | UC Merced | semester | |

Each preset includes grade definitions (letter, min %, GPA points), P/NP guidance, unit notes, source URL, and `lastVerified`. You can **Apply** to defaults, **Export JSON**, or **Import** a validated custom preset. `matchPresetId` detects when the current scale still matches a built-in preset vs `custom`.

---

## Syllabus import

Rule-based parser in [`src/syllabus.js`](./src/syllabus.js) — **no LLM**.

1. Paste a grading section (or drop a PDF — text extracted on-device via pdf.js).
2. Parser finds name + percent pairs (inline lists, `Name: 20%`, `20% Name`, tab-separated, etc.).
3. Skips letter-grade scale rows; prefers a “Grading / Assessment / …” section when present.
4. Review/edit proposed groups; weights should total ~100% (±1% tolerance).
5. Confirm to create groups only (assignments are not invented).

---

## Due dates, Upcoming & calendar

- Optional assignment `due` as `YYYY-MM-DD` (invalid values become `''`).
- **Upcoming** panel: unscored work overdue or due within **14 days** (`UPCOMING_WINDOW_DAYS`), ranked by **weight at stake** (group weight × assignment share of group points), then due date.
- Unified view can sort by due date.
- **Export calendar** builds RFC 5545 `.ics` all-day events with stable UIDs (`gradecraft-<id>@gradecraft.local`) so re-import updates instead of duplicating.

---

## Charts & trends

SVG charts (theme CSS variables) with text summaries and data-table fallbacks:

1. **Per-class stacked bars** — points earned / lost / remaining (points view; does not apply drop/best-of).
2. **Grade over time** — running class % after each scored assignment that has a due date.
3. **Term GPA trend** (GPA Planner) — planned GPA by term.

Builders: `buildGroupPointsBreakdown`, `buildGradeOverTimeSeries`, `buildTermGpaSeries` in [`src/calc.js`](./src/calc.js).

---

## Share & export

Helpers in [`src/share.js`](./src/share.js); compression via [`src/lzstring.js`](./src/lzstring.js).

| Export | Description |
|--------|-------------|
| **JSON** | Full app state backup / restore |
| **CSV** | One row per assignment: code, title, term, units, P/NP, group, name, earned, available, due, extra credit |
| **ICS** | Assignment due dates |
| **Share link** | Planner-focused payload (`v: 1`, `type: 'planner'`) compressed into `#/share/…` |
| **Share file** | Fallback when encoded payload exceeds ~6000 characters (`SHARE_LINK_MAX_CHARS`) |

Share payloads include class metadata, planner grades/prior/goal, and default grade definitions — not full assignment scorebooks. Opening a share URL is read-only and non-persistent.

### Share-the-app promo (`v1_26_2`)

A dismissable “share with a classmate” dialog can appear after a short delay (`SHARE_APP_PROMO_DELAY_MS`, ~1.8s). It offers **Copy app link** / **Maybe later**, and a **Don’t show this message again** checkbox. Opt-out is stored in `localStorage` under `gradecraft_share_app_promo_dismissed_v1`. Flip `SHARE_APP_PROMO_ENABLED` in `index.html` to disable it for everyone.

---

## Cloud sync (beta)

Optional. Without Firebase config, the app stays fully local.

### Enable

1. Create a Firebase project (Auth + Firestore).
2. Put the web config in [`src/firebase-config.js`](./src/firebase-config.js) **and** [`src/firebase-config.browser.js`](./src/firebase-config.browser.js) (or set `window.GRADECRAFT_FIREBASE` before the app boots).
3. Deploy [`firestore.rules`](./firestore.rules).
4. In Profile → enable **Sync (beta)** → sign in with **email link** or **Google**.

### Behavior

- Debounced uploads (~2s, `SYNC_DEBOUNCE_MS`).
- Real-time Firestore listeners when signed in.
- **Last-write-wins** on `updatedAt` per class / planner / settings.
- Soft-delete **tombstones** so deletions sync across devices.
- First sign-in with both local and cloud data: **Use cloud** / **Use device** / **Merge** (with local backup).
- **Sign out** and **Delete my data** (cloud wipe for that uid).
- **Profile photos stay local.** Cloud settings docs sync name/email/institution/major only; `avatarDataUrl` is stripped on upload and preserved on pull/merge so Sync cannot wipe a local photo.

### Firestore shape

```
users/{uid}/
  classes/{classId}     # class doc or { deleted: true, updatedAt }
  planner               # GPA plan document
  settings              # profile text fields, theme, locale, grade defs, preset id, schemaVersion
                        # (no avatar binary / data URL)
feedback/{reportId}     # separate feedback collection (not under users)
```

Schema version: `SYNC_SCHEMA_VERSION = 1`. Pure merge/diff logic is tested in [`src/sync.js`](./src/sync.js).

### App Check

Client can initialize **reCAPTCHA Enterprise** App Check from config (`appCheckProvider: 'enterprise'`). Localhost can use debug tokens when `appCheckDebug` is enabled. See comments in `firebase-config.js` for referrer-restricted API keys and enforcement checklist.

---

## Feedback

Footer → Feedback:

1. Optionally **pick a UI element** (CSS path + label; feedback chrome ignored).
2. Short message (≤ 500 chars).
3. Download / copy plain text, or **Submit** to Firestore `feedback/{id}` when signed in.

Payload helpers: [`src/feedback.js`](./src/feedback.js). Rules allow create + own-read only; no client updates/deletes.

---

## Themes, locale & accessibility

| Theme | `data-theme` | Notes |
|-------|--------------|--------|
| True Black | `black` | Default OLED-style |
| Midnight | `midnight` | Slate dark |
| Light | `light` | Light surfaces |

- Locale (`en-US`, etc.) drives `Intl` number/date formatting.
- Toasts use polite live regions.
- Group reorder supports keyboard as well as drag handles.
- `prefers-reduced-motion` is respected.
- E2E axe checks WCAG 2A/2AA (color-contrast rule disabled in CI; themes verified manually).

---

## Data model & persistence

### `localStorage` keys

| Key | Purpose |
|-----|---------|
| `gradecraft_state_v4` | Current app state (classes, UI, profile, defaults) |
| `gradecraft_gpa_planner_v1` | GPA Planner only |
| `gradecraft_sync_prefs_v1` | Sync enabled, last push stamps, first-sync flag |
| `gradecraft_share_app_promo_dismissed_v1` | Share-the-app promo permanently dismissed (`'1'`) |
| Legacy keys in `ALL_STORAGE_KEYS` | Migrated/merged on load, then written to v4 |

### App state (simplified)

```js
{
  activeView, activeTermFilter, activeClassId,
  gradebookViewMode,   // 'grouped' | 'unified'
  gradebookSortMode,   // 'group' | 'due'
  theme, locale,
  profile: {
    displayName, email, institution, major,
    avatarDataUrl      // optional data:image/…;base64,… (local-only; sanitized)
  },
  defaultGradeDefinitions, activePresetId,
  classes: [ /* Class */ ],
  classTombstones: [ { id, deleted: true, updatedAt } ],
  settingsUpdatedAt
}
```

`sanitizeAvatarDataUrl` accepts only compact `data:image/(jpeg|jpg|png|webp|gif);base64,…` strings (max ~120k chars). Invalid or oversize values are dropped on load.

### Class

```js
{
  id, code, name, term, units, pnp, targetLetter,
  groups: [{ id, name, weight, policies }],
  buckets: [{ id, letter, min, gpa, description }],
  assignments: [{
    id, name, groupId,
    earned, available, whatIfEarned,
    extraCredit, lateDays, due
  }],
  updatedAt
}
```

`sanitizeState` / `sanitizeClassObject` repair missing fields, migrate legacy names (`possible` → `available`, `whatIf` → `whatIfEarned`), dedupe classes by id or `(code, term, title)`, and stamp `updatedAt` for sync.

Demo courses are created when there is no saved data; **Restore Demo Courses** re-adds missing examples without wiping yours.

---

## Repository layout

```
.
├── index.html                 # Full SPA (UI + inline logic ~8.8k lines)
├── package.json               # gradecraft@1.26.1 — test scripts only
├── vitest.config.js
├── playwright.config.js       # serves static site on :4173
├── firebase.json              # points at firestore.rules
├── firestore.rules
├── LICENSE                    # MIT
├── .github/workflows/ci.yml   # unit then e2e on push/PR to main
├── src/
│   ├── constants.js           # grade scale, storage keys, policy defaults
│   ├── calc.js                # grades, GPA, due dates, ICS, charts
│   ├── storage.js             # sanitize/load/save, demos, GPA plan, avatar sanitize
│   ├── share.js               # CSV + lz-string share URLs
│   ├── syllabus.js            # syllabus weight parser
│   ├── presets.js             # UC institution presets
│   ├── sync.js                # merge / tombstones / sync payloads (preserves local avatar)
│   ├── feedback.js            # element pick + feedback docs
│   ├── firebase-config.js     # ESM Firebase + App Check config
│   ├── lzstring.js            # share compression (ESM)
│   ├── *-browser.js           # IIFE/globals for script tags in index.html
│   └── sync-controller.snippet.js  # reference sync controller excerpt
└── tests/
    ├── unit/*.test.js         # 12 files, 190 tests
    └── e2e/app.spec.js        # smoke + axe
```

Ignored: `node_modules/`, `archive/`, `docs/private/`, Playwright/Vitest artifacts (see [`.gitignore`](./.gitignore)).

---

## Architecture notes

1. **Static SPA first.** No bundler required for production; GitHub Pages serves `index.html` + `src/*`.
2. **Dual maintenance.** Calculable logic is extracted to `src/*.js` for Vitest, and largely **kept in sync** as inline copies inside `index.html` so the page works with classic `<script>` tags. Browser builds (`*-browser.js`) expose globals for presets, feedback, Firebase config, and lz-string.
3. **Injectable storage.** `loadState(storage)` / `saveState(state, storage)` accept a storage object so unit tests mock `localStorage`.
4. **Firebase is optional.** Missing config → local-only UX; Sync panel still explains setup.
5. **Share uses the URL hash** so payloads are not sent to a server as query parameters.
6. **Avatars are local-first.** Compression and sanitize live next to profile rendering in `index.html` / `storage.js`; sync controllers must keep `avatarDataUrl` off the wire until Storage sync is intentional.

When changing grade math, policies, sync merge, or sanitize rules, update **both** the module under `src/` and the matching inline section in `index.html`, then run `npm run test:unit`.

---

## Development

```bash
npm ci
npm run test:unit:watch    # Vitest watch mode
npx serve . -l 4173        # same port as Playwright webServer
```

Useful scripts from `package.json`:

| Script | Command |
|--------|---------|
| `test` / `test:unit` | `vitest run` |
| `test:unit:watch` | `vitest` |
| `test:e2e` | `playwright test` |
| `test:e2e:install` | `playwright install chromium` |
| `test:all` | unit then e2e |

There is no build step: edit `index.html` / `src/` and refresh.

---

## Testing & CI

### Unit (Vitest, Node)

| File | Covers |
|------|--------|
| `calc.test.js` | Graded values, buckets, class metrics, term/planner GPA |
| `policies.test.js` | Drop / best-of / late / replace / EC / forecast |
| `cumulative.test.js` | Prior credit, cumulative GPA, goal statuses |
| `storage.test.js` | Sanitize, dedupe, load/save migration, avatar data URLs |
| `due_dates.test.js` | Dates, Upcoming, ICS |
| `charts.test.js` | Chart data builders |
| `share.test.js` | CSV, lz-string, share URL helpers |
| `syllabus.test.js` | Parser & weight totals |
| `presets.test.js` | UC presets validate/import/export |
| `sync.test.js` | Merge, first sign-in, outgoing payload, local avatar preserved |
| `feedback.test.js` | Paths, payloads, ignore chrome |
| `firestore_rules.test.js` | Rules file structure expectations |

### E2E (Playwright + axe-core)

Loads the static server, checks title/demo class, navigation (gradebook / GPA / profile / changelog), add class toast, Sync panel toggle without Firebase, and no critical/serious a11y violations on Gradebook and Profile.

### GitHub Actions

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml): on `push`/`pull_request` to `main` → Node 20 → `npm ci` → unit tests → (needs unit) Playwright Chromium with deps → e2e; uploads Playwright report artifact on failure (7-day retention).

---

## Deployment

Designed for **GitHub Pages** from the repository root (`index.html` as the site entry).

Published URL pattern:

`https://maksymstesev.github.io/GradeCraft/`

Ensure Firebase Auth authorized domains and API key HTTP referrers include the Pages host (and localhost for development). Deploy Firestore rules with the Firebase CLI when rules change:

```bash
firebase deploy --only firestore:rules
```

---

## Security & privacy

- **Local-first:** grade data stays in the browser unless Sync is enabled and you sign in.
- **Profile photos** are compressed and saved only in `localStorage` (data URLs); they are not uploaded to Firestore/Storage in the current sync design.
- **Firestore rules:** each user may only read/write `users/{theirUid}/**`. Feedback docs are create-once, own-read, no client update/delete.
- **Client Firebase keys** are public by design; protect the project with Auth, rules, App Check, and API key referrer restrictions (documented in `firebase-config.js`).
- **Share links** embed planner data in the URL — treat them like secrets if they contain private grades.
- **Do not commit** private service-account keys or notes under `docs/private/`. The web config in-repo is the public client config only.

---

## Changelog

The in-app **Changelog** view (`#/changelog`) is the canonical release log (`v1_1` → latest tagged entry), including print/PDF and plain-text copy. Highlights:

| Version | Highlights |
|---------|------------|
| **Post–v1_26_2** | Local-only profile photo upload/compress/remove; Prior GPA / goal decimal typing fix; avatar preserved across Sync merges |
| **v1_26_2** | Dismissable share-with-friends promo popup (`gradecraft_share_app_promo_dismissed_v1`) |
| **v1_26_1** | Firebase App Check (reCAPTCHA Enterprise) + API key lockdown docs |
| **v1_26** | UC undergraduate institution presets |
| **v1_25** | Undo for deleted classes |
| **v1_24** | Optional Firebase sync / accounts |
| **v1_23** | Syllabus import (rule-based) |
| **v1_22** | Share links, CSV, print styles |
| **v1_21** | Charts & trends |
| **v1_20** | Due dates, Upcoming, ICS |
| **v1_19** | Prior credit, cumulative GPA, goal calculator |
| **v1_18** | Group grading policies |
| **v1_17** | Extracted modules, Vitest, Playwright, CI, a11y |
| **v1_16+** | Units, P/NP, GPA Planner page |
| **v1_1** | Initial gradebook + What-If + target forecaster + localStorage |

Note: the in-app changelog cards may lag `package.json` / git commit titles until those UI entries are refreshed; this README covers shipped behavior through the commits after the previous README rewrite.

---

## License

MIT © 2026 Maximmus — see [LICENSE](./LICENSE).

---

## Credits & dependencies (runtime CDN)

- [Tailwind CSS](https://tailwindcss.com/) (CDN)
- [Inter](https://fonts.google.com/specimen/Inter) & [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono)
- [Font Awesome 6](https://fontawesome.com/)
- [Firebase](https://firebase.google.com/) (optional Auth, Firestore, App Check, Analytics)
- [pdf.js](https://mozilla.github.io/pdf.js/) (optional syllabus PDF text extraction)
- [lz-string](https://github.com/pieroxy/lz-string) (share payload compression; vendored)

Dev: [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/), [@axe-core/playwright](https://github.com/dequelabs/axe-core), [serve](https://github.com/vercel/serve).
