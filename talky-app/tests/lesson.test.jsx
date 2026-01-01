import React from 'react'
import { describe, it, beforeEach, vi, expect } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// Hoisted mocks for three/fiber + drei
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }) => <div data-testid="canvas">{children}</div>,
  useFrame: () => {}
}))
vi.mock('@react-three/drei', () => {
  const useGLTF = Object.assign(
    () => ({ scene: { traverse: () => {} }, animations: [] }),
    { preload: vi.fn() }
  )
  return {
    OrbitControls: ({ children }) => <>{children}</>,
    Sky: ({ children }) => <>{children}</>,
    Environment: ({ children }) => <>{children}</>,
    ContactShadows: ({ children }) => <>{children}</>,
    useGLTF,
    useAnimations: () => ({ actions: {} })
  }
})

import Lesson from '../src/Lesson/Lesson'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('speechSynthesis', { speak: vi.fn() })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => Promise.resolve('{"1":"Hello world","2":"Next line"}')
  }))
})

describe('Lesson', () => {
  it('renders first sentence after fetch', async () => {
    render(<Lesson />)
    await waitFor(() => {
      expect(screen.getByText(/Sentence 1:/i)).toBeInTheDocument()
      expect(screen.getByText(/Hello world/i)).toBeInTheDocument()
    })
  })

  it('advances to next sentence when clicking Next', async () => {
    render(<Lesson />)
    await screen.findByText(/Hello world/i)
    fireEvent.click(screen.getByLabelText(/Next lesson/i))
    await waitFor(() => {
      expect(screen.getByText(/Sentence 2:/i)).toBeInTheDocument()
      expect(screen.getByText(/Next line/i)).toBeInTheDocument()
    })
  })
})