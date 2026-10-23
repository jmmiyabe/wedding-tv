import { lazy, Suspense } from "react";
import { LoadingScreen } from "./components/LoadingScreen";
import { usePathname } from "./lib/router";

// Each page is its own chunk, so the public invitation never downloads admin code.
const HomePage = lazy(() => import("./pages/HomePage"));
const RsvpPage = lazy(() => import("./pages/RsvpPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function pageFor(pathname: string) {
  switch (pathname) {
    case "/":
      return <HomePage />;
    case "/rsvp":
      return <RsvpPage />;
    case "/admin":
      return <AdminPage />;
    default:
      return <NotFoundPage />;
  }
}

export function App() {
  const pathname = usePathname();
  return <Suspense fallback={<LoadingScreen />}>{pageFor(pathname)}</Suspense>;
}
