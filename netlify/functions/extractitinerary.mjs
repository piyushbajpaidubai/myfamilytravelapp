// Status endpoint for an itinerary import. The reading itself happens in
// extractitinerary-background.mjs, which can run for fifteen minutes but by definition
// cannot answer its caller — so it writes progress to the blob store and the app polls
// here for it.
//
// GET ?job=<id> → { status: 'pending' | 'working' | 'done' | 'error' | 'not-configured' }
//   pending  no such key yet: the background invocation has not started writing
//   working  claimed, still reading
//   done     carries { data, usage, secondsTaken }
//   error    carries a message written for the traveller to read

import { getStore } from '@netlify/blobs';
import { STORE, jobKey } from './extractitinerary-background.mjs';

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers });

  const id = jobKey(new URL(req.url).searchParams.get('job'));
  if (!id) return new Response(JSON.stringify({ status:'error', error:'No import to check.' }), { status: 400, headers });

  try {
    const rec = await getStore(STORE).get(id, { type: 'json' });
    if (!rec) return new Response(JSON.stringify({ status:'pending' }), { status: 200, headers });
    return new Response(JSON.stringify(rec), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ status:'error', error:'Could not check on that import.' }), { status: 200, headers });
  }
};
