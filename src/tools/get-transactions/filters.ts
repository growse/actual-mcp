// Filter predicates for the get-transactions tool
import type { Transaction } from '../../core/types/domain.js';

/**
 * Whether a single (non-split) transaction or split leg still needs a category.
 *
 * @param t - The transaction or split leg to check
 * @returns True when it has no category and is not a transfer
 */
function needsCategory(t: Transaction): boolean {
  // Reason: Transfers between accounts legitimately carry no category in Actual, so they
  // would otherwise swamp the results with rows that need no attention.
  return !t.category && !t.transfer_id;
}

/**
 * Whether a transaction is uncategorised and needs attention.
 *
 * A split parent never carries a category itself, so it counts as uncategorised
 * only when at least one of its legs is.
 *
 * @param t - The transaction to check
 * @returns True when the transaction (or any of its split legs) needs a category
 */
export function isUncategorized(t: Transaction): boolean {
  if (t.subtransactions && t.subtransactions.length > 0) {
    return t.subtransactions.some(needsCategory);
  }
  return needsCategory(t);
}
