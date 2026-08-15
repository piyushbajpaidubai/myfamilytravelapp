// One codebase, two apps.
//
// The personal travel app and the school trip app are the same product with different
// names, different backends and — in time — different vocabulary and features. Everything
// that differs between them belongs here and nowhere else, so that adding the third one
// is a matter of adding an entry rather than hunting through six thousand lines.
//
// The variant is chosen at BUILD time, not run time:
//
//   node scripts/build-variant.mjs travel   → the travel app (also plain `npm run build`)
//   node scripts/build-variant.mjs school   → the school app
//
// On Netlify each site sets its own environment variables, so the same repository
// produces both. Create React App inlines REACT_APP_* at build time; nothing here is read
// at run time and nothing can be switched by a user.

// Webpack replaces process.env.REACT_APP_VARIANT with a literal before minifying, so this
// comparison folds to a constant and whichever branch below is unused gets eliminated.
// That is what keeps one app's backend out of the other's bundle — not merely unused at
// run time, but absent. Written as a direct comparison for exactly that reason: wrap it
// in String() or .toLowerCase() and it stops folding, and both backends ship in both.
const IS_SCHOOL = process.env.REACT_APP_VARIANT === 'school';

const TRAVEL = {
  variant: 'travel',
  appName: 'My Travel Hub',
  tagline: 'Every Trip, Every Document, Everyone',
  logo: '/logo-travelhub.png',
  // The site this build is served from: every Netlify function it calls lives beneath it,
  // and share links point at it. The default keeps the travel app working with nothing
  // configured, which is how it has always been deployed.
  site: process.env.REACT_APP_SITE_URL || 'https://mytravelhub.netlify.app',
  // The anon key is public by design — it is in the shipped bundle either way, and is
  // useless without the row-level policies behind it. The service key is a different
  // thing entirely and never leaves the Netlify functions.
  supabaseUrl: process.env.REACT_APP_SUPABASE_URL || 'https://lafpiwlpjvongtdtzuam.supabase.co',
  supabaseAnonKey: process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhZnBpd2xwanZvbmd0ZHR6dWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjUyNDgsImV4cCI6MjA5Njg0MTI0OH0.cdDldzH4xrPYWZgdqeYOCBk7u34CtZWT6L2ldx3qYRk',
};

const SCHOOL = {
  variant: 'school',
  // Placeholders. Nothing about the school app's presentation is decided yet, and
  // guessing at it here would only have to be undone.
  appName: 'School Trip Hub',
  tagline: 'Every Trip, Every Student, Every Document',
  logo: '/logo-travelhub.png',
  // No defaults on purpose. The school app has its own Supabase project and its own
  // Netlify site; falling through to the travel app's would put a school's students in a
  // personal trips database. scripts/build-variant.mjs refuses to build without them, and
  // the check below refuses to start if one ever slips through.
  site: process.env.REACT_APP_SITE_URL || '',
  supabaseUrl: process.env.REACT_APP_SUPABASE_URL || '',
  supabaseAnonKey: process.env.REACT_APP_SUPABASE_ANON_KEY || '',
};

const CHOSEN = IS_SCHOOL ? SCHOOL : TRAVEL;

if (!(CHOSEN.site && CHOSEN.supabaseUrl && CHOSEN.supabaseAnonKey)) {
  throw new Error(
    `The ${CHOSEN.variant} build is missing its own site or database. Set `
    + 'REACT_APP_SITE_URL, REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY for '
    + 'this deployment before building.'
  );
}

export const BRAND = { ...CHOSEN, site: CHOSEN.site.replace(/\/+$/, '') };

// Where the functions live for this build. Anything calling out to the backend goes
// through here rather than writing the host again.
export const FN = (name) => `${BRAND.site}/.netlify/functions/${name}`;

// For the school features that do not exist yet. A flag reads better at the call site
// than comparing strings, and keeps the check in one place when it grows.
export const isSchool = IS_SCHOOL;
