import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { expect, afterEach } from 'vitest';

// jsdom doesn't implement ResizeObserver, but Header.jsx uses one to track
// its own height. Without this stub, any test that renders <Header> (or
// anything containing it, e.g. <App>) throws "ResizeObserver is not defined"
// as soon as the effect runs.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = globalThis.ResizeObserver || (ResizeObserverStub as unknown as typeof ResizeObserver);

afterEach(() => {
  cleanup();    // clean up after each run
});