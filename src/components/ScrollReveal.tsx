"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const MOVE_MS = 500;
const STAGGER_MS = 70;
const MAX_STAGGER_STEPS = 3;

/**
 * Fade-and-rise for elements marked `data-reveal`, and for each direct child of a
 * `data-reveal-group` (cards in a row get a small stagger). Mounted once in the root layout;
 * pages opt in through those attributes, so booking, payment and dashboard pages, which don't
 * use them, never animate.
 *
 * Never-invisible rule: markup is always visible as rendered. This script only hides an
 * element after measuring that it sits entirely below the screen, and then shows it as it
 * scrolls in. With JavaScript off, slow or failing, or with reduced motion on, nothing is
 * hidden at all. Each element animates once.
 */
export default function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timers: number[] = [];
    const pending = new Set<HTMLElement>();

    const show = (el: HTMLElement, delay: number) => {
      el.style.setProperty("--reveal-delay", `${delay}ms`);
      el.classList.add("reveal-in");
      el.classList.remove("reveal-pending");
      pending.delete(el);
      // Hand the element back to its own transitions (e.g. card hover) once it has arrived.
      timers.push(
        window.setTimeout(() => {
          el.classList.remove("reveal-in");
          el.style.removeProperty("--reveal-delay");
        }, MOVE_MS + delay + 100),
      );
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const stagger = new Map<Element, number>();
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          observer.unobserve(el);
          const group = el.parentElement?.hasAttribute("data-reveal-group") ? el.parentElement : null;
          let delay = 0;
          if (group) {
            const step = stagger.get(group) ?? 0;
            stagger.set(group, step + 1);
            delay = Math.min(step, MAX_STAGGER_STEPS) * STAGGER_MS;
          }
          show(el, delay);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );

    // Wait a frame so the new route's layout is final before measuring.
    const frame = window.requestAnimationFrame(() => {
      const targets = document.querySelectorAll<HTMLElement>("[data-reveal], [data-reveal-group] > *");
      for (const el of targets) {
        if (el.getBoundingClientRect().top < window.innerHeight) continue; // on screen or above it: leave as is
        el.classList.add("reveal-pending");
        pending.add(el);
        observer.observe(el);
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
      // Leaving the page (or re-running): never leave anything hidden behind.
      for (const el of pending) el.classList.remove("reveal-pending");
    };
  }, [pathname]);

  return null;
}
