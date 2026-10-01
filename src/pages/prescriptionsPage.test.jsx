// The Prescriptions page: recording a script, dispensing part of it through
// the sale engine, and watching the balance stay open. The api layer is
// mocked here — the adapters' behaviour is pinned in pharmacyOperations.test.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import Prescriptions from './Prescriptions';
import { api } from '../lib/backend';
import { getNiche } from '../config/niches';

const { state } = vi.hoisted(() => ({
  state: { prescriptions: [], products: [], dispensings: [] },
}));

vi.mock('../lib/backend', () => ({
  api: {
    products: { list: vi.fn(async () => state.products) },
    prescriptions: {
      list: vi.fn(async () => state.prescriptions),
      create: vi.fn(async (_storeId, payload) => {
        const rx = {
          id: 'rx-new',
          code: 'RX-NEW01',
          patientName: payload.patientName,
          prescriber: payload.prescriber || '',
          status: 'open',
          createdAt: new Date().toISOString(),
          items: payload.items.map((i, idx) => ({
            id: `item-${idx}`,
            productId: i.productId,
            productName: i.name,
            prescribedQty: i.qty,
            dispensedQty: 0,
          })),
        };
        state.prescriptions = [rx, ...state.prescriptions];
        return rx;
      }),
      dispense: vi.fn(async (_storeId, { prescriptionId, lines }) => {
        const rx = state.prescriptions.find((r) => r.id === prescriptionId);
        rx.items.forEach((item) => {
          const line = lines.find((l) => l.productId === item.productId);
          if (line) item.dispensedQty += line.qty;
        });
        rx.status = rx.items.every((i) => i.dispensedQty >= i.prescribedQty)
          ? 'dispensed'
          : 'open';
        state.dispensings = [
          {
            id: 'disp-1',
            prescriptionId,
            receiptNo: 'SM-9001',
            items: lines.map((l) => ({
              name: rx.items.find((i) => i.productId === l.productId).productName,
              qty: l.qty,
              batches: [{ batchNo: 'B-1', qty: l.qty }],
            })),
            createdAt: new Date().toISOString(),
          },
          ...state.dispensings,
        ];
        return { sale: { id: 's1', receiptNo: 'SM-9001' }, prescription: rx };
      }),
      cancel: vi.fn(async (id) => {
        const rx = state.prescriptions.find((r) => r.id === id);
        rx.status = 'cancelled';
        return rx;
      }),
      remove: vi.fn(async (id) => {
        state.prescriptions = state.prescriptions.filter((r) => r.id !== id);
        return id;
      }),
      dispensings: { list: vi.fn(async () => state.dispensings) },
    },
  },
  subscribe: () => () => {},
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    storeId: 'store-1',
    user: { id: 'u1', email: 'pharm@healthway.ng' },
    role: 'manager',
    niche: getNiche('pharmacy'),
  }),
}));

