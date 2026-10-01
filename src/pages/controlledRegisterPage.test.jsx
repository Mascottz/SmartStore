// The Controlled Register page: a view over sales + the dispensing trail.
// Every controlled dispensing should show what left the shelf, from which
// batch, for which patient, and who verified it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ControlledRegister from './ControlledRegister';
import { getNiche } from '../config/niches';

const { state } = vi.hoisted(() => ({
  state: { sales: [], prescriptions: [], dispensings: [] },
}));

vi.mock('../lib/backend', () => ({
  api: {
    sales: { list: vi.fn(async () => state.sales) },
    prescriptions: {
      list: vi.fn(async () => state.prescriptions),
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
    storeName: 'Healthway Pharmacy',
  }),
}));

describe('Controlled Register page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.sales = [];
    state.prescriptions = [];
    state.dispensings = [];
  });

  it('lists controlled dispensings with patient, verifier and batches', async () => {
    const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
    state.sales = [
      {
        id: 's1',
        receiptNo: 'SM-9001',
        createdAt: daysAgo(1),
        status: 'completed',
        cashierEmail: 'cashier@healthway.ng',
        verifiedBy: 'pharm@healthway.ng',
        items: [
          {
            productId: 'tra',
            name: 'Tramadol 50mg',
            qty: 2,
            price: 1800,
            lineTotal: 3600,
            isControlled: true,
            batches: [{ batchId: 'b1', batchNo: 'TRA-11', qty: 2 }],
          },
          {
            productId: 'ors',
            name: 'ORS Sachets',
            qty: 1,
            price: 250,
            lineTotal: 250,
          },
        ],
      },
      {
        id: 's2',
        receiptNo: 'SM-9002',
        createdAt: daysAgo(3),
        status: 'completed',
        cashierEmail: 'pharm@healthway.ng',
        verifiedBy: '',
        items: [
          {
            productId: 'tra',
            name: 'Tramadol 50mg',
            qty: 1,
            price: 1800,
            lineTotal: 1800,
            isControlled: true,
            batches: [{ batchId: 'b1', batchNo: 'TRA-11', qty: 1 }],
          },
        ],
      },
      {
        id: 's3',
        receiptNo: 'SM-9003',
        createdAt: daysAgo(5),
        status: 'completed',
        cashierEmail: 'pharm@healthway.ng',
        items: [{ productId: 'ors', name: 'ORS Sachets', qty: 4, lineTotal: 1000 }],
      },
    ];
    state.prescriptions = [
      {
        id: 'rx-1',
        code: 'RX-CD01',
        patientName: 'Mrs. Iyabo Ogun',
        prescriber: 'Dr. Bello, Unity Hospital',
        items: [],
      },
    ];
    state.dispensings = [
      {
        id: 'd1',
        prescriptionId: 'rx-1',
        receiptNo: 'SM-9001',
        items: [],
      },
    ];

    render(<ControlledRegister />);
    await waitFor(() => expect(screen.getByText('SM-9001')).toBeTruthy());

    // Two controlled sales listed; the plain ORS sale is not.
    expect(screen.getByText('SM-9001')).toBeTruthy();
    expect(screen.getByText('SM-9002')).toBeTruthy();
    expect(screen.queryByText('SM-9003')).toBeNull();
    expect(screen.getByText(/2 controlled dispensings on record/i)).toBeTruthy();

    // The first sale links to its prescription patient + prescriber.
    const row = screen.getByText('SM-9001').closest('tr');
    expect(within(row).getByText('Mrs. Iyabo Ogun')).toBeTruthy();
    expect(within(row).getByText('Dr. Bello, Unity Hospital')).toBeTruthy();
    expect(within(row).getByText('pharm@healthway.ng')).toBeTruthy();
    expect(within(row).getByText(/TRA-11 ×2/)).toBeTruthy();

    // The unverified sale is flagged, with a count in the header.
    const row2 = screen.getByText('SM-9002').closest('tr');
    expect(within(row2).getByText('not recorded')).toBeTruthy();
    expect(screen.getByText(/1 without a named verifier/i)).toBeTruthy();

    // Search narrows to a patient.
    await userEvent.type(screen.getByLabelText('Search controlled register'), 'Iyabo');
    await waitFor(() => expect(screen.queryByText('SM-9002')).toBeNull());
    expect(screen.getByText('SM-9001')).toBeTruthy();
  });

  it('shows an explanatory empty state', async () => {
    render(<ControlledRegister />);
    await waitFor(() =>
      expect(screen.getByText(/No controlled medicines have been dispensed/i)).toBeTruthy()
    );
  });
});
