import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();

vi.mock('@actual-app/api', () => ({
  getAccounts: vi.fn(),
  getPayees: vi.fn(),
  getTransactions: vi.fn(),
  updateTransaction: vi.fn(),
  batchBudgetUpdates: vi.fn(async (fn: () => Promise<void>) => fn()),
}));

vi.mock('./integrations/actual/connection.js', () => ({
  getActualConnection: () => ({
    run: <T>(op: (lib: { send: typeof send }) => Promise<T>): Promise<T> => op({ send }),
  }),
}));

import * as api from '@actual-app/api';
import { linkTransferTransactions, runRulesOnTransactions } from './actual-api-maintenance.js';

const accounts = [
  { id: 'a1', name: 'Current', closed: false, offbudget: false },
  { id: 'a2', name: 'Savings Pot', closed: false, offbudget: false },
  { id: 'a3', name: 'Pension', closed: false, offbudget: true },
];

const payees = [
  { id: 'p-pot', name: 'Savings Pot' },
  { id: 't1', name: '', transfer_acct: 'a1' },
  { id: 't2', name: '', transfer_acct: 'a2' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAccounts).mockResolvedValue(accounts as never);
  vi.mocked(api.getPayees).mockResolvedValue(payees as never);
});

describe('runRulesOnTransactions', () => {
  it('categorises uncategorized transactions on on-budget accounts', async () => {
    vi.mocked(api.getTransactions).mockImplementation((async (id: string) =>
      id === 'a1'
        ? [
            { id: 'x1', category: null },
            { id: 'x2', category: 'c-existing' },
            { id: 'x3', category: null, transfer_id: 'y' },
          ]
        : [{ id: 'x4', category: null }]) as never);
    send.mockResolvedValueOnce({ category: 'c-new' }).mockResolvedValueOnce({ category: null });

    const result = await runRulesOnTransactions();

    expect(api.getTransactions).toHaveBeenCalledTimes(2); // off-budget account skipped
    expect(send).toHaveBeenCalledWith('rules-run', { transaction: { id: 'x1', category: null } });
    expect(api.updateTransaction).toHaveBeenCalledExactlyOnceWith('x1', { category: 'c-new' });
    expect(result).toEqual({ updated: 1, processed: 2 });
  });

  it('only processes the requested account', async () => {
    vi.mocked(api.getTransactions).mockResolvedValue([] as never);

    await runRulesOnTransactions('a3');

    expect(api.getTransactions).toHaveBeenCalledExactlyOnceWith('a3', '2000-01-01', expect.any(String));
  });

  it('propagates errors from the rules engine', async () => {
    vi.mocked(api.getTransactions).mockResolvedValue([{ id: 'x1', category: null }] as never);
    send.mockRejectedValueOnce(new Error('boom'));

    await expect(runRulesOnTransactions()).rejects.toThrow('boom');
  });
});

describe('linkTransferTransactions', () => {
  const sourceTx = { id: 's1', date: '2026-01-05', amount: -1000, payee: 'p-pot', category: null };
  const targetTx = { id: 'd1', date: '2026-01-05', amount: 1000, payee: null, category: null };

  it('links a unique counterpart and sets transfer payees', async () => {
    vi.mocked(api.getTransactions).mockImplementation((async (id: string) =>
      id === 'a1' ? [sourceTx] : [targetTx]) as never);

    const result = await linkTransferTransactions();

    expect(result.pairs).toEqual([
      {
        sourceAccount: 'Current',
        targetAccount: 'Savings Pot',
        date: '2026-01-05',
        amount: -1000,
        sourceId: 's1',
        targetId: 'd1',
      },
    ]);
    expect(api.updateTransaction).toHaveBeenCalledWith('s1', { transfer_id: 'd1', payee: 't2' });
    expect(api.updateTransaction).toHaveBeenCalledWith('d1', { transfer_id: 's1', payee: 't1' });
  });

  it('counts ambiguous matches and makes no changes in dry-run', async () => {
    vi.mocked(api.getTransactions).mockImplementation((async (id: string) =>
      id === 'a1' ? [sourceTx] : [targetTx, { ...targetTx, id: 'd2' }]) as never);

    const result = await linkTransferTransactions(undefined, true);

    expect(result).toEqual({ pairs: [], skipped: 0, ambiguous: 1 });
    expect(api.updateTransaction).not.toHaveBeenCalled();
  });

  it('counts transactions with no counterpart as skipped', async () => {
    vi.mocked(api.getTransactions).mockImplementation((async (id: string) => (id === 'a1' ? [sourceTx] : [])) as never);

    const result = await linkTransferTransactions('a1');

    expect(result).toEqual({ pairs: [], skipped: 1, ambiguous: 0 });
  });
});
