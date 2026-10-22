import type { Env } from "../../server/env";
import { errorResponse } from "../../server/http";

// Unknown /api/* routes return JSON 404 instead of falling through to the SPA's index.html.
export const onRequest: PagesFunction<Env> = () => errorResponse(404, "not_found");
