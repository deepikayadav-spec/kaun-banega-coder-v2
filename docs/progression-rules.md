# KBC progression rules (production spec)

Version: 2026-11-07. Reference implementation: `server/engine.js` (pure functions, no DB or clock). Tests: `test/engine.test.js`.
Anything in this file that disagrees with `engine.js` is a bug in this file.

---

## 1. The question address

Every question the hot seat serves has an address:

```
C · G · S · L · T · R · V
Checkpoint · Skill group · Skill · Level · Question type · Difficulty · Variant
e.g.  C3·G10·S7·L1·T2·R3·V1
```

| Part | Values | Source |
|---|---|---|
| C, G, S | from the skill graph | `server/content/skill-graph.json` |
| L | 1 Recognise, 2 Reason, 3 Repair, 4 Create | fixed |
| T | the question types of that level, in order | `server/content/question-types.json` |
| R | 1 Low, 2 Medium, 3 Hard, capped by the skill's `rmax` | the student's state |
| V | 1–25 | the student's state |

## 2. Constants

```json
{
  "levels": 4,
  "variants": 25,
  "difficulty": { "start": 2, "min": 1, "max": "skill.rmax" },
  "rightInARowToLevelUp": 2,
  "wrongInARowToDropR": 2,
  "rUpCountsTowardStreak": false,
  "levelUpKeepsR": true,
  "levelEverDrops": false
}
```

**Skill `rmax`:** use the value stored in the graph. If the graph has none, derive it from the number of earlier skills (everything the skill transitively needs): 3 or more earlier skills give `rmax 3`, 1–2 give `rmax 2`, none gives `rmax 1`.

**What R means for content:**
- **R1:** this skill only.
- **R2:** mixes in 1–2 earlier skills (the first 2 earlier skills).
- **R3:** mixes in 3 or more earlier skills (all earlier skills).

## 3. Per-skill state

```js
{
  status: 'locked' | 'open' | 'done',
  level: 1..4,
  r: 1..rmax,                 // starts at min(2, rmax)
  rightStreak: 0 | 1,         // right answers in a row toward the level-up
  streak: { key: 'L-R' | null, count: n },   // wrong answers in a row at this level+R
  pos: { 1: n, 2: n, 3: n, 4: n },           // answers given at each level (drives T and V)
  vb:  { 1: 0, 2: 0, 3: 0, 4: 0 },           // variant offset per level (reset to 0 on level-up)
  cells: { 'L-R': { attempts, wrong, cleared } },
  q, right                    // counters
}
```

- **New skill:** `status` is `open` if it has no prerequisites, otherwise `locked`. It starts at `level 1`, `r = min(2, rmax)` and all counters at 0.
- **Starter skills** (`starter: true`) start as `done`, at level 4.

## 4. Rules

### 4.1 Difficulty (R): applies on every level, L1–L4

The difficulty rules below apply only to the R levels a skill actually has.

| Skill has | Start | Right answer | 2 wrong in a row at the same R |
|---|---|---|---|
| R1, R2, R3 (`rmax 3`) | R2 | R1→R2, R2→R3. At R3 it counts toward the level streak instead. | R3→R2, R2→R1. R1 stays R1. |
| R1, R2 (`rmax 2`) | R2 | R1→R2. At R2 it counts toward the level streak instead. | R2→R1. R1 stays R1. |
| R1 only (`rmax 1`) | R1 | always counts toward the level streak | no change |

- A right answer that raises R **does not** count toward the "2 right in a row" streak.
- The wrong-in-a-row counter resets in three cases:
  - on any right answer;
  - after a drop, so a further drop needs 2 more misses;
  - when R changes.
- R never goes above `rmax` or below 1.
- **Climbing back from R1:**
  - Each right answer climbs one R.
  - A student is never promoted a level until they reach the skill's top R and answer 2 in a row there.
  - From R1 with no misses, that takes 4 rights on an `rmax 3` skill (R1→R2, R2→R3, then 2 in a row) and 3 rights on an `rmax 2` skill (R1→R2, then 2 in a row).
  - So 2 rights in a row at R1 take the student to R3, never to the next level.

