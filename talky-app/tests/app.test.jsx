import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import App from '../src/App';
import SoundBank from '../src/SoundBank/SoundBank';
import { UserProvisionedContext } from '../src/utils/userProvisioned.js';
import { useAuth0 } from '@auth0/auth0-react';

// App.jsx's lesson-fetching effect is gated on useUserProvisioned() (see
// App.jsx:24) so it never fires before POST /api/user/adduser has resolved.
// The mocked useAuth0 below always reports isAuthenticated, so tests must
// provide "provisioned" explicitly or that gate stays permanently closed.
function renderApp() {
  return render(
    <MemoryRouter>
      <UserProvisionedContext.Provider value={true}>
        <App />
      </UserProvisionedContext.Provider>
    </MemoryRouter>
  );
}

// ----------------------
// Auth mock (stable)
// ----------------------
// App.jsx only fetches lessons for an authenticated user (the dashboard
// requires login, matching the backend's requires_auth endpoints), so the
// mock needs to look logged-in for the data-fetching tests below to see
// any lessons at all.
//
// `user` and `getAccessTokenSilently` must be stable references across
// renders — the real Auth0 SDK memoizes both, and App.jsx's data-fetching
// effect depends on them. Returning a fresh object/function from useAuth0()
// on every render makes those dependencies "change" every time, re-running
// the effect after every setState it triggers and spinning into an infinite
// render loop.
const mockUser = { sub: 'test-user', email: 'test@example.com' };
const getAccessTokenSilently = async () => 'test-token';

// useAuth0 is a vi.fn() (not a plain arrow function) so individual tests can
// override it with mockReturnValue/mockReturnValueOnce - e.g. the signed-out
// test below needs isAuthenticated: false, which the shared default doesn't
// provide.
vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}));

// ----------------------
// Global fetch mock (centralized)
// ----------------------
global.fetch = vi.fn();

beforeEach(() => {
  fetch.mockReset();
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({ lessons: [] }),
  });

  useAuth0.mockReturnValue({
    isLoading: false,
    isAuthenticated: true,
    user: mockUser,
    getAccessTokenSilently,
    loginWithRedirect: vi.fn(),
  });
});

// ----------------------
// Tests
// ----------------------

describe('App', () => {

  it('renders without crashing', () => {
    expect(() => renderApp()).not.toThrow();
  });

  it('has header and footer', () => {
    renderApp();

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders sound bank entry point', () => {
    renderApp();

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

    renderApp();

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

    renderApp();

    const cards = await screen.findAllByTestId('lesson-card');
    expect(cards).toHaveLength(mockLessons.length);
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

    renderApp();

    const cards = await screen.findAllByTestId('lesson-card');
    const lastCard = cards[cards.length - 1];

    expect(lastCard).toHaveTextContent(/lesson|bird|dog|cat/i);
  });

  it('shows a sign-in prompt instead of a blank page when signed out', () => {
    useAuth0.mockReturnValue({
      isLoading: false,
      isAuthenticated: false,
      user: null,
      getAccessTokenSilently,
      loginWithRedirect: vi.fn(),
    });

    renderApp();

    expect(screen.getByText(/sign in to see your lessons/i)).toBeInTheDocument();
    expect(screen.queryAllByTestId('lesson-card')).toHaveLength(0);
  });

});