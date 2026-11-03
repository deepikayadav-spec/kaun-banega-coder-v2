# Kaun Banega Coder

A KBC-style Python quiz game for university students. Students climb a 15-rung money board while a server-side progression engine moves them through the CT skill graph. The engine covers 59 skills, 4 levels per skill, 29 question types, R1–R3 difficulty and 25 variants. Every answer and every progression step is stored in Postgres, per university.

The app follows the same pattern as Saturday Sprint: one Express app running as a single Vercel function, static pages in `public/`, Neon Postgres in production, and PGlite locally.

**Live:** https://kaun-banega-coder-v2.vercel.app (admin at `/admin`). The Vercel project is `kaun-banega-coder-v2`, the function runs in `sin1` next to its Neon database, and pushes to `main` deploy to production.

## How it fits together

| Piece | File | What it does |
|---|---|---|
| Game shell | `public/index.html`, `public/game.js`, `public/kbc.css` | The original KBC design: ladder, Fastest Finger First, lifelines, energy, mascot, 3D studio, path map and Hall of Fame. It now takes its questions and progress from the API. |
| Question widgets | `public/bank-ui.js`, `public/bank-ui.css` | Renders all 29 bank types and builds the answer. Run-type answers are run in the browser first. |
| Python runner | `public/pyrun.worker.js` | Runs student code with Pyodide (real CPython in WebAssembly) in a Web Worker. `input()` is fed from test inputs, and runs stop after 6 s. |
| Progression engine | `server/engine.js` | A port of *KBC Progression Engine.html*. See the rules below. |
| Grading | `server/grade.js` | Builds what the student sees (no answer keys, options shuffled) and grades every type. |
| Bank | `server/bank.js` | Loads the skill graph, the question types and the bank. Validates uploads against `question-types.json` and upserts them by id. |
| API | `server/app.js` | Student auth, play, lifelines, progress, Hall of Fame, and admin. |
| Database | `server/db.js` | Schema, created on first connection: Postgres in production, PGlite locally. |
| Admin console | `public/admin.html` (`/admin`) | Analytics per university, students, progression history, bank and graph uploads, CSV exports and admins. |

### Engine rules

- **Right answer:**
  - At L1 below the skill's `rmax`, R goes up one.
  - Otherwise two right answers in a row move the student to the next level.
  - Finishing L4 marks the skill done and opens every skill whose AND-of-OR prerequisites are now met.
- **Wrong answer:**
  - The next variant is served.
  - Two misses on the same level and R switch to the next question type.
  - At L1 on the starting R2, a miss drops the student to R1.
- **What gets served:**
  - Only types that have live questions for that skill and level, minus the skill's `skipped_types`.
  - The hot seat serves only types whose modes include `hotseat`; the rest come up in Practice.
  - A skill with nothing to serve shows as "coming soon".

### How students see their progress

`levelTrack()` in `server/engine.js` turns a skill's state into what moves the student up from where they are: the L1 difficulty climb still to go, the two-in-a-row slots, the right answers remaining, and what a miss does there. It is display only and comes with every engine view as `skills[id].track`, so the game never re-decides the rules. A test plays random answers and checks the track against what `applyAnswer` actually does.

- **Question page:** one slim line beside the "Question N" chip: "Level N", a 4-tick mini bar (the current tick fills with the streak), the two streak dots (each earned streak burns with an animated flame) with a 0/2 count, and the rule "2 consecutive streaks to unlock the next level". Tap it for the topic's level milestones (the full Level 1 … Level 4 bar).
- **After each answer:** one line on what changed, read from the engine's transitions: a step filled, difficulty up, streak reset, back to R1, level up or topic cleared.
- **Level up / topic cleared:** a short card with the unlock badge, "Level N", two burning streak flames and the Level 1 … Level 4 bar. It closes by itself after about 3 seconds, or on a tap, Enter or Esc.
- **My path:** the current topic's sheet shows the four level milestones, and map nodes carry four level dots.

The one-line "what you'll do" for each level lives in `levels_info` in `question-types.json`.

