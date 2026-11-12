// ----------------------------
// RUN RULES TOOL
// ----------------------------

import { z, toJSONSchema } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { success, errorFromCatch } from '../../../utils/response.js';
import { runRulesOnTransactions } from '../../../actual-api.js';
import type { ToolInput } from '../../../types.js';

const RunRulesArgsSchema = z.object({
  accountId: z
    .string()
    .optional()
    .describe(
      'Optional account ID to limit rule application to a specific account. ' +
        'Omit to process all on-budget accounts.'
    ),
});

type RunRulesArgs = z.infer<typeof RunRulesArgsSchema>;

export const schema = {
  name: 'run-rules',
  description:
    'Apply all rules to existing uncategorized transactions. ' +
    'Useful after creating new rules to categorise historical transactions.',
  inputSchema: toJSONSchema(RunRulesArgsSchema) as ToolInput,
};

export async function handler(args: RunRulesArgs): Promise<CallToolResult> {
  try {
    const { accountId } = RunRulesArgsSchema.parse(args);
    const { updated, processed } = await runRulesOnTransactions(accountId);

    return success(`Rules applied: ${updated} of ${processed} uncategorized transactions were categorised.`);
  } catch (err) {
    return errorFromCatch(err);
  }
}
