// Local server: PGlite in data/pglite unless DATABASE_URL is set. Seeds the built-in content on first start.
import app from '../server/app.js';
import { config } from '../server/config.js';
app.listen(config.port, () => console.log(`Kaun Banega Coder on http://localhost:${config.port}  (admin: /admin)`));
