import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

// Minimal history-based routing: three pages don't justify a router dependency.

const NAVIGATE_EVENT = "app:navigate";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

export function normalizePath(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

export function usePathname() {
  return useSyncExternalStore(
    subscribe,
    () => normalizePath(window.location.pathname),
    () => "/",
  );
}

export function navigate(to: string) {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  const hash = to.split("#")[1];
  if (hash) document.getElementById(hash)?.scrollIntoView();
  else window.scrollTo({ top: 0 });
}

/** In-app link: client-side navigation for plain left-clicks, normal link otherwise. */
export function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  }
  return <a href={href} onClick={handleClick} {...props} />;
}
