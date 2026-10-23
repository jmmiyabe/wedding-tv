import type { Env } from "../../server/env";
import { handleApiRequest } from "../../server/router";

// All /api/* routes except /api/health are dispatched by server/router.ts, which
// enforces per-route access control. Unknown paths return a JSON 404 instead of
// falling through to the SPA's index.html.
export const onRequest: PagesFunction<Env> = ({ request, env }) => handleApiRequest(request, env);
