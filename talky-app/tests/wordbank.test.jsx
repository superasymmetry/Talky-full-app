import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { MemoryRouter } from 'react-router-dom';
import SoundBankCategory from '../src/SoundBank/SoundBankCategory.jsx';
import { vi } from 'vitest';
import { speakText } from '../src/tts.js';

vi.mock('../src/tts.js', () => ({
  speakText: vi.fn().mockResolvedValue(),
  stopSpeech: vi.fn()
}));

// Must forward onActivate and wire it to a click handler — the real
// Card.jsx wires its onClick to the onActivate prop it's given (that's how
// SoundBank's `activate` -> `speakWord` chain actually fires). A mock that
// drops onActivate renders an inert div: clicking it can never trigger
// speech, no matter what SoundBankCategory does correctly.
vi.mock('../src/Card.jsx', () => ({
    default: ({ name, content, onActivate }) => (
        <div onClick={onActivate}>
            {name && <span>{name}</span>}
            {content && <span data-testid="emoji">{content}</span>}
        </div>
    )
}));

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
        // The button's actual label is "Surprise Me" (see SoundBankCategory.jsx
        // handleRandomize button) — there's no "Randomize" text in the
        // rendered UI, so /randomize/i could never match anything.
        const btn = screen.getByText(/surprise me/i);
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

        const emojis = await screen.findAllByTestId('emoji');
        fireEvent.click(emojis[0].parentElement);

        expect(speakText).toHaveBeenCalled();
    });
});