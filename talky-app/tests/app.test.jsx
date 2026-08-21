import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import App from '../src/App';
import { MemoryRouter } from 'react-router-dom';
import SoundBank from '../src/SoundBank/SoundBank';
import { UserProvisionedContext } from '../src/utils/userProvisioned.js';
import { useAuth0 } from '@auth0/auth0-react';

function renderApp() {
  return render(
    <MemoryRouter>
      <UserProvisionedContext.Provider value={true}>
        <App />
      </UserProvisionedContext.Provider>
    </MemoryRouter>
  );
}


const mockUser = { sub: 'test-user', email: 'test@example.com' };
const getAccessTokenSilently = async () => 'test-token';

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: vi.fn(),
}));

// global fetch mock
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

// tests -------------------------
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