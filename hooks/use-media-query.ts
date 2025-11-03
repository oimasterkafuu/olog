'use client';

import { useEffect, useState } from "react";

/**
 * Lightweight media query hook to track viewport matches without SSR hydration mismatches.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQuery = window.matchMedia(query);
    const updateMatch = () => setMatches(mediaQuery.matches);
    updateMatch();
    mediaQuery.addEventListener("change", updateMatch);
    return () => mediaQuery.removeEventListener("change", updateMatch);
  }, [query]);

  return matches;
}

export function useIsMobile(maxWidth = 767) {
  return useMediaQuery(`(max-width: ${maxWidth}px)`);
}
