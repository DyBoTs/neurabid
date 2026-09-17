import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest.config.ts sets test.globals: false, so Testing Library's own
// automatic cleanup (which looks for a global `afterEach`) never
// registers itself. Without this, DOM from earlier tests in the same
// file accumulates in document.body and queries start matching multiple
// elements. Wiring it up explicitly is the documented fix for a non-
// globals Vitest setup.
afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia. Default to "no preference" so
// components that check prefers-reduced-motion don't throw; individual
// tests can vi.stubGlobal('matchMedia', ...) to test the reduced-motion
// branch specifically.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

