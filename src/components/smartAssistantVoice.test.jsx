// StoreSense spoken replies, through the real component.
//
// The feature is output only: there is no microphone anywhere in this
// flow. What matters is that answers are read aloud when the user asks for
// it, that nothing ever talks at them uninvited, and that the choice is
// remembered.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import SmartAssistant from './SmartAssistant';

const { auth, storeData } = vi.hoisted(() => ({
  auth: { value: {} },
  storeData: { value: [] },
}));

vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.value }));

vi.mock('../hooks/useStoreData', () => ({
  useStoreData: () => ({ data: storeData.value, loading: false, reload: () => {} }),
}));

// Local backend keeps askAssistant on its offline path, so the answers are
// deterministic and no network is involved.
vi.mock('../lib/backend', () => ({
  api: {
    kind: 'local',
    sales: { list: vi.fn(async () => []) },
    products: { list: vi.fn(async () => []) },
    expenses: { list: vi.fn(async () => []) },
    creditPayments: { list: vi.fn(async () => []) },
  },
  subscribe: () => () => {},
}));

const ownerMode = (overrides = {}) => ({
  user: { id: 'user-1' },
  storeId: 'store-1',
  storeName: 'Ada Stores',
  role: 'owner',
  plan: 'owner',
  storeIsDemo: false,
  niche: { label: 'Supermarket', trackStock: true },
  ...overrides,
});

function renderAssistant(at = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="*" element={<SmartAssistant />} />
      </Routes>
    </MemoryRouter>
  );
}

const spokenTexts = () => window.speechSynthesis.spoken.map((u) => u.text);

const open = (user) => user.click(screen.getByRole('button', { name: /open storesense assistant/i }));
const askSomething = (user) => user.click(screen.getByRole('button', { name: 'How are sales today?' }));

beforeEach(() => {
  auth.value = ownerMode();
  storeData.value = [];
  globalThis.__resetSpeech();
  localStorage.clear();
});

describe('the spoken-replies control', () => {
  it('is offered to an Owner Mode store and starts switched off', async () => {
    const user = userEvent.setup();
    renderAssistant();
    await open(user);

    const toggle = screen.getByRole('button', { name: /read answers aloud/i });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(spokenTexts()).toHaveLength(0);
  });

  it('names the store when switched on, which also unlocks audio on iOS', async () => {
    auth.value = ownerMode({ storeName: 'Crown Jewel Supermarket' });
    const user = userEvent.setup();
    renderAssistant();
    await open(user);
    await user.click(screen.getByRole('button', { name: /read answers aloud/i }));

    expect(spokenTexts()).toEqual(['Spoken replies are on for Crown Jewel Supermarket.']);
    expect(screen.getByRole('button', { name: /turn off spoken replies/i })).toBeTruthy();
  });

  it('falls back to a plain confirmation before the store name is known', async () => {
    auth.value = ownerMode({ storeName: '' });
    const user = userEvent.setup();
    renderAssistant();
    await open(user);
    await user.click(screen.getByRole('button', { name: /read answers aloud/i }));

    expect(spokenTexts()).toEqual(['Spoken replies are on.']);
  });

  it('never appears for a Shop Mode store, which has no assistant at all', async () => {
    auth.value = ownerMode({ plan: 'free' });
    const user = userEvent.setup();
    renderAssistant();
    await user.click(screen.getByRole('button', { name: /storesense, an owner mode feature/i }));

    expect(screen.queryByRole('button', { name: /read answers aloud/i })).toBeNull();
    expect(spokenTexts()).toHaveLength(0);
  });
});

describe('what gets read aloud', () => {
  it('reads an answer aloud once spoken replies are on', async () => {
    const user = userEvent.setup();
    renderAssistant();
    await open(user);
    await user.click(screen.getByRole('button', { name: /read answers aloud/i }));
    globalThis.__resetSpeech(); // drop the confirmation

    await askSomething(user);

    await waitFor(() => expect(spokenTexts()).toHaveLength(1));
    // Spoken, not displayed: the naira sign is gone and the number survives.
    expect(spokenTexts()[0]).toContain('naira');
    expect(spokenTexts()[0]).not.toMatch(/₦/);
  });

  it('stays silent on the opening greeting', async () => {
    const user = userEvent.setup();
    renderAssistant();
    await open(user);
    await user.click(screen.getByRole('button', { name: /read answers aloud/i }));

    // Only the confirmation; the welcome message is never auto-spoken.
    expect(spokenTexts()).toEqual(['Spoken replies are on for Ada Stores.']);
  });

  it('stays silent while spoken replies are off', async () => {
    const user = userEvent.setup();
    renderAssistant();
    await open(user);
    await askSomething(user);

    await waitFor(() => expect(screen.getAllByRole('button', { name: /read this answer aloud/i }).length).toBeGreaterThan(0));
    expect(spokenTexts()).toHaveLength(0);
  });

  it('stops talking when the panel is closed', async () => {
    const user = userEvent.setup();
    const cancel = vi.spyOn(window.speechSynthesis, 'cancel');
    renderAssistant();
    await open(user);
    await user.click(screen.getByRole('button', { name: /close assistant/i }));

    expect(cancel).toHaveBeenCalled();
    cancel.mockRestore();
  });
});

