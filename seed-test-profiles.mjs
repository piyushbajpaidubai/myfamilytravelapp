// Seed 10 animal test profiles for large-group testing.
// Run once:  node seed-test-profiles.mjs
//
// Each profile is created via the app's own public signup endpoint using the
// SAME auto-password scheme as the app (mth_<username>_tester9), so you can log
// into any of them from the app by entering just the username and leaving the
// password blank. Re-running is safe — existing names are reported and skipped.

const SUPA_URL = 'https://lafpiwlpjvongtdtzuam.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhZnBpd2xwanZvbmd0ZHR6dWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjUyNDgsImV4cCI6MjA5Njg0MTI0OH0.cdDldzH4xrPYWZgdqeYOCBk7u34CtZWT6L2ldx3qYRk';
const AUTH_DOMAIN = 'users.mytravelhub.com';

const NAMES = ['Lion', 'Dog', 'Cat', 'Hippo', 'Rhino', 'Elephant', 'Giraffe', 'Rabbit', 'Rat', 'Duck'];

const norm = (s) => s.trim().toLowerCase();
const autoPassword = (userId) => 'mth_' + norm(userId) + '_tester9';

async function createProfile(name) {
  const userId = norm(name);
  const res = await fetch(SUPA_URL + '/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: userId + '@' + AUTH_DOMAIN,
      password: autoPassword(userId),
      data: { user_id: userId, traveler_name: name, role: 'captain' },
    }),
  });
  const j = await res.json().catch(() => ({}));
  const code = j.error_code || '';
  const msg = j.msg || j.error_description || j.error || '';
  if (res.ok || j.access_token || j.id || j.user) return { name, status: 'created' };
  if (/registered|already|exists/i.test(msg) || code === 'user_already_exists') return { name, status: 'already exists' };
  return { name, status: 'FAILED: ' + (msg || res.status) };
}

(async () => {
  console.log('Seeding ' + NAMES.length + ' test profiles…\n');
  for (const name of NAMES) {
    const r = await createProfile(name);
    console.log('  ' + r.name.padEnd(10) + ' → ' + r.status);
  }
  console.log('\nDone. Log into any of them from the app: enter the username (e.g. "lion"), leave password blank.');
})();
