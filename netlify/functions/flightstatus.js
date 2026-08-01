// Live flight status via AeroDataBox on RapidAPI.
//
// The RapidAPI key lives here, in the function's environment — never in the app bundle,
// which anyone can unzip out of the APK and read.
//
// Endpoint (verified against AeroDataBox's OpenAPI spec):
//   GET /flights/number/{flightNumber}/{YYYY-MM-DD}  ->  FlightContract[]
// Each contract carries departure/arrival objects with airport{iata,name,municipalityName},
// scheduledTime/revisedTime {utc,local}, terminal, gate, plus a top-level status enum.

const RAPIDAPI_HOST = 'aerodatabox.p.rapidapi.com';
const CACHE_MAX = 200;

// How long a result stays usable depends on how fast it can change. A flight six hours
// out barely moves; one on approach moves every minute. Re-asking at the same rate for
// both is what burned through requests.
const MIN = 60 * 1000;
function cacheTtlFor(phase, minutesToDeparture) {
  if (phase === 'airborne' || phase === 'approaching') return 3 * MIN;
  if (phase === 'boarding' || phase === 'gateclosed') return 5 * MIN;
  if (phase === 'landed' || phase === 'cancelled' || phase === 'diverted') return 60 * MIN;
  if (minutesToDeparture == null) return 30 * MIN;
  if (minutesToDeparture < 0) return 10 * MIN;   // overdue — updates matter again
  if (minutesToDeparture <= 120) return 5 * MIN;
  if (minutesToDeparture <= 360) return 20 * MIN;
  return 60 * MIN;                                // more than six hours out
}

// Module scope survives between invocations while the container stays warm, so several
// travellers opening the same trip usually share one upstream call. It is a best-effort
// saving, not a guarantee — a cold start starts with an empty map.
const cache = new Map();

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ok = (payload) => ({ statusCode: 200, headers, body: JSON.stringify(payload) });