describe('replaying an answer', () => {
  it('offers Listen on each answer even when auto-speaking is off', async () => {
    const user = userEvent.setup();
    renderAssistant();
    await open(user);
    await askSomething(user);

    const listen = await screen.findAllByRole('button', { name: /read this answer aloud/i });
    // The greeting and the answer can both be replayed.
    expect(listen.length).toBeGreaterThanOrEqual(2);

    await user.click(listen[listen.length - 1]);
    await waitFor(() => expect(spokenTexts()).toHaveLength(1));
    expect(spokenTexts()[0]).toContain('naira');
  });
});

describe('speaking this store\u2019s own catalogue', () => {
  // The point of a store-aware voice: the live catalogue reaches the
  // speech layer, so pack sizes and product codes are said correctly.
  const demoCatalogue = [
    { id: 'p1', name: 'Peak Milk 400g', sku: 'PK-400', stock: 4, salePrice: 2800 },
    { id: 'p2', name: 'Coca-Cola 50cl', sku: 'CC-50', stock: 9, salePrice: 400 },
  ];

  it('says the pack sizes properly in a restock answer', async () => {
    storeData.value = demoCatalogue;
    const user = userEvent.setup();
    renderAssistant();
    await open(user);
    await user.click(screen.getByRole('button', { name: /read answers aloud/i }));
    globalThis.__resetSpeech();

    await user.click(screen.getByRole('button', { name: 'What needs restocking?' }));

    await waitFor(() => expect(spokenTexts()).toHaveLength(1));
    const spoken = spokenTexts()[0];
    expect(spoken).toContain('Peak Milk 400 grams (4 left)');
    expect(spoken).toContain('Coca-Cola 50 centilitres (9 left)');

    // The screen still shows the catalogue name exactly as stored.
    expect(screen.getByText(/Peak Milk 400g \(4 left\)/)).toBeTruthy();
  });

  it('pronounces the store\u2019s own name from its live profile', async () => {
    // Unit expansion alone would pass without the store context ever
    // reaching the speech layer, because it is generic. The store name is
    // context-only, so this is what actually proves the wiring.
    auth.value = ownerMode({ storeName: 'KM Supermart' });
    storeData.value = demoCatalogue;
    const user = userEvent.setup();
    renderAssistant();
    await open(user);

    // Replay the greeting, which names the store.
    const listen = await screen.findAllByRole('button', { name: /read this answer aloud/i });
    await user.click(listen[0]);

    await waitFor(() => expect(spokenTexts()).toHaveLength(1));
    expect(spokenTexts()[0]).toContain('K M Supermart');
    // On screen it stays exactly as the owner typed it.
    expect(screen.getByText(/any part of KM Supermart/)).toBeTruthy();
  });

  it('stays generic for a store with an empty catalogue', async () => {
    storeData.value = [];
    const user = userEvent.setup();
    renderAssistant();
    await open(user);
    await user.click(screen.getByRole('button', { name: /read answers aloud/i }));
    globalThis.__resetSpeech();

    await askSomething(user);

    await waitFor(() => expect(spokenTexts()).toHaveLength(1));
    expect(spokenTexts()[0]).toContain('naira');
  });
});

describe('remembering the choice', () => {
  it('restores the preference for the same account on the next visit', async () => {
    const user = userEvent.setup();
    const first = renderAssistant();
    await open(user);
    await user.click(screen.getByRole('button', { name: /read answers aloud/i }));
    first.unmount();

    renderAssistant();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /turn off spoken replies/i })).toBeTruthy()
    );
  });

  it('does not leak one account\u2019s choice to another', async () => {
    const user = userEvent.setup();
    const first = renderAssistant();
    await open(user);
    await user.click(screen.getByRole('button', { name: /read answers aloud/i }));
    first.unmount();

    auth.value = ownerMode({ user: { id: 'user-2' } });
    renderAssistant();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /read answers aloud/i })).toBeTruthy()
    );
  });
});