### 4.2 Level

- **2 right answers in a row at the skill's top R** move the student up one level:
  - L1→L2→L3→L4.
  - The new level **keeps the current R**.
  - The new level starts at T1 V1.
- **2 right in a row on L4** mark the skill `done`.
- **A wrong answer** resets `rightStreak` to 0. The **level never drops**.

### 4.3 Question type and variant (unchanged)

- **Every answer moves on to the next question type of the level**, whether right or wrong.
- **Servable types:** `k` is the number of types that can be served at this level.
  - Type `n` (where `n = pos[level]`, 0-based) is `types[n mod k]`.
  - Variant is `((⌊n / k⌋ + vb[level]) mod 25) + 1`.
  - So the order is T1 V1, T2 V1, …, Tk V1, T1 V2, …
- **A type can be served** only when all of these hold:
  - its level is the current level;
  - the bank has live questions for (skill, level, type);
  - it is not in the skill's `skipped_types`;
  - if it is a branch type (`path`, `cover`): the skill is in the Decisions group or builds on a skill there;
  - in the hot seat: its `modes` include `hotseat` (unless the level has no such type; then any type).
- **Bank fallback:**
  - If the bank lacks the exact R, serve the nearest R it has (ties go to the lower R).
  - If it lacks the exact V, wrap round the variants it has.
  - The address still reports the student's R and wanted V.

### 4.4 Which skill is played, and unlocking

- **Active skill:** the first `open` skill in graph order that has something to serve at its current level.
- **Coming soon:** an open skill with nothing to serve. It is skipped, not cleared.
- **Prerequisites** are AND-of-OR. `req: [["S56","S8"], ["S26","S32"]]` means (S56 or S8) and (S26 or S32) must be `done`.
- **Unlocking:** when a skill becomes `done`, every `locked` skill whose prerequisites are now met opens.

## 5. `applyAnswer` (pseudocode)

```text
applyAnswer(skill S, state sk, servedType, ok):
  if sk.status != open: return nothing
  l, r = sk.level, sk.r
  sk.pos[l] += 1                                   # next type, always
  record cell[l-r]: attempts++, wrong++ if !ok, cleared if ok

  if ok:
    sk.streak = none                               # misses-in-a-row reset
    if r < S.rmax:          r = r + 1;  emit r_up {level l, from, to}       # no streak credit
    elif sk.rightStreak == 0: sk.rightStreak = 1
    elif l == 4:            sk.status = done; emit skill_done; unlock → emit unlock per skill
    else:                   l = l + 1 (keep r); sk.rightStreak = 0; emit level_up {from {l,r}, to {l,r}}
                            sk.pos[l] = 0; sk.vb[l] = 0
  else:
    sk.rightStreak = 0
    sk.streak = (key == "l-r") ? count + 1 : {key "l-r", count 1}
    if r > 1 and sk.streak.count >= 2:
                            r = r - 1; sk.streak = none; emit r_drop {level l, from, to}
  sk.level, sk.r = l, r
```

Transitions are stored one row each in `transitions(roll_no, skill, kind, detail, at)`.
The kinds are `r_up`, `r_drop`, `level_up`, `skill_done` and `unlock`.

## 6. Student-facing track (`levelTrack`, display only)

The track is sent with every engine view as `skills[id].track`. The client must not re-decide any rule.

| Field | Meaning |
|---|---|
| `climb` | the R values still to climb, `r+1 … rmax` (on any level) |
| `streak` / `need` | right answers in a row so far / 2 (`streak` is 0 while `climb` is non-empty) |
| `remaining` | `climb.length + 2 − streak`: right answers to the next level if none are missed |
| `next` | `{level, name}`, or `{skillDone: true}` on L4 |
| `onMiss` | `'drop_r'` (with `dropTo`) if the next miss would be the 2nd in a row above R1, else `'streak_reset'` |