// "2026-08-01 16:00+04:00" -> "16:00" (the date part has no colon, so the first match is the time)
const hhmm = (dt) => {
  const m = /(\d{2}):(\d{2})/.exec(String((dt && dt.local) || ''));
  return m ? `${m[1]}:${m[2]}` : '';
};
// AeroDataBox uses a space between date and time; Date needs the T.
const asDate = (dt) => {
  const raw = String((dt && dt.utc) || '').trim();
  if (!raw) return null;
  const d = new Date(raw.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
};
const minutesBetween = (a, b) => (a && b) ? Math.round((b.getTime() - a.getTime()) / 60000) : null;

// AeroDataBox status enum -> the phases the card knows about.
const PHASE_BY_STATUS = {
  Unknown: 'scheduled', Expected: 'scheduled',
  CheckIn: 'checkin', Boarding: 'boarding', GateClosed: 'gateclosed',
  Departed: 'airborne', EnRoute: 'airborne', Approaching: 'approaching',
  Arrived: 'landed', Delayed: 'delayed',
  Canceled: 'cancelled', CanceledUncertain: 'cancelled', Diverted: 'diverted',
};

const side = (mv) => {
  const airport = (mv && mv.airport) || {};
  const scheduled = mv && mv.scheduledTime;
  // revisedTime is the airport's own update; predictedTime is AeroDataBox's estimate.
  const revised = (mv && (mv.revisedTime || mv.predictedTime)) || null;
  const schedHHMM = hhmm(scheduled);
  const revHHMM = hhmm(revised);
  return {
    code: airport.iata || '',
    city: airport.municipalityName || airport.shortName || airport.name || '',
    scheduled: schedHHMM,
    // Only call it an estimate when it actually differs from the schedule.
    estimated: revHHMM && revHHMM !== schedHHMM ? revHHMM : '',
    terminal: mv && mv.terminal ? String(mv.terminal) : '',
    gate: mv && mv.gate ? String(mv.gate) : '',
    _sched: asDate(scheduled),
    _rev: asDate(revised),
  };
};

function normalise(flight) {
  const dep = side(flight.departure);
  const arr = side(flight.arrival);

  let phase = PHASE_BY_STATUS[flight.status] || 'scheduled';
  // A flight can be running late without the feed setting status=Delayed, which is how
  // "DEPARTING LATE" shows up on Google's panel. Only meaningful before it leaves.
  const depDelay = minutesBetween(dep._sched, dep._rev);
  if (depDelay != null && depDelay >= 5 && ['scheduled','checkin','boarding','gateclosed'].includes(phase)) {
    phase = 'delayed';
  }

  // Sanity gate. A record can go stale — we have seen the feed still reporting a flight
  // as en route hours after that snapshot, while its own departure time was still in the
  // future. A flight cannot be flying before it is due to leave, so when the status
  // contradicts the clock, trust the clock and fall back to the schedule.
  const depTime = dep._rev || dep._sched;
  const notDueYet = depTime && Date.now() < depTime.getTime() - 5 * 60000;
  let staleStatus = false;
  if (notDueYet && ['airborne','approaching','landed'].includes(phase)) {
    // The whole record is suspect, not just the status field — so drop its revised times
    // too and show the schedule alone. Anything else would contradict the note below.
    phase = 'scheduled';
    dep.estimated = ''; arr.estimated = '';
    staleStatus = true;
  }

  const durationMin = minutesBetween(dep._rev || dep._sched, arr._rev || arr._sched);

  // Where the aircraft sits on the track.
  let progress = 0;
  if (phase === 'landed') progress = 1;
  else if (phase === 'approaching') progress = 0.9;
  else if (phase === 'airborne') {
    const start = dep._rev || dep._sched, end = arr._rev || arr._sched;
    if (start && end && end > start) {
      const frac = (Date.now() - start.getTime()) / (end.getTime() - start.getTime());
      progress = Math.min(0.95, Math.max(0.05, frac));
    } else progress = 0.5;
  }

  const arrDelay = minutesBetween(arr._sched, arr._rev);
  let note = '';
  if (phase === 'cancelled') note = 'This flight is showing as cancelled — check with the airline.';
  else if (phase === 'diverted') note = 'This flight has been diverted from its scheduled destination.';
  else if (staleStatus) note = 'Live status looks out of date — showing the schedule.';
  else if (depDelay != null && depDelay >= 5) note = `Departure is running about ${depDelay} minutes late.`;
  else if (arrDelay != null && arrDelay >= 10) note = `Arrival is running about ${arrDelay} minutes late.`;

  const minutesToDeparture = depTime ? Math.round((depTime.getTime() - Date.now()) / 60000) : null;
  const ttlMs = cacheTtlFor(phase, minutesToDeparture);

  // Absolute times, so the card can work out elapsed/remaining. The HH:MM strings can't
  // do it — they're each in a different airport's local zone.
  const arrTime = arr._rev || arr._sched;
  const depEpoch = depTime ? depTime.getTime() : null;
  const arrEpoch = arrTime ? arrTime.getTime() : null;

  delete dep._sched; delete dep._rev; delete arr._sched; delete arr._rev;

  return { ttlMs, payload: {
    live: true,
    phase,
    staleStatus,
    note,
    durationMin: durationMin != null && durationMin > 0 ? durationMin : null,
    progress,
    depEpoch, arrEpoch,
    dep, arr,
    updatedAt: asDate({ utc: flight.lastUpdatedUtc }) ? new Date(String(flight.lastUpdatedUtc).replace(' ', 'T')).getTime() : Date.now(),
    source: 'AeroDataBox',
  } };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const key = process.env.RAPIDAPI_KEY;
  if (!key) return ok({ live: false, reason: 'not-configured' });

  const q = event.queryStringParameters || {};
  const flight = String(q.flight || '').replace(/[\s-]+/g, '').toUpperCase();
  const date = String(q.date || '').slice(0, 10);
  if (!/^[A-Z0-9]{2,3}\d{1,4}$/.test(flight)) return ok({ live: false, reason: 'bad-flight-number' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ok({ live: false, reason: 'bad-date' });

  const cacheKey = `${flight}|${date}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < hit.ttlMs) return ok({ ...hit.payload, cached: true });

  let res;
  try {
    // dateLocalRole=Departure: the default (Both) also returns legs that merely ARRIVE on
    // this date, so a daily rotation can hand back the previous day's flight.
    res = await fetch(`https://${RAPIDAPI_HOST}/flights/number/${encodeURIComponent(flight)}/${date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false`, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPIDAPI_HOST },
    });
  } catch (e) {
    return ok({ live: false, reason: 'network' });
  }

  // 204 = the flight simply isn't in the feed for that date.
  if (res.status === 204 || res.status === 404) return ok({ live: false, reason: 'not-found' });
  // 429 covers BOTH the per-second rate limit and the monthly allowance, which look
  // identical apart from RapidAPI's remaining-requests header. Treat a non-zero
  // remainder as a momentary rate limit rather than telling the user they're out.
  if (res.status === 429) {
    const left = parseInt(res.headers.get('x-ratelimit-requests-remaining') || '', 10);
    return ok({ live: false, reason: Number.isFinite(left) && left > 0 ? 'busy' : 'quota' });
  }
  if (!res.ok) return ok({ live: false, reason: 'upstream-' + res.status });

  let body;
  try { body = await res.json(); } catch (e) { return ok({ live: false, reason: 'bad-response' }); }
  const flights = Array.isArray(body) ? body : (body ? [body] : []);
  if (!flights.length) return ok({ live: false, reason: 'not-found' });

  // A number can return several legs (multi-sector, codeshare, or adjacent days).
  // Prefer the one that actually departs on the requested date; belt-and-braces on top
  // of dateLocalRole above.
  const departsOn = (f) => String((((f || {}).departure || {}).scheduledTime || {}).local || '').slice(0, 10);
  const usable = flights.filter(f => f && f.departure && f.arrival);
  const chosen = usable.find(f => departsOn(f) === date) || usable[0] || flights[0];
  let result;
  try { result = normalise(chosen); } catch (e) { return ok({ live: false, reason: 'parse' }); }
  const { payload, ttlMs } = result;

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { at: Date.now(), ttlMs, payload });
  return ok(payload);
};
