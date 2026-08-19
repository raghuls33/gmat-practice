# GMAT Practice Suite — Data Science

Five full-length practice papers as a single self-contained HTML file that runs
offline with no server, no build step and no dependencies.

Open `dist/GMAT_Practice_Suite.html` in a browser and start.

> **Unofficial, and not GMAT-format.** This is independent practice material whose
> task types (figure sequences, equation systems, Latin squares, plus a Data Science
> subject module) are modelled on the structure of the
> [g.a.s.t.](https://www.gast.de/) / TestDaF-Institut preparatory materials for the
> dMAT (Digital Master Assessment Test) Data Science subject module — **not** on the
> question formats used by the real GMAT, which has no such sections. It is not
> produced, endorsed or reviewed by GMAC, g.a.s.t., the TestDaF-Institut, or any
> university. The 200-mark scheme is the g.a.s.t. format, not a GMAT scaled score;
> the bands shown in the app are a practice target only. Papers 1 and 2 rebuild the
> eighteen official worked examples at Q1 / Q8 / Q15 of each Core subtest; everything
> else is original.

---

## The exam and the mark scheme

Each paper is 100 questions, **200 marks**, 180 minutes.

| Module | Subtest | Questions | Marks | Time |
|---|---|---:|---:|---:|
| Core | Figure Sequences | 20 | 40 | 25 min |
| Core | Mathematical Equations | 20 | 40 | 25 min |
| Core | Latin Squares | 20 | 40 | 25 min |
| **Core total** | | **60** | **120** | **75 min** |
| Subject | Data Science — 5 testlets × 8 single-choice | 40 | 80 | 90 min |
| **Paper total** | | **100** | **200** | **180 min** |

Two marks per question. **No negative marking**, so always guess.

Scoring detail worth knowing:

- **Figure Sequences** award 1 mark per image, so a half-right item scores 1 of 2.
- **Mathematical Equations** are all-or-nothing: every letter must be correct.
- **Latin Squares** and **Subject** questions are 2 marks or nothing.

---

## What the app does

**Sitting a paper**

- **Exam mode** — each subtest locks the moment its clock hits zero. Answers go
  read-only and you are moved to the next subtest; when the last one locks the
  paper is submitted automatically.
- **Practice mode** — the clock runs and time spent is recorded, but nothing ever
  locks.
- Progress is saved as you go, so a reload or a closed tab will not lose a paper.
  The home screen offers **Resume** or **Start over**.

**Working through questions**

- A **question navigator**: one chip per question showing answered / partly
  answered / unanswered / flagged, click to jump.
- **Flag for review** on any question; flags survive a reload and are highlighted
  in the results.
- **Keyboard** (press <kbd>?</kbd> in the app for the full list):

  | Key | Action |
  |---|---|
  | <kbd>j</kbd> <kbd>k</kbd> or <kbd>↓</kbd> <kbd>↑</kbd> | Move between questions |
  | <kbd>1</kbd>–<kbd>4</kbd> or <kbd>a</kbd>–<kbd>d</kbd> | Select an option (Latin Squares <kbd>1</kbd>–<kbd>5</kbd>, Figure Sequences <kbd>1</kbd>–<kbd>3</kbd> per image) |
  | <kbd>←</kbd> <kbd>→</kbd> | Figure Sequences: switch between Image 1 and Image 2 |
  | <kbd>Enter</kbd> | Advance |
  | <kbd>f</kbd> | Flag for review |
  | <kbd>n</kbd> | Toggle the navigator |
  | <kbd>?</kbd> | Shortcuts overlay |

  Shortcuts are suppressed while the cursor is in a number box, so typing an
  equation answer never triggers one.

**After submitting**

- Score by subtest, by difficulty, by testlet, plus time spent per subtest.
- **Review with worked solutions**, filtered to **all / wrong only / flagged only**.
- **Attempt history** with hand-rolled inline-SVG charts: total score over time
  and a per-subtest trend (plotted as a percentage of each subtest so the 80-mark
  Subject Module is comparable with the 40-mark Core subtests).
- **Drill my weak areas** — builds an ad-hoc set from every question you have
  answered wrong across all five papers. Scored, untimed, and it reuses the same
  renderers, so items look exactly as they did in the paper.
- **Copy summary** puts a markdown report of an attempt on the clipboard.

**Accessibility and printing**

- Answer options are real radio groups with arrow-key support, visible focus
  rings and aria-labels.
- Every SVG matrix carries a description generated from the same state data it is
  drawn from ("5 by 5 grid, 2 figures: red arrow pointing left at column α, row 3; …").
- A **colour-blind safe** toggle tags every coloured figure with a letter
  (**K** black, **R** red, **G** green, **B** blue, **O** orange) so the sequences
  can be read without relying on hue.
- Matrices scale down on narrow screens instead of wrapping into an unreadable
  stack.
- <kbd>Ctrl</kbd>+<kbd>P</kbd> prints the paper without the app chrome and without
  splitting a question across a page.

**Your data stays yours.** Everything is kept in this browser's `localStorage`.
Nothing is uploaded anywhere. There is a **Clear all saved data** button on the
home screen. If storage is unavailable or full, the app degrades to memory-only
for the session and says so.

---

## Repository layout

```
src/index.html    page shell with build markers
src/styles.css    all styling, including the print stylesheet
src/app.js        the whole application
src/data.json     the question bank: 5 papers (read-only input)
build.sh          inlines the four src files into one HTML file
test.js           the test suite
dist/             build output — the deliverable

worker/index.js   Cloudflare Worker: the /api routes, else static assets
worker/validate.js  signup validation, shared by the Worker and the tests
schema.sql        D1 table for the signup list
wrangler.toml     Worker + assets config
```

The Worker is only involved on Cloudflare. `dist/` is a complete, standalone
site on its own — that is what GitHub Pages serves and what opens from
`file://`.

`src/data.json` is treated as **read-only input**. `build.sh` copies it through
byte for byte, and the test suite asserts that the JSON embedded in the built
file is byte-identical to it.

---

## Build

Requires only a POSIX shell. No npm install, no bundler, no toolchain.

```bash
sh build.sh
```

This writes `dist/GMAT_Practice_Suite.html` — a single self-contained file with
the CSS, the question data and the application inlined, and **zero external
references**. It also writes `dist/index.html` with the same content, which is
what a static host serves.

Open the result directly from the filesystem:

```bash
open dist/GMAT_Practice_Suite.html
```

To work on `src/` without rebuilding, serve the folder over HTTP — opening
`src/index.html` from `file://` cannot fetch `data.json`:

```bash
python3 -m http.server -d src 8000
```

---

## Tests

```bash
node test.js
```

or

```bash
npm test
```

No dependencies and no test framework. The suite builds a minimal DOM shim,
evaluates `src/app.js` inside a `vm` context and drives the real scoring and
rendering code. It asserts, among other things, that every paper totals exactly
200 marks, that an all-correct paper scores 200 and an all-wrong paper scores 0,
that every subject question has exactly four options with an answer index in
0..3, that each figure-sequence item's three options are distinct, and that every
Latin square's stated answer matches its completed grid.

---

---

## Sign-ups and privacy

The practice app itself never sends anything anywhere. Answers, flags, timings
and attempt history live in `localStorage` and stay in the browser.

There is one exception, and it is opt-in: an **optional sign-up form** in the
*About this material* card, for people who want to be told when papers or
corrections are added.

### Where it does and does not appear

The same built file is served three ways, and only one of them has a backend:

| Served from | API | Form |
|---|---|---|
| Cloudflare Worker | yes | shown |
| GitHub Pages | no | hidden |
| `file://` | no | hidden |

The form asks `GET /api/signup` on load and renders itself only if the reply is
`{"ready":true}`. Anywhere else it stays hidden, so the offline single-file
build never shows a control that cannot work.

### What is recorded

Name, email address, the optional message, the country the request came from,
and the time. **Not** the IP address and **not** the browser user-agent. A
consent checkbox is required — `consent` must be exactly `true`, and the server
re-validates it, so an altered form cannot bypass it. Nothing is shared with
anyone. Deletion on request: email the address in the About card.

If you run this yourself with sign-ups enabled and have visitors in the EU, you
are the data controller for that list. This repository gives you the mechanism
and an honest notice; it does not give you a lawful basis, a retention policy or
a records obligation. That part is yours.

### Turning sign-ups on

Without these steps the Worker still deploys and serves the app perfectly well —
`/api/signup` simply reports itself as not ready and the form stays hidden.

```bash
npx wrangler login
```

```bash
npx wrangler d1 create gmat-practice-signups
```

Paste the `database_id` it prints into `wrangler.toml` and uncomment the
`[[d1_databases]]` block, then create the table:

```bash
npx wrangler d1 execute gmat-practice-signups --remote --file=./schema.sql
```

Set a long random admin token — without it the read endpoint stays shut:

```bash
npx wrangler secret put ADMIN_TOKEN
```

### Reading the list

`GET /api/signups` requires the token in an `Authorization` header. It is never
in the URL: query strings end up in logs, browser history and referrer headers,
and this response contains other people's email addresses.

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" https://YOUR-WORKER-URL/api/signups
```

Add `?format=csv` for a spreadsheet-friendly download. With no `ADMIN_TOKEN`
configured the endpoint returns 503 rather than defaulting to open.

### Anti-spam

A public POST endpoint attracts bots. There is a honeypot field, hidden
off-screen and skipped by the keyboard, and a filled-in honeypot gets the same
cheerful reply a human gets while being discarded — telling a bot it failed only
teaches it to try harder. Bodies over 4 KB are rejected. That is a floor, not a
wall: if it starts attracting real volume, put Cloudflare Turnstile in front.

---

## Licence

MIT for the application code. The practice questions are original work modelled
on the published exam format.
