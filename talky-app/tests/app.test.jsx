import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

  it('lesson can be clicked on', () => {
    const result = render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
    const lesson1 = result.container.querySelector('#lesson-1');
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
})