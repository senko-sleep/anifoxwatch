import "@testing-library/jest-dom/vitest";
import { vi } from 'vitest';

// Make matchMedia stable in happy-dom.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Ensure the happy-dom fetch mock doesn't hang waiting on internal teardown.
// Tests overwrite `global.fetch` themselves; this just provides a safe default.
if (!global.fetch) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    json: async () => ({}),
    headers: { get: () => 'application/json' },
  }) as any;
}

