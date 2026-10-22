import { onRequest as __api_health_ts_onRequest } from "/vercel/share/v0-project/functions/api/health.ts"
import { onRequest as __api___path___ts_onRequest } from "/vercel/share/v0-project/functions/api/[[path]].ts"

export const routes = [
    {
      routePath: "/api/health",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api_health_ts_onRequest],
    },
  {
      routePath: "/api/:path*",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api___path___ts_onRequest],
    },
  ]