// Vercel build step. The site is static files in public/ plus the API function; nothing to bundle.
// It only checks that the content files parse, so a broken upload of server/content fails the deploy, not the site.
import fs from 'node:fs';
for (const f of ['skill-graph.json', 'question-types.json', 'bank-S1-full.json', 'upload-bundle.example.json']) JSON.parse(fs.readFileSync('server/content/' + f, 'utf8'));
for (const f of ['index.html', 'login.html', 'reset.html', 'admin.html', 'game.js', 'kbc.css', 'bank-ui.js', 'bank-ui.css', 'pyrun.worker.js', 'intro.js', 'intro.css', 'media/intro-audio.m4a', 'media/pixel/pointq.webp']) if (!fs.existsSync('public/' + f)) throw new Error('missing public/' + f);
console.log('build ok');
