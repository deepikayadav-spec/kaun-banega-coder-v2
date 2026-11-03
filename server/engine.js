// The KBC progression engine, ported from "KBC Progression Engine.html" (newState / address / applyAnswer).
// Pure functions: no database, no clock. The server loads the graph and the bank's availability and stores the state.
//
// Address: C Checkpoint > G Skill group > S Skill > L Level > T Question type > R Difficulty > V Variant.
// Rules (KBC Progression Engine, 31 Oct):
//   1. A skill opens once what it needs is done (AND-of-OR prerequisites). Each login resumes where the last ended.
//   2. Each level starts at T1 V1. Every answer, right or wrong, moves on to the next question type of that level.
//      Two right in a row moves up a level (L4 → skill done, which opens the skills that needed it).
//   3. Once every question type at a level has been tried, the types repeat with the next variant: T1 V2, T2 V2, …
//   4. R1 uses this skill only, R2 mixes in 1–2 earlier skills, R3 mixes in 3 or more. Difficulty moves as before:
//      on L1 a right answer below the skill's rmax raises R by one, and a miss on the starting R drops to R1;
//      L2–L4 play at rmax.
// Changes for the real bank:
//   - the graph is skill-graph.json (stored rmax, skipped_types honoured);
//   - a type is offered only if the bank has live questions for it at that skill and level;
//   - hot seat serves only types whose modes include "hotseat" (practice-only types come up in Practice);
//   - a skill with nothing to serve at its current level is "coming soon": it is not cleared, the next open skill is played;
//   - variety: after a right answer the level moves on to its next question type, and the type just answered right is
//     never served again straight away (when the level has another type). After a wrong answer the same type comes
//     back with a new variant, so "Try a similar question" really is similar.
export const VARIANTS = 25;
const LEVEL_NAMES = { 1: 'L1 Recognise', 2: 'L2 Reason', 3: 'L3 Repair', 4: 'L4 Create' };
const R_NAMES = { 1: 'R1 Low', 2: 'R2 Medium', 3: 'R3 Hard' };

export function compileGraph(graph, typesDoc) {
  const types = {};
  for (const t of typesDoc.types) types[t.key] = t;
  const order = typesDoc.types.map((t) => t.key);
  const branch = new Set(typesDoc.needs_branches || ['path', 'cover']);
  const skills = graph.skills.map((s) => ({ ...s, req: s.req || [] }));
  const idx = {};
  skills.forEach((s, i) => { idx[s.id] = i; });
  const decisions = (graph.groups.find((g) => /decision/i.test(g.name)) || { id: 'G5' }).id;
  for (const S of skills) {
    const seen = [], queue = S.req.flat();
    while (queue.length) {
      const n = queue.shift();
      if (seen.includes(n) || idx[n] == null) continue;
      seen.push(n);
      queue.push(...skills[idx[n]].req.flat());
    }
    S.earlier = seen;
    if (!S.rmax) S.rmax = seen.length >= 3 ? 3 : seen.length >= 1 ? 2 : 1;
    S.skip = Object.keys(S.skipped_types || {});
  }
  for (const S of skills) S.branchOK = S.group === decisions || S.earlier.some((e) => skills[idx[e]].group === decisions);
  const groups = graph.groups.map((g) => ({ ...g, skills: skills.filter((s) => s.group === g.id).map((s) => s.id) }));
  return { checkpoints: graph.checkpoints, groups, skills, idx, types, order, branch };
}

// avail[skill][level][type][r] = sorted list of live variants
export function buildAvail(rows) {
  const a = {};
  for (const q of rows) {
    const t = (((a[q.skill] ||= {})[q.level] ||= {})[q.type] ||= {});
    (t[q.difficulty] ||= []).push(q.variant);
  }
  for (const s in a) for (const l in a[s]) for (const t in a[s][l]) for (const r in a[s][l][t]) a[s][l][t][r].sort((x, y) => x - y);
  return a;
}

