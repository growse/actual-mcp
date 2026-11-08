import { describe, it, expect } from 'vitest';
import { isUncategorized } from './filters.js';
import type { Transaction } from '../../core/types/domain.js';

const base: Transaction = { id: 'tx-1', account: 'acc-1', date: '2026-10-01', amount: -500 };

describe('isUncategorized', () => {
  it('matches a regular transaction with no category', () => {
    expect(isUncategorized({ ...base })).toBe(true);
  });

  it('does not match a categorised transaction', () => {
    expect(isUncategorized({ ...base, category: 'cat-1' })).toBe(false);
  });

  it('does not match a transfer, which has no category by design', () => {
    expect(isUncategorized({ ...base, transfer_id: 'tx-2' })).toBe(false);
  });

  it('does not match a split parent whose legs are all categorised or transfers', () => {
    const split: Transaction = {
      ...base,
      is_parent: true,
      subtransactions: [
        { ...base, id: 'sub-1', is_child: true, category: 'cat-1' },
        { ...base, id: 'sub-2', is_child: true, transfer_id: 'tx-9' },
      ],
    };
    expect(isUncategorized(split)).toBe(false);
  });

  it('matches a split parent with an uncategorised leg', () => {
    const split: Transaction = {
      ...base,
      is_parent: true,
      subtransactions: [
        { ...base, id: 'sub-1', is_child: true, category: 'cat-1' },
        { ...base, id: 'sub-2', is_child: true },
      ],
    };
    expect(isUncategorized(split)).toBe(true);
  });
});
