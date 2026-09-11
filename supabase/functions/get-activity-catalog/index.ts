// Public catalog only. JWT verification is enabled at the gateway.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'GET') return new Response('{}', { status: 405, headers });
  try {
    const url = new URL('/rest/v1/activities', Deno.env.get('SUPABASE_URL'));
    url.searchParams.set('select', 'id,title,base_price_usd,is_active,pricing_type,package_size,min_guests,max_guests,schedules(time_slot)');
    url.searchParams.set('is_active', 'eq.true');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const result = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!result.ok) throw new Error('Catalog unavailable');
    return new Response(JSON.stringify({ activities: await result.json() }), { headers });
  } catch {
    return new Response(JSON.stringify({ error: 'Catalog unavailable' }), { status: 503, headers });
  }
});
