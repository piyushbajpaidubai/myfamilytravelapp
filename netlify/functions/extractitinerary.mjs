// Turns an uploaded itinerary PDF into the structured items the import review screen
// shows. The Anthropic key lives here and only here — anything in src/ ships inside the
// APK, which anyone can unzip.
//
// This is a Netlify v2 function (export default, ESM) rather than the v1 exports.handler
// the other functions use. That is deliberate: v1 cannot stream, and a synchronous
// function is capped at 10 seconds, which an extraction on a multi-page PDF comfortably
// exceeds. Streaming keeps bytes flowing so the connection stays open.
//
// The response is newline-delimited JSON, one object per line:
//   {"type":"progress"}                — keepalive, sent while the model works
//   {"type":"done","data":{...}}       — the extraction
//   {"type":"error","error":"..."}     — a readable failure
// The caller can read it as a stream or just await the whole body; the last non-progress
// line is the result either way.

import Anthropic from '@anthropic-ai/sdk';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Documents live in one public Supabase bucket. Restricting to it keeps this from
// becoming a general-purpose URL fetcher — the same reasoning as resolvelink.js.
const DOC_PREFIX = 'https://lafpiwlpjvongtdtzuam.supabase.co/storage/v1/object/public/trip-media/';
const MAX_PDF_BYTES = 24 * 1024 * 1024;   // the API's own request ceiling is 32MB

// Every field the review screen and mergeItinerary() read, in one flat shape. A strict
// schema wants each property listed as required, so non-applicable ones come back as ""
// rather than being omitted — "" is exactly what the merge already treats as absent.
const ITEM_FIELDS = {
  kind:      { type:'string', enum:['travel','stay','event','task'], description:'travel = a journey, stay = accommodation, event = something scheduled on one day, task = a to-do or reminder' },
  title:     { type:'string', description:'Short name. For a task use "" and put the wording in text.' },
  text:      { type:'string', description:'Task wording only; "" for every other kind.' },
  location:  { type:'string', description:'Where it happens. "" if not stated.' },
  from:      { type:'string', description:'Travel origin, with airport code in brackets when the document gives one. "" for other kinds.' },
  to:        { type:'string', description:'Travel destination, same convention. "" for other kinds.' },
  mode:      { type:'string', enum:['By Air','By Road',''], description:'Travel only; "" otherwise.' },
  flightNo:  { type:'string', description:'Airline code and number as printed, e.g. "EK 507". "" if not a flight.' },
  date:      { type:'string', description:'YYYY-MM-DD for an event or task; "" for travel and stay.' },
  startDate: { type:'string', description:'YYYY-MM-DD for travel and stay; "" for event and task.' },
  startTime: { type:'string', description:'24-hour HH:MM departure or check-in; "" for event and task.' },
  endDate:   { type:'string', description:'YYYY-MM-DD arrival or check-out; "" for event and task.' },
  endTime:   { type:'string', description:'24-hour HH:MM. Arrival or check-out for travel and stay, finish time for an event, "" for a task.' },
  time:      { type:'string', description:'24-hour HH:MM start for an event or task; "" for travel and stay.' },
  people:    { type:'array', items:{ type:'string' }, description:'Names exactly as the document writes them. [] if it does not say who.' },
};

export const SCHEMA = {
  type: 'object',
  properties: {
    source: { type:'string', description:'What the document appears to be, e.g. "Emirates e-ticket" or "Agent itinerary — Dubai".' },
    items: { type:'array', items:{ type:'object', properties:ITEM_FIELDS, required:Object.keys(ITEM_FIELDS), additionalProperties:false } },
  },
  required: ['source', 'items'],
  additionalProperties: false,
};

const SYSTEM = `You read travel itineraries and return what is actually written in them.

Rules that matter more than completeness:
- Never invent a date, a time, or a flight number. If the document does not state it, return "".
- Do not convert timezones or adjust times. Copy the local time exactly as printed.
- A date with no year: infer the year from the trip dates you are given, and only from those.
- Split a multi-leg journey into one travel item per leg, each with its own flight number.
- A hotel is one stay item spanning check-in to check-out, not one per night.
- Only tag people the document names. Never distribute an unattributed item across everyone.
- Include items whose dates fall outside the trip — they are flagged for the traveller, not dropped by you.`;

const line = (obj) => new TextEncoder().encode(JSON.stringify(obj) + '\n');

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status:200, headers:cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error:'POST only' }), { status:405, headers:{ ...cors, 'Content-Type':'application/json' } });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return new Response(JSON.stringify({ error:'not-configured' }), { status:200, headers:{ ...cors, 'Content-Type':'application/json' } });

  let body;
  try { body = await req.json(); } catch { body = null; }
  const url = String((body && body.url) || '');
  const trip = (body && body.trip) || {};

  if (!url.startsWith(DOC_PREFIX)) {
    return new Response(JSON.stringify({ error:'That document is not one of this trip’s uploads.' }),
      { status:400, headers:{ ...cors, 'Content-Type':'application/json' } });
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Emitted every few seconds purely so the connection has traffic on it. Without
      // this the platform can close an idle connection before the model finishes.
      const beat = setInterval(() => {
        try { controller.enqueue(line({ type:'progress' })); } catch { /* already closed */ }
      }, 3000);
      const fail = (msg) => { controller.enqueue(line({ type:'error', error:msg })); };

      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('Could not read that document from storage.');
        const buf = Buffer.from(await r.arrayBuffer());
        if (!buf.length) throw new Error('That document is empty.');
        if (buf.length > MAX_PDF_BYTES) throw new Error('That document is too large to read (over 24MB).');

        const client = new Anthropic({ apiKey: key });
        const roster = (trip.members || []).filter(Boolean).join(', ');
        const ask = [
          `Trip: ${trip.name || 'unnamed'}`,
          `Trip dates: ${trip.startDate || 'unknown'} to ${trip.endDate || 'unknown'}`,
          roster ? `Travellers on this trip: ${roster}` : 'Travellers: not listed',
          '',
          'Extract every dated item from the attached itinerary.',
        ].join('\n');

        // Streaming rather than a plain create: a large max_tokens on a non-streaming
        // request risks an HTTP timeout, and the flowing bytes are what keep this
        // function alive past Netlify's synchronous limit.
        const run = client.messages.stream({
          model: 'claude-opus-5',
          max_tokens: 16000,
          system: SYSTEM,
          // Extraction is structured work, not open reasoning — low effort keeps the
          // thinking spend (billed as output) proportionate to the task.
          output_config: { effort: 'low', format: { type:'json_schema', schema: SCHEMA } },
          messages: [{ role:'user', content: [
            { type:'document', source:{ type:'base64', media_type:'application/pdf', data: buf.toString('base64') } },
            { type:'text', text: ask },
          ] }],
        });

        const msg = await run.finalMessage();
        if (msg.stop_reason === 'refusal') throw new Error('That document could not be read.');
        if (msg.stop_reason === 'max_tokens') throw new Error('That itinerary is longer than one pass can handle. Try splitting the PDF.');

        const text = (msg.content.find(b => b.type === 'text') || {}).text || '';
        let data;
        try { data = JSON.parse(text); } catch { throw new Error('The itinerary came back in an unreadable form.'); }

        controller.enqueue(line({ type:'done', data, usage: msg.usage }));
      } catch (e) {
        fail(e && e.message ? e.message : 'Could not read that itinerary.');
      } finally {
        clearInterval(beat);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { ...cors, 'Content-Type':'application/x-ndjson', 'Cache-Control':'no-store' } });
};