export function typesFor(G, avail, S, l, mode) {
  const base = G.order.filter((k) => G.types[k].level === l && (!G.branch.has(k) || S.branchOK) && !S.skip.includes(k)
    && avail[S.id] && avail[S.id][l] && avail[S.id][l][k]);
  if (!mode) return base;
  const m = base.filter((k) => (G.types[k].modes || []).includes(mode));
  return m.length ? m : base;
}

// Starter skills (starter: true in the graph) count as done from the start: "the starter skills are done".
const blankSkill = (S) => ({ status: S.starter ? 'done' : S.req.length ? 'locked' : 'open', level: S.starter ? 4 : 1, r: Math.min(2, S.rmax), cells: {},
  streak: { key: null, count: 0 }, rightStreak: 0, tIdx: { 1: 0, 2: 0, 3: 0, 4: 0 }, vars: {}, q: 0, right: 0,
  pos: { 1: 0, 2: 0, 3: 0, 4: 0 }, vb: { 1: 0, 2: 0, 3: 0, 4: 0 } });

export function newState(G) {
  const skills = {};
  for (const S of G.skills) skills[S.id] = blankSkill(S);
  const st = { v: 1, skills, q: 0, right: 0, drops: 0, retries: 0, used: {} };
  unlock(G, st); // skills that need only starter skills open at once
  return st;
}

const reqMet = (S, st) => S.req.every((alts) => alts.some((a) => st.skills[a] && st.skills[a].status === 'done'));

// A state saved against an older (or newer) graph. Earned progress is kept: done skills stay done and a started skill
// stays open. New skills are added; an untouched open skill whose prerequisites changed is locked again; skills whose
// prerequisites are now met open; R is clamped to the skill's rmax. State for skills no longer in the graph is left
// alone (nothing reads it) so it comes back if the skill does. Idempotent: it runs on every load.
export function upgradeState(G, st) {
  if (!st || !st.skills) return newState(G);
  for (const S of G.skills) {
    const sk = st.skills[S.id];
    if (!sk) { st.skills[S.id] = blankSkill(S); continue; }
    if (S.starter && sk.status !== 'done') { sk.status = 'done'; sk.level = 4; continue; }
    if (sk.status === 'open' && !sk.q && !reqMet(S, st)) sk.status = 'locked';
    if (sk.r > S.rmax) sk.r = S.rmax;
  }
  unlock(G, st);
  return st;
}

function unlock(G, st) {
  const opened = [];
  for (const S of G.skills) {
    const ss = st.skills[S.id];
    if (ss.status === 'locked' && reqMet(S, st)) {
      ss.status = 'open';
      opened.push(S.id);
    }
  }
  return opened;
}

export const playable = (G, avail, st, id) => typesFor(G, avail, G.skills[G.idx[id]], st.skills[id].level).length > 0;

// The skill to play now: the first open skill (graph order) that has questions at its current level.
export function activeSkill(G, avail, st) {
  const open = G.skills.filter((S) => st.skills[S.id].status === 'open');
  if (!open.length) return { id: null, allDone: true };
  const p = open.find((S) => playable(G, avail, st, S.id));
  return p ? { id: p.id } : { id: null, comingSoon: open.map((S) => S.id) };
}

// The level's place in its cycle: question n (0, 1, 2, …) of a level with k types is type n mod k, variant ⌊n / k⌋ + 1.
const posOf = (sk) => { sk.pos ||= { 1: 0, 2: 0, 3: 0, 4: 0 }; sk.vb ||= { 1: 0, 2: 0, 3: 0, 4: 0 }; return sk.pos[sk.level] || 0; };
export function typeFor(G, avail, st, id, mode) {
  const S = G.skills[G.idx[id]], sk = st.skills[id], list = typesFor(G, avail, S, sk.level, mode);
  if (!list.length) return null;
  return list[posOf(sk) % list.length];
}

export function nextV(st, id, type, G, avail, mode) {
  const sk = st.skills[id], n = posOf(sk);
  const k = G ? Math.max(1, typesFor(G, avail, G.skills[G.idx[id]], sk.level, mode).length) : 1;
  return ((Math.floor(n / k) + (sk.vb[sk.level] || 0)) % VARIANTS) + 1;
}

export function mixFor(G, id, r) {
  const S = G.skills[G.idx[id]];
  return r === 1 ? [] : r === 2 ? S.earlier.slice(0, 2) : S.earlier.slice(0, Math.max(3, S.earlier.length));
}

// Where the student is: the address of the next question. The bank may not have that exact R or V:
// the nearest R it has is used, and the variant wraps round the variants it has.
export function address(G, avail, st, id, mode) {
  const S = G.skills[G.idx[id]], sk = st.skills[id], type = typeFor(G, avail, st, id, mode);
  if (!type) return null;
  const want = nextV(st, id, type, G, avail, mode), byR = avail[id][sk.level][type];
  const rs = Object.keys(byR).map(Number);
  const r = rs.includes(sk.r) ? sk.r : rs.sort((a, b) => Math.abs(a - sk.r) - Math.abs(b - sk.r) || a - b)[0];
  const vs = byR[r], variant = vs.includes(want) ? want : vs[(want - 1) % vs.length];
  return { skill: id, C: S.cp, G: S.group, level: sk.level, type, T: G.types[type].T, r: sk.r, difficulty: r, variant, wantV: want,
    code: `${S.cp}·${S.group}·${id}·L${sk.level}·${G.types[type].T}·R${sk.r}·V${want}`, mix: mixFor(G, id, sk.r) };
}

// Apply one answer to the skill the question was served for. `type` is the type that was served.
// Returns the transitions (for the history table) and a short message.
export function applyAnswer(G, st, id, type, ok) {
  const S = G.skills[G.idx[id]], sk = st.skills[id], tr = [];
  if (!S || !sk || sk.status !== 'open') return { transitions: tr, msg: '' };
  const l = sk.level, r = sk.r, start = Math.min(2, S.rmax);
  posOf(sk); sk.pos[l] = (sk.pos[l] || 0) + 1;   // rule 2: every answer moves on to the next type
  st.used[type] = (st.used[type] || 0) + 1;
  const ck = l + '-' + r, cell = sk.cells[ck] || (sk.cells[ck] = { attempts: 0, wrong: 0, cleared: false });
  cell.attempts++; st.q++; sk.q++;
  if (ok) { st.right++; sk.right++; cell.cleared = true; } else cell.wrong++;
  let nl = l, nr = r, done = false, msg = '';
  if (ok) {
    sk.streak = { key: null, count: 0 };
    if (l === 1 && r < S.rmax) { nr = r + 1; msg = 'Up to ' + R_NAMES[nr] + '.'; tr.push({ kind: 'r_up', detail: { level: l, from: r, to: nr } }); }
    else if (!sk.rightStreak) { sk.rightStreak = 1; msg = 'One more right to ' + (l < 4 ? 'reach ' + LEVEL_NAMES[l + 1] : 'finish the skill') + '.'; }
    else if (l === 4) { done = true; msg = 'Skill done.'; }
    else {
      nl = l + 1; nr = S.rmax; sk.rightStreak = 0; msg = 'Promoted to ' + LEVEL_NAMES[nl] + '.';
      tr.push({ kind: 'level_up', detail: { from: { l, r }, to: { l: nl, r: nr } } });
    }
  } else {
    sk.rightStreak = 0;
    if (sk.streak.key === ck) sk.streak.count++; else sk.streak = { key: ck, count: 1 };
    if (l === 1 && r === start && r > 1) { nr = 1; st.drops++; msg = 'Down to R1 Low.'; tr.push({ kind: 'r_drop', detail: { level: l, from: r, to: 1 } }); }
    else { st.retries++; msg = 'On to the next question type.'; }
  }
  if (nl !== l) { sk.pos[nl] = 0; sk.vb[nl] = 0; }   // each level starts at T1 V1
  sk.level = nl; sk.r = nr;
  if (done) {
    sk.status = 'done';
    tr.push({ kind: 'skill_done', detail: {} });
    for (const o of unlock(G, st)) tr.push({ kind: 'unlock', skill: o, detail: { by: id } });
  }
  return { transitions: tr, msg, done };
}

