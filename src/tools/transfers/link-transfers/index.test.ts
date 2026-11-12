import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './index.js';

vi.mock('../../../actual-api.js', () => ({
  linkTransferTransactions: vi.fn(),
}));

import { linkTransferTransactions } from '../../../actual-api.js';

describe('link-transfers handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show grouped summary in dry run mode', async () => {
    vi.mocked(linkTransferTransactions).mockResolvedValue({
      pairs: [
        {
          sourceAccount: 'Monzo Personal Account',
          targetAccount: 'Attempted Savings (XXX zyhH) GBP',
          date: '2025-01-01',
          amount: -10000,
          sourceId: 'src-1',
          targetId: 'tgt-1',
        },
        {
          sourceAccount: 'Monzo Personal Account',
          targetAccount: 'Attempted Savings (XXX zyhH) GBP',
          date: '2025-02-01',
          amount: -10000,
          sourceId: 'src-2',
          targetId: 'tgt-2',
        },
        {
          sourceAccount: 'Monzo Joint Account',
          targetAccount: 'Cleaning (XXX jlUv) GBP',
          date: '2025-01-15',
          amount: -5000,
          sourceId: 'src-3',
          targetId: 'tgt-3',
        },
      ],
      skipped: 2,
      ambiguous: 1,
    });

    const result = await handler({ dryRun: true });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('3 transfer pair(s) would be linked');
    expect(text).toContain('2x  Monzo Personal Account ↔ Attempted Savings (XXX zyhH) GBP');
    expect(text).toContain('1x  Monzo Joint Account ↔ Cleaning (XXX jlUv) GBP');
    expect(text).toContain('2 transaction(s) skipped (no matching counterpart found)');
    expect(text).toContain('ambiguous');
    expect(text).toContain('dryRun: false');
    expect(linkTransferTransactions).toHaveBeenCalledWith(undefined, true);
  });

  it('should report linked count when applying changes', async () => {
    vi.mocked(linkTransferTransactions).mockResolvedValue({
      pairs: Array.from({ length: 5 }, (_, i) => ({
        sourceAccount: 'Monzo Personal Account',
        targetAccount: 'Attempted Savings (XXX zyhH) GBP',
        date: `2025-0${i + 1}-01`,
        amount: -10000,
        sourceId: `src-${i}`,
        targetId: `tgt-${i}`,
      })),
      skipped: 0,
      ambiguous: 0,
    });

    const result = await handler({ dryRun: false });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('5 pair(s) linked');
    expect(linkTransferTransactions).toHaveBeenCalledWith(undefined, false);
  });

  it('should return an error response when the API throws', async () => {
    vi.mocked(linkTransferTransactions).mockRejectedValue(new Error('API failure'));

    const result = await handler({});

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('API failure');
  });
});
