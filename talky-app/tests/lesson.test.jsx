import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import Lesson from '../src/Lesson/Lesson'
import { MemoryRouter } from 'react-router-dom'

global.ResizeObserver = global.ResizeObserver || class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('speechSynthesis', { speak: vi.fn() })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => Promise.resolve('{"1":"Hello world","2":"Next line"}')
  }))
})

describe('Lesson', () => {
  it('renders video after fetch', async () => {
    render(
      <MemoryRouter>
        <Lesson />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText(/Watch this example first/i)).toBeInTheDocument()
    })
  })
})