## 7. Migrating saved state (`upgradeState`, runs on every load, idempotent)

- **Done skills** stay done. **Started skills** stay open.
- **New skills** are added to the state.
- **An untouched open skill** whose prerequisites are no longer met goes back to locked.
- **R** is clamped to the skill's current `rmax`.
- **No migration is needed for this rule change.** Students on L2–L4 are already at `rmax` and simply carry on.

## 8. Golden test vectors

Generated from `engine.js` with a full bank. Columns: the address served, the answer, the transition, and the state after.

**S7, rmax 3 (R1–R3):**

| Served | Ans | Transition | After |
|---|---|---|---|
| L1·T1·R2·V1 | ✔ | r_up | L1 R3, streak 0 |
| L1·T2·R3·V1 | ✘ | — | L1 R3, 1 miss |
| L1·T3·R3·V1 | ✘ | r_drop 3→2 | L1 R2 |
| L1·T4·R2·V1 | ✘ | — | L1 R2, 1 miss |
| L1·T5·R2·V1 | ✘ | r_drop 2→1 | L1 R1 |
| L1·T6·R1·V1 | ✔ | r_up | L1 R2 |
| L1·T1·R2·V2 | ✘ | — | L1 R2, 1 miss |
| L1·T2·R2·V2 | ✔ | r_up | L1 R3 (miss count reset) |
| L1·T3·R3·V2 | ✔ | — | L1 R3, streak 1 |
| L1·T4·R3·V2 | ✔ | level_up | L2 R3 |
| L2·T1·R3·V1 | ✔ | — | L2 R3, streak 1 |
| L2·T2·R3·V1 | ✔ | level_up | L3 R3 |

**S7, demoted to R1, then right answers only:**

| Served | Ans | Transition | After |
|---|---|---|---|
| L1·T6·R1·V1 | ✔ | r_up | L1 R2, streak 0 |
| L1·T1·R2·V2 | ✔ | r_up | L1 R3, streak 0 (still L1) |
| L1·T2·R3·V2 | ✔ | — | L1 R3, streak 1 |
| L1·T3·R3·V2 | ✔ | level_up | L2 R3 |

**S2, rmax 2 (R1–R2):**

| Served | Ans | Transition | After |
|---|---|---|---|
| L1·T1·R2·V1 | ✘ | — | L1 R2, 1 miss |
| L1·T2·R2·V1 | ✘ | r_drop 2→1 | L1 R1 |
| L1·T3·R1·V1 | ✔ | r_up | L1 R2 |
| L1·T4·R2·V1 | ✔ | — | L1 R2, streak 1 |
| L1·T5·R2·V1 | ✔ | level_up | L2 R2 |

**S1, rmax 1 (R1 only):**

| Served | Ans | Transition | After |
|---|---|---|---|
| L1·T1·R1·V1 | ✘ | — | L1 R1 |
| L1·T2·R1·V1 | ✘ | — | L1 R1 (no drop below R1) |
| L1·T3·R1·V1 | ✔ | — | L1 R1, streak 1 |
| L1·T4·R1·V1 | ✔ | level_up | L2 R1 |

## 9. Integration checklist for prod

1. **Copy the engine.** Copy `server/engine.js` as is. It has no dependencies and is pure ESM. Keep the graph and the question types in `server/content/`.
2. **Before serving, use the engine's address.** Call `upgradeState(G, state)`, then `activeSkill` and `address(G, avail, state, skillId, 'hotseat')`. Serve the question at the returned `skill / level / type / difficulty / variant`.
3. **After grading, persist.** Call `applyAnswer(G, state, skillId, servedType, correct)`. Persist `state`, the attempt row and each returned transition in one transaction.
4. **Send the view.** Send `view(G, avail, state)` to the client and render progress from `skills[id].track` only.
5. **Run the tests.** Run `npm test`. Port the vectors in §8 into prod's own tests if it uses a different runtime.
