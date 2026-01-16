// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';

// Mock canvas context for Combobox component which uses measureText
// This overrides the empty mock in .config/jest-setup.js
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  measureText: jest.fn(() => ({ width: 100 })),
}));

// Mock IntersectionObserver for Select component
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
};
