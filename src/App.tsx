import { lazy, Suspense } from "react";
import { LoadingScreen } from "./components/LoadingScreen";

const HomePage = lazy(() => import("./pages/HomePage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

// Minimal path-based routing. Swap for a router library when later phases add
// invitation, RSVP, and admin routes.
function isHomePath(pathname: string) {
  return (pathname.replace(/\/+$/, "") || "/") === "/";
}

export function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      {isHomePath(window.location.pathname) ? <HomePage /> : <NotFoundPage />}
    </Suspense>
  );
}