describe('Prescriptions page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.prescriptions = [];
    state.dispensings = [];
    state.products = [
      { id: 'al', name: 'Artemether-Lumefantrine', salePrice: 1300, isRx: true },
      { id: 'ors', name: 'ORS Sachets', salePrice: 250, isRx: false },
    ];
  });

  it('records a new prescription with multiple lines', async () => {
    render(<Prescriptions />);
    await waitFor(() =>
      expect(screen.getByText(/No prescriptions yet/i)).toBeTruthy()
    );

    await userEvent.click(screen.getByRole('button', { name: /New prescription/i }));
    await userEvent.type(screen.getByLabelText('Patient name'), 'Mr. Musa Ibrahim');

    const medicineSelect = screen.getByLabelText('Prescribed medicine 1');
    await userEvent.selectOptions(medicineSelect, 'al');
    await userEvent.type(screen.getByLabelText('Quantity 1'), '2');

    await userEvent.click(screen.getByRole('button', { name: /Add medicine/i }));
    const secondSelect = screen.getByLabelText('Prescribed medicine 2');
    await userEvent.selectOptions(secondSelect, 'ors');
    await userEvent.type(screen.getByLabelText('Quantity 2'), '4');

    await userEvent.click(screen.getByRole('button', { name: /Record prescription/i }));

    await waitFor(() => expect(api.prescriptions.create).toHaveBeenCalled());
    const payload = api.prescriptions.create.mock.calls[0][1];
    expect(payload.patientName).toBe('Mr. Musa Ibrahim');
    expect(payload.items).toEqual([
      { productId: 'al', name: 'Artemether-Lumefantrine', qty: 2 },
      { productId: 'ors', name: 'ORS Sachets', qty: 4 },
    ]);
  });

  it('dispenses part of a course and keeps the script open', async () => {
    state.prescriptions = [
      {
        id: 'rx-1',
        code: 'RX-ABC123',
        patientName: 'Mrs. Bello',
        prescriber: 'Dr. Eze',
        status: 'open',
        createdAt: new Date().toISOString(),
        items: [
          {
            id: 'i1',
            productId: 'al',
            productName: 'Artemether-Lumefantrine',
            prescribedQty: 2,
            dispensedQty: 0,
          },
          {
            id: 'i2',
            productId: 'ors',
            productName: 'ORS Sachets',
            prescribedQty: 4,
            dispensedQty: 0,
          },
        ],
      },
    ];

    render(<Prescriptions />);
    await waitFor(() => expect(screen.getByText('RX-ABC123')).toBeTruthy());

    // Progress shows units dispensed over prescribed.
    expect(screen.getByText('0 / 6 units')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Dispense RX-ABC123/i }));

    // Defaults fill to the remaining balance of each line.
    expect(screen.getByLabelText('Dispense quantity for Artemether-Lumefantrine').value).toBe('2');
    expect(screen.getByLabelText('Dispense quantity for ORS Sachets').value).toBe('4');

    // Part-dispense: only the antimalarial this visit.
    await userEvent.clear(screen.getByLabelText('Dispense quantity for ORS Sachets'));
    await userEvent.type(screen.getByLabelText('Dispense quantity for ORS Sachets'), '0');

    // Total previews at the products' current prices: 2 × 1300.
    expect(screen.getByText('₦2,600')).toBeTruthy();

    await userEvent.click(
      screen.getByRole('button', { name: /Dispense & complete sale/i })
    );

    await waitFor(() => expect(api.prescriptions.dispense).toHaveBeenCalled());
    const { prescriptionId, lines } = api.prescriptions.dispense.mock.calls[0][1];
    expect(prescriptionId).toBe('rx-1');
    expect(lines).toEqual([{ productId: 'al', qty: 2 }]);
  });

  it('shows dispensing history in the detail view', async () => {
    state.prescriptions = [
      {
        id: 'rx-2',
        code: 'RX-DEF456',
        patientName: 'Mr. Danjuma',
        prescriber: '',
        status: 'open',
        createdAt: new Date().toISOString(),
        items: [
          {
            id: 'i1',
            productId: 'ors',
            productName: 'ORS Sachets',
            prescribedQty: 4,
            dispensedQty: 2,
          },
        ],
      },
    ];
    state.dispensings = [
      {
        id: 'd1',
        prescriptionId: 'rx-2',
        receiptNo: 'SM-7788',
        items: [{ name: 'ORS Sachets', qty: 2 }],
        createdAt: new Date().toISOString(),
      },
    ];

    render(<Prescriptions />);
    await waitFor(() => expect(screen.getByText('RX-DEF456')).toBeTruthy());

    await userEvent.click(screen.getByRole('button', { name: /View RX-DEF456/i }));
    const dialog = screen.getByRole('dialog', { name: /RX-DEF456/i });
    expect(within(dialog).getByText(/Mr\. Danjuma/)).toBeTruthy();
    expect(within(dialog).getByText('2 / 4')).toBeTruthy();
    expect(within(dialog).getByText(/SM-7788/)).toBeTruthy();
    expect(within(dialog).getByText(/ORS Sachets × 2/)).toBeTruthy();
  });
});
