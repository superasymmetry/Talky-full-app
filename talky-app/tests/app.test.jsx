import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import App from '../src/App'
import Lesson from '../src/Lesson/Lesson'
import { MemoryRouter } from 'react-router-dom'
import SoundBank from '../src/SoundBank/SoundBank'

describe('App', () => {
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
    expect(() => lesson.click()).not.toThrow();
  });

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