### Data (Postgres)

- **Students and access:**
  - `students_master`: the NIAT ID master list, with university.
  - `universities`: the NIAT ID prefixes.
  - `admins`: can be limited to one university.
  - `sessions`.
- **Content:** `skill_graph`, `question_types`, `questions`, `bank_uploads`.
- **Progress and history:**
  - `engine_state`: per-student engine state and the question currently open.
  - `attempts`: every graded answer.
  - `transitions`: R up/down, level up, type switch, skill done and unlock.
  - `game_progress`: wallet and streaks.
  - `events`, `feedback`, `audit_log`.
  - `presence`: when each student's game page last pinged, for the "N live" count.

## Students and universities

Students log in with their **NIAT ID and name**, matched against the master list. The name match is forgiving about case, word order and small typos. The university comes from the master list, or from the NIAT ID prefix (`server/universities.js`, the same table as Saturday Sprint).

The Hall of Fame has two boards: **Overall** (every university) and **University** (the student's own by default, or any other picked from a list). An admin can be limited to one university and then sees only that university's students and numbers.

## Local development

```bash
npm install
npm run seed -- --test        # graph, types, S1 bank + students TEST0001–TEST0005 ("Test Student 1" …)
npm run create-admin -- --email you@example.com --name "You" --super
npm run dev                   # http://localhost:3000  (admin: /admin)
npm test                      # engine, grading of every bank question, API end-to-end
```

With no `DATABASE_URL`, the data is kept in `data/pglite`.

## Deploying (GitHub → Vercel)

The Vercel project is connected to this repository, so every push to `main` deploys to production. Pull requests get preview deployments.

1. **Database:** Vercel → Storage → **Neon Postgres**, connected to this project. It sets `DATABASE_URL`.
2. **Environment variables:**
   - `APP_SECRET`: a long random string.
   - `ALLOW_TEST_LOGIN`: optional; `true` lets `TEST…` IDs log in during pilots.
3. **First request:** the first request creates the tables and loads the built-in content (skill graph, types and the S1 bank). `GET /api/health` shows `db: postgres` and the question count.
4. **First admin:** create it from your machine against the production database:
   `DATABASE_URL=<neon url> npm run create-admin -- --email … --super`
5. **Admin setup:** in `/admin`, upload each university's master list (.xlsx/.csv), then upload new question bundles as they are ready.

### Adding questions

Bundles use the format in `question-bank-format/`: `{"bank_version": "…", "questions": [ … ]}`. Upload them in **Admin → Question bank**, using **Check** first. Questions are validated against `question-types.json` and the skill graph, then added or updated by `id`. Uploads take effect for every instance within a minute.

### Changing the skill graph

Upload a new `skill-graph.json` in **Admin → Question bank → Replace the skill graph**. Use **Check** first: it validates the graph and lists what changes, how many students it touches, and how many questions are left without a skill.

The upload goes live for every student at once:
- **Every server instance** switches on its next request, because the active graph version is checked on each request.
- **Open games** pick up the change on their next question, or when their tab comes back into view. They reload into the new path at the next safe screen, never mid-question.

How students' progress follows the new graph:
- Skills they finished stay finished, and a skill they started stays open.
- An untouched skill follows its new prerequisites.
- New skills join the path.
- Removed skills drop off it; their history stays in the database.
- R is capped at a lowered `rmax`.

The prize ladder has one rung per skill group plus the finale, from ₹10 to ₹7 crore. 14 groups give the original 15 rungs. Checkpoint names on the map come from the graph's `checkpoints`, using the text before ":".

To roll back, open **Graph versions** under the upload and use **Make live again** on an earlier version.

## Known limits

- Only skill S1 has a full bank (600 questions). Other skills show "coming soon" until their bundles are uploaded.
- Run-type answers are graded on the output the student's browser reports. Rules on the code itself (require/forbid) are checked on the server.
- Login has no secret, the same as Saturday Sprint's simple mode: anyone who knows a student's NIAT ID and name can log in as them.