// Progress of one skill, 0..1, for maps and rings: two rights per level, four levels.
export function skillProgress(sk) {
  if (!sk) return 0;
  if (sk.status === 'done') return 1;
  // At L1 a right answer first climbs R (R2 → R3) before the two-in-a-row streak; that climb counts as half a step,
  // so the path shows movement from the first right answer.
  const climb = sk.level === 1 ? Math.max(0, (sk.r || 1) - 2) * 0.5 : 0;
  return Math.min(0.99, ((sk.level - 1) * 2 + (sk.rightStreak ? 1 : 0) + climb) / 8);
}

// What moves the student up from where they are now, read off the same inputs applyAnswer uses (level, r, rmax,
// rightStreak, the starting R). Display only: it never changes the state. null for a skill that is not open.
//   climb:     L1 only, the R values still to climb (each right answer raises R by one until rmax)
//   streak/need: the two-in-a-row slots and how many are filled
//   remaining: right answers still needed, if none are missed
//   onMiss:    what a miss does here ("drop_r1" on L1 at the starting R above R1, else "streak_reset")
export function levelTrack(S, sk) {
  if (!S || !sk || sk.status !== 'open') return null;
  const l = sk.level, r = sk.r || 1, rmax = S.rmax || 1, start = Math.min(2, rmax);
  const climb = [];
  if (l === 1) for (let x = r + 1; x <= rmax; x++) climb.push(x);
  const streak = climb.length ? 0 : Math.min(1, sk.rightStreak || 0), need = 2;
  return {
    level: l, levelName: LEVEL_NAMES[l].slice(3), r, rmax, climb, streak, need,
    remaining: climb.length + need - streak,
    next: l < 4 ? { level: l + 1, name: LEVEL_NAMES[l + 1].slice(3) } : { skillDone: true },
    onMiss: l === 1 && r === start && r > 1 ? 'drop_r1' : 'streak_reset'
  };
}

// A compact view of the state for the client: every skill's status, level, R and progress.
export function view(G, avail, st, graphVersion = null) {
  const act = activeSkill(G, avail, st);
  const skills = {};
  for (const S of G.skills) {
    const sk = st.skills[S.id];
    const hasAny = !!avail[S.id];
    skills[S.id] = { status: sk.status, level: sk.level, r: sk.r, rightStreak: sk.rightStreak, progress: skillProgress(sk),
      content: hasAny ? (playable(G, avail, st, S.id) ? 'ready' : 'partial') : 'none',
      cells: sk.cells, q: sk.q, right: sk.right, track: levelTrack(S, sk) };
  }
  const groupsDone = G.groups.map((g) => g.skills.every((id) => st.skills[id].status === 'done'));
  return { graphVersion, active: act.id, allDone: !!act.allDone, comingSoon: act.comingSoon || null, skills, groupsDone, q: st.q, right: st.right };
}

// The prize ladder: one rung per skill group plus the finale, always from ₹10 to ₹7 crore. The original 15-rung
// ladder is kept exactly when the graph has 14 groups; otherwise rungs are picked evenly from a pool of round amounts.
export const CLASSIC_LADDER = [10, 20, 50, 100, 200, 500, 1000, 5000, 10000, 1e5, 1e6, 5e6, 1e7, 3e7, 7e7];
const POOL = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7, 2e7, 3e7, 5e7, 7e7];
export function ladderFor(nGroups) {
  const n = Math.max(2, nGroups + 1);
  if (n === CLASSIC_LADDER.length) return CLASSIC_LADDER.slice();
  if (n <= POOL.length) return Array.from({ length: n }, (_, i) => POOL[Math.round(i * (POOL.length - 1) / (n - 1))]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = 10 * Math.pow(7e6, i / (n - 1)), p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    out.push(Math.max(Math.round(v / p) * p, (out[i - 1] || 0) + 1));
  }
  out[n - 1] = 7e7;
  return out;
}
