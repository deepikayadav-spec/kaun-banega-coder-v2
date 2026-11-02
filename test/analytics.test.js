import test from 'node:test';
import assert from 'node:assert/strict';
import { recordPing } from '../server/analytics.js';

// The ping adds the real gap while the tab stays visible, and only 15 s after the tab was hidden for a while.
test('activity ping: real gap up to 45 s, 15 s after a long gap or on the first ping', async () => {
  const added = [];
  let last = null;
  const run = async (sql, ...a) => { added.push(a[a.length - 1]); last = a[3]; };
  const one = async () => (last == null ? null : { last_at: last });
  const realNow = Date.now;
  try {
    let t = 1_700_000_000_000;
    Date.now = () => t;
    await recordPing(run, one, 'R1');          // first ping of the day
    t += 30_000; await recordPing(run, one, 'R1');   // visible, normal interval
    t += 10 * 60_000; await recordPing(run, one, 'R1');   // came back after 10 minutes hidden
    assert.deepEqual(added, [15000, 30000, 15000]);
  } finally { Date.now = realNow; }
});
