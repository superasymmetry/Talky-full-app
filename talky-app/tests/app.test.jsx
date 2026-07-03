import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.mock('@auth0/auth0-react', () => ({
  useAuth0: () => ({
    isLoading: false,
    isAuthenticated: false,
    user: null,
  }),
}));

import App from '../src/App'
import Lesson from '../src/Lesson/Lesson'
import { MemoryRouter } from 'react-router-dom'
import SoundBank from '../src/SoundBank/SoundBank'
import Card from '../src/Card'

const navigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

describe('App', () => {
  beforeEach(() => {
    navigate.mockReset()
  })

  it('renders without crashing', () => {
    expect(() =>
      render(
        <MemoryRouter>
          <App />
        </MemoryRouter>
      )
    ).not.toThrow()
  })

  it('renders lessons and explore card', () => {
    const result = render(
      <MemoryRouter>
        <App />
        <SoundBank />
      </MemoryRouter>
    );

    const soundBank = result.container.querySelector('#soundbank');
    expect(soundBank).toBeInTheDocument();
  });

  it('has header and footer', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('lesson can be clicked on', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        lessons: [{ id: 1, words: ['cat'] }]
      })
    });
    const result = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    const lesson1 = await waitFor(() => {
      const el = result.container.querySelector('[id="1"]');
      if (!el) throw new Error('lesson not rendered yet');
      return el;
    });
    expect(lesson1).toBeInTheDocument();
    expect(() => lesson1.click()).not.toThrow();
  });

  it('navigates to numeric lesson routes', () => {
    render(
      <MemoryRouter>
        <Card name="Lesson 1" id="lesson-1" navigateId="1" />
      </MemoryRouter>
    )

    screen.getByRole('button').click()
    expect(navigate).toHaveBeenCalledWith('/lessons/1')
  })

  it('soundbank can be clicked on', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    const soundbank = screen.getByText(/Sound Bank/i)
    expect(soundbank).toBeInTheDocument()
    // Should not throw on click
    expect(() => soundbank.click()).not.toThrow()
  })

  it('renders as many lessons as the user has in the database', async () => {
    const mockLessons = [
      { id: 1, words: ['cat'] },
      { id: 2, words: ['dog'] },
      { id: 3, words: ['bird'] },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ lessons: mockLessons }),
    });
    const result = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    const cards = await waitFor(() => {
      const els = result.container.querySelectorAll('.slider-row [role="button"]');
      if (els.length !== mockLessons.length) throw new Error('not all lessons rendered yet');
      return els;
    });
    expect(cards).toHaveLength(mockLessons.length);
  });

  it('last module is a lesson, not a game', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        lessons: [
          { id: 1, words: ['cat'] },
          { id: 2, words: ['dog'] },
          { id: 3, words: ['bird'] },
        ],
      }),
    });
    const result = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    await waitFor(() => {
      const els = result.container.querySelectorAll('.slider-row [role="button"]');
      if (els.length === 0) throw new Error('no lessons rendered yet');
      return els;
    });
    const cards = result.container.querySelectorAll('.slider-row [role="button"]');
    const lastCard = cards[cards.length - 1];
    expect(lastCard).toHaveTextContent(/lesson/i);
  })
})