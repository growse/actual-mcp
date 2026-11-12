import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './index.js';

vi.mock('../../../actual-api.js', () => ({
  runRulesOnTransactions: vi.fn(),
}));

import { runRulesOnTransactions } from '../../../actual-api.js';

describe('run-rules handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should report how many transactions were categorised', async () => {
    vi.mocked(runRulesOnTransactions).mockResolvedValue({ updated: 42, processed: 100 });

    const result = await handler({});

    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('42') });
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('100') });
    expect(runRulesOnTransactions).toHaveBeenCalledWith(undefined);
  });

  it('should pass accountId through when provided', async () => {
    vi.mocked(runRulesOnTransactions).mockResolvedValue({ updated: 5, processed: 10 });

    const result = await handler({ accountId: 'abc-123' });

    expect(result.isError).toBeFalsy();
    expect(runRulesOnTransactions).toHaveBeenCalledWith('abc-123');
  });

  it('should return an error response when the API throws', async () => {
    vi.mocked(runRulesOnTransactions).mockRejectedValue(new Error('Internal API not available'));

    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: expect.stringContaining('Internal API not available'),
    });
  });
});
