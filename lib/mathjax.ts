declare global {
  interface Window {
    MathJax?: {
      typesetPromise?: (elements?: HTMLElement[]) => Promise<void>;
    };
  }
}

export function queueMathJaxTypeset(element?: HTMLElement | null) {
  if (typeof window === "undefined") return;

  const target = element ?? undefined;

  const run = () => {
    const mathjax = window.MathJax;
    if (!mathjax?.typesetPromise) {
      return;
    }
    const elements = target ? [target] : undefined;
    mathjax.typesetPromise(elements).catch(() => {
      /* ignore transient typeset failures */
    });
  };

  if (window.MathJax?.typesetPromise) {
    requestAnimationFrame(run);
    return;
  }

  const handler = () => {
    window.removeEventListener("mathjax-loaded", handler);
    requestAnimationFrame(run);
  };

  window.addEventListener("mathjax-loaded", handler);
}

export {};
