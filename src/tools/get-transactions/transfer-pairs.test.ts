import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from '../../core/types/domain.js';
import { collapseTransferPairs } from './transfer-pairs.js';

const accounts: Account[] = [
  { id: 'joint', name: 'Joint' },
  { id: 'savings', name: 'Savings' },
  { id: 'amex', name: 'Amex' },
];

function tx(overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'account' | 'amount'>): Transaction {
  return { date: '2026-09-25', ...overrides };
}

describe('collapseTransferPairs', () => {
  it('keeps only the outgoing leg of a transfer pair and labels its direction', () => {
    const result = collapseTransferPairs(
      [
        tx({ id: 'in', account: 'savings', amount: 5000, transfer_id: 'out', payee_name: 'Joint' }),
        tx({ id: 'out', account: 'joint', amount: -5000, transfer_id: 'in', payee_name: 'Savings' }),
        tx({ id: 'coffee', account: 'joint', amount: -300, payee_name: 'Cafe' }),
      ],
      accounts
    );

    expect(result.map((t) => t.id)).toEqual(['out', 'coffee']);
    expect(result[0].payee_name).toBe('Transfer: Joint → Savings');
    expect(result[1].payee_name).toBe('Cafe');
  });

  it('leaves a transfer untouched when its other leg is not in the result set', () => {
    const lone = tx({ id: 'in', account: 'savings', amount: 5000, transfer_id: 'missing', payee_name: 'Joint' });

    expect(collapseTransferPairs([lone], accounts)).toEqual([lone]);
  });

  it('collapses a self-transfer within one account to a single row', () => {
    const result = collapseTransferPairs(
      [
        tx({ id: 'a', account: 'amex', amount: 120000, transfer_id: 'b' }),
        tx({ id: 'b', account: 'amex', amount: -120000, transfer_id: 'a' }),
      ],
      accounts
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'b', payee_name: 'Transfer: Amex → Amex' });
  });

  it('drops the plain leg rather than a split leg when a split line is a transfer', () => {
    const result = collapseTransferPairs(
      [
        tx({
          id: 'parent',
          account: 'joint',
          amount: -8000,
          is_parent: true,
          subtransactions: [
            tx({ id: 'sub-spend', account: 'joint', amount: -3000, payee_name: 'Shop' }),
            tx({ id: 'sub-xfer', account: 'joint', amount: -5000, transfer_id: 'plain', is_child: true }),
          ],
        }),
        tx({ id: 'plain', account: 'savings', amount: 5000, transfer_id: 'sub-xfer' }),
      ],
      accounts
    );

    expect(result.map((t) => t.id)).toEqual(['parent']);
    expect(result[0].subtransactions?.map((s) => s.payee_name)).toEqual(['Shop', 'Transfer: Joint → Savings']);
  });

  it('falls back to account ids when an account name is unknown', () => {
    const result = collapseTransferPairs(
      [
        tx({ id: 'x', account: 'gone', amount: -100, transfer_id: 'y' }),
        tx({ id: 'y', account: 'joint', amount: 100, transfer_id: 'x' }),
      ],
      accounts
    );

    expect(result[0].payee_name).toBe('Transfer: gone → Joint');
  });
});
