// ----------------------------
// LINK TRANSFERS TOOL
// ----------------------------

import { z, toJSONSchema } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { success, errorFromCatch } from '../../../utils/response.js';
import { linkTransferTransactions } from '../../../actual-api.js';
import type { ToolInput } from '../../../types.js';

const LinkTransfersArgsSchema = z.object({
  accountId: z.string().optional().describe('Optional account ID to limit scanning to a specific source account.'),
  dryRun: z
    .boolean()
    .optional()
    .describe('If true, show what would be linked without making any changes. Use this first to preview.'),
});

type LinkTransfersArgs = z.infer<typeof LinkTransfersArgsSchema>;

export const schema = {
  name: 'link-transfers',
  description:
    'Detect and link unmatched transfer transactions between on-budget accounts (e.g. Monzo pot movements). ' +
    'Matches transactions where the payee name matches another account name, with the same date and opposite amount. ' +
    'Use dryRun: true first to preview which pairs would be linked.',
  inputSchema: toJSONSchema(LinkTransfersArgsSchema) as ToolInput,
};

export async function handler(args: LinkTransfersArgs): Promise<CallToolResult> {
  try {
    const { accountId, dryRun = false } = LinkTransfersArgsSchema.parse(args);
    const { pairs, skipped, ambiguous } = await linkTransferTransactions(accountId, dryRun);

    if (dryRun) {
      // Group pairs by account pair for a readable summary
      const byAccountPair = new Map<string, number>();
      for (const pair of pairs) {
        const key = `${pair.sourceAccount} ↔ ${pair.targetAccount}`;
        byAccountPair.set(key, (byAccountPair.get(key) ?? 0) + 1);
      }

      const lines = [
        `Dry run — ${pairs.length} transfer pair(s) would be linked:`,
        '',
        ...[...byAccountPair.entries()].sort((a, b) => b[1] - a[1]).map(([pair, count]) => `  ${count}x  ${pair}`),
      ];

      if (skipped > 0) lines.push('', `  ${skipped} transaction(s) skipped (no matching counterpart found)`);
      if (ambiguous > 0)
        lines.push(`  ${ambiguous} transaction(s) skipped (ambiguous — multiple same-date/amount counterparts)`);
      lines.push('', 'Run again with dryRun: false to apply.');

      return success(lines.join('\n'));
    }

    const lines = [`Transfer linking complete: ${pairs.length} pair(s) linked.`];
    if (skipped > 0) lines.push(`  ${skipped} transaction(s) skipped (no matching counterpart found)`);
    if (ambiguous > 0)
      lines.push(`  ${ambiguous} transaction(s) skipped (ambiguous — multiple same-date/amount counterparts)`);

    return success(lines.join('\n'));
  } catch (err) {
    return errorFromCatch(err);
  }
}
