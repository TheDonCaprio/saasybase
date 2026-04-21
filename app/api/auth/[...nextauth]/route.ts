/**
 * Auth API Route Dispatcher
 * =========================
 * Default behavior remains Auth.js/NextAuth.
 *
 * Better Auth can be exposed later without adding a second conflicting
 * catch-all route by either:
 * - setting AUTH_PROVIDER=betterauth, or
 * - setting BETTER_AUTH_ENABLE_ROUTE=true for isolated route-level testing
 *
 * The second mode is intentionally route-only groundwork; it does not switch
 * middleware, UI, or provider registry behavior.
 */

type RouteHandler = (request: Request) => Promise<Response>;

type RouteHandlers = {
	GET: RouteHandler;
	POST: RouteHandler;
	PATCH?: RouteHandler;
	PUT?: RouteHandler;
	DELETE?: RouteHandler;
};

function shouldUseBetterAuthRoute() {
	return process.env.AUTH_PROVIDER === 'betterauth'
		|| process.env.BETTER_AUTH_ENABLE_ROUTE === 'true';
}

async function getAuthRouteHandlers(): Promise<RouteHandlers> {
	if (shouldUseBetterAuthRoute()) {
		const { betterAuthNextJsHandler } = await import('@/lib/better-auth');
		return betterAuthNextJsHandler as RouteHandlers;
	}

	const { handlers } = await import('@/lib/nextauth.config');
	return handlers as unknown as RouteHandlers;
}

async function handle(request: Request, method: keyof RouteHandlers) {
	const handlers = await getAuthRouteHandlers();
	const handler = handlers[method];

	if (!handler) {
		return new Response('Method Not Allowed', {
			status: 405,
			headers: {
				Allow: 'GET, POST',
			},
		});
	}

	return handler(request);
}

export async function GET(request: Request) {
	return handle(request, 'GET');
}

export async function POST(request: Request) {
	return handle(request, 'POST');
}

export async function PATCH(request: Request) {
	return handle(request, 'PATCH');
}

export async function PUT(request: Request) {
	return handle(request, 'PUT');
}

export async function DELETE(request: Request) {
	return handle(request, 'DELETE');
}
