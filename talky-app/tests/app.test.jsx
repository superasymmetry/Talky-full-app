import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'

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
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )

    expect(screen.getByText(/Lesson 1/i)).toBeInTheDocument()
    expect(screen.getByText(/Sound Bank/i)).toBeInTheDocument()
  })

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
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    const lessons = ['Lesson 1', 'Lesson 2', 'Lesson 3', 'Game']
    lessons.forEach(label => {
      const [lesson] = screen.getAllByText(new RegExp(`^${label}$`, 'i'))
      expect(lesson).toBeInTheDocument()
      expect(() => lesson.click()).not.toThrow()
    })
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