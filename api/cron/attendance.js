export const config = {
  runtime: 'nodejs',
};

export default async function handler(request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const expectedHeader = `Bearer ${cronSecret}`;

  if (authHeader !== expectedHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  return new Response(JSON.stringify({ ok: true, message: 'Attendance cron endpoint reached.' }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
