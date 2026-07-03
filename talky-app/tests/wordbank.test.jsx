import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MemoryRouter } from 'react-router-dom';
import SoundBankCategory from '../src/SoundBank/SoundBankCategory.jsx';
import { vi } from 'vitest';

vi.mock('../src/tts.js', () => ({
  speakText: vi.fn().mockResolvedValue(),
  stopSpeech: vi.fn()
}));

// Mock Card to just render props for test
vi.mock('../src/Card.jsx', () => ({
    default: ({ name, content }) => (
        <div>
            {name && <span>{name}</span>}
            {content && <span data-testid="emoji">{content}</span>}
        </div>
    )
}));

// Mock fetch
global.fetch = vi.fn(() =>
    Promise.resolve({
        ok: true,
        json: () => Promise.resolve([
            { word: 'cat', emoji: '🐱' },
            { word: 'dog', emoji: '🐶' }
        ])
    })
);

describe('SoundBankCategory', () => {
    beforeEach(() => {
        fetch.mockClear();
    });

    it('renders emojis for every card', async () => {
        render(
            <MemoryRouter>
                <SoundBankCategory />
            </MemoryRouter>
        );
        await waitFor(() => expect(screen.getAllByTestId('emoji').length).toBeGreaterThan(0));
    });

    it('refresh words works', async () => {
        render(
            <MemoryRouter>
                <SoundBankCategory />
            </MemoryRouter>
        );
        await waitFor(() => expect(fetch).toHaveBeenCalled());
        const btn = screen.getByText(/refresh words/i);
        fireEvent.click(btn);
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    });

    it('randomize works', async () => {
        render(
            <MemoryRouter>
                <SoundBankCategory />
            </MemoryRouter>
        );
        await waitFor(() => expect(fetch).toHaveBeenCalled());
        const btn = screen.getByText(/randomize/i);
        fireEvent.click(btn);
        expect(btn).toBeDisabled();
    });

    it('synthesizes speech when clicked on card', async () => {

        render(
            <MemoryRouter>
                <SoundBankCategory />
            </MemoryRouter>
        );
        await waitFor(() => expect(fetch).toHaveBeenCalled());

        // Find all emojis and click the parent of the first one
        const emojis = await screen.findAllByTestId('emoji');
        fireEvent.click(emojis[0].parentElement);

        expect(speakText).toHaveBeenCalled();
    });
});