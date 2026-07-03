import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import App from '../src/App';
import SoundBank from '../src/SoundBank/SoundBank';

// ----------------------
// Auth mock (stable)
// ----------------------
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => ({
    isLoading: false,
    isAuthenticated: false,
    user: null,
  }),
}));

// ----------------------
// Global fetch mock (centralized)
// ----------------------
global.fetch = vi.fn();

beforeEach(() => {
  fetch.mockReset();
});

// ----------------------
// Tests
// ----------------------

describe('App', () => {

  it('renders without crashing', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <App />
        </MemoryRouter>
      )
    ).not.toThrow();
  });

  it('has header and footer', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders sound bank entry point', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    const soundbank = screen.getByText(/Sound Bank/i);
    expect(soundbank).toBeInTheDocument();

    expect(() => soundbank.click()).not.toThrow();
  });

  it('renders lessons from API', async () => {
    const mockLessons = [
      { id: 1, words: ['cat'] },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lessons: mockLessons }),
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    const lesson = await screen.findByText(/cat/i);
    expect(lesson).toBeInTheDocument();
  });

  it('renders correct number of lesson cards', async () => {
    const mockLessons = [
      { id: 1, words: ['cat'] },
      { id: 2, words: ['dog'] },
      { id: 3, words: ['bird'] },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lessons: mockLessons }),
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    const cards = await screen.findAllByRole('button');
    expect(cards.length).toBe(mockLessons.length);
  });

  it('last module is a lesson, not a game', async () => {
    const mockLessons = [
      { id: 1, words: ['cat'] },
      { id: 2, words: ['dog'] },
      { id: 3, words: ['bird'] },
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ lessons: mockLessons }),
    });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    const cards = await screen.findAllByRole('button');
    const lastCard = cards[cards.length - 1];

    expect(lastCard).toHaveTextContent(/lesson|bird|dog|cat/i);
  });

});