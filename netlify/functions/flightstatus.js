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
const CACHE_TTL_MS = 4 * 60 * 1000;
const CACHE_MAX = 200;

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
  else if (depDelay != null && depDelay >= 5) note = `Departure is running about ${depDelay} minutes late.`;
  else if (arrDelay != null && arrDelay >= 10) note = `Arrival is running about ${arrDelay} minutes late.`;

  delete dep._sched; delete dep._rev; delete arr._sched; delete arr._rev;

  return {
    live: true,
    phase,
    note,
    durationMin: durationMin != null && durationMin > 0 ? durationMin : null,
    progress,
    dep, arr,
    updatedAt: asDate({ utc: flight.lastUpdatedUtc }) ? new Date(String(flight.lastUpdatedUtc).replace(' ', 'T')).getTime() : Date.now(),
    source: 'AeroDataBox',
  };
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
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return ok({ ...hit.payload, cached: true });

  let res;
  try {
    res = await fetch(`https://${RAPIDAPI_HOST}/flights/number/${encodeURIComponent(flight)}/${date}?withAircraftImage=false&withLocation=false`, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPIDAPI_HOST },
    });
  } catch (e) {
    return ok({ live: false, reason: 'network' });
  }

  // 204 = the flight simply isn't in the feed for that date; 429 = quota spent.
  if (res.status === 204 || res.status === 404) return ok({ live: false, reason: 'not-found' });
  if (res.status === 429) return ok({ live: false, reason: 'quota' });
  if (!res.ok) return ok({ live: false, reason: 'upstream-' + res.status });

  let body;
  try { body = await res.json(); } catch (e) { return ok({ live: false, reason: 'bad-response' }); }
  const flights = Array.isArray(body) ? body : (body ? [body] : []);
  if (!flights.length) return ok({ live: false, reason: 'not-found' });

  // A number can return several legs (multi-sector or codeshare); take the first that
  // has both ends, else the first one at all.
  const chosen = flights.find(f => f && f.departure && f.arrival) || flights[0];
  let payload;
  try { payload = normalise(chosen); } catch (e) { return ok({ live: false, reason: 'parse' }); }

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { at: Date.now(), payload });
  return ok(payload);
};
