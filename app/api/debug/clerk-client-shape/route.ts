export async function GET() {
  return new Response(JSON.stringify({ ok: true, message: 'clerk-client-shape debug route' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}