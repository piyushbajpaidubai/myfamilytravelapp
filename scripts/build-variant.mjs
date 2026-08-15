// Build the web app as one of its variants, and stamp which one it is.
//
//   node scripts/build-variant.mjs travel
//   node scripts/build-variant.mjs school
//
// The stamp is what stops the Android build packaging the travel app under the school's
// name: `npx cap sync` copies this bundle into a single shared assets directory, so the
// only way to tell afterwards which app is in there is to have written it down.
//
// The environment is set here rather than on the command line because the syntax for
// that differs between PowerShell, cmd and a POSIX shell, and getting it wrong fails
// silently — you get a travel build with a school name on it.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VARIANTS = ['travel', 'school'];

const variant = (process.argv[2] || '').toLowerCase();
if (!VARIANTS.includes(variant)) {
  console.error(`Usage: node scripts/build-variant.mjs <${VARIANTS.join('|')}>`);
  process.exit(1);
}

// The school app has its own Supabase project. Building it without one configured would
// produce an app that either refuses to start or, worse, talks to the travel database —
// so say so here, where it is cheap to fix, rather than after the APK is on a phone.
if (variant === 'school') {
  const missing = ['REACT_APP_SUPABASE_URL', 'REACT_APP_SUPABASE_ANON_KEY', 'REACT_APP_SITE_URL']
    .filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`\nThe school build needs its own backend. Not set: ${missing.join(', ')}\n`);
    console.error('On Netlify these are the site\'s environment variables. Locally, set them');
    console.error('for the command — they are build-time only and never read at run time.\n');
    process.exit(1);
  }
}

console.log(`Building the ${variant} app…`);
const res = spawnSync('npm', ['run', 'build'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,                      // npm is a shim on Windows
  env: { ...process.env, REACT_APP_VARIANT: variant, CI: process.env.CI ?? 'true' },
});
if (res.status !== 0) process.exit(res.status ?? 1);

const stamp = path.join(ROOT, 'build', 'variant.txt');
fs.writeFileSync(stamp, variant + '\n');
console.log(`\nStamped ${path.relative(ROOT, stamp)} as "${variant}".`);
console.log(`Next: npx cap sync android && cd android && gradlew assemble${variant[0].toUpperCase()}${variant.slice(1)}Release`);
