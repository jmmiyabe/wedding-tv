import { useEffect, useRef, type ElementType, type ReactNode } from "react";

let observer: IntersectionObserver | null = null;

function getObserver() {
  if (observer) return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.setAttribute("data-visible", "");
          observer?.unobserve(entry.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  return observer;
}

/**
 * Enables the gentle scroll-reveal styles only when they can work. Without JS,
 * IntersectionObserver, or with reduced motion, everything is simply visible.
 */
export function enableReveal() {
  if (typeof IntersectionObserver === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.documentElement.classList.add("reveal-ready");
  // Safety net: never leave content hidden if the observer does not fire
  // (e.g. some in-app browsers, printing, or very tall viewports).
  window.setTimeout(() => {
    document.querySelectorAll("[data-reveal]:not([data-visible])").forEach((el) => el.setAttribute("data-visible", ""));
  }, 4000);
}

export function Reveal({ as: Tag = "div", className, children }: { as?: ElementType; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const io = getObserver();
    io.observe(element);
    return () => io.unobserve(element);
  }, []);

  return (
    <Tag ref={ref} data-reveal="" className={className}>
      {children}
    </Tag>
  );
}
