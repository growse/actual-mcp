// Collapses the two linked legs of each transfer into a single row for cross-account listings
import type { Account, Transaction } from '../../core/types/domain.js';

/**
 * Collapse transfer pairs so each transfer between two accounts appears once.
 *
 * Actual stores a transfer as two transactions, one per account, each pointing at the other via
 * `transfer_id`. A single-account listing only ever sees one leg, but a cross-account listing sees
 * both, which reads as a duplicate. When both legs are present, only one is kept and its payee is
 * rewritten to "Transfer: <from> → <to>" so the direction survives without an account column.
 *
 * @param transactions - Transactions fetched across multiple accounts
 * @param accounts - Accounts used to resolve account names for the transfer label
 * @returns Transactions with one leg of each fully-present transfer pair removed
 */
export function collapseTransferPairs(transactions: Transaction[], accounts: Account[]): Transaction[] {
  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const byId = new Map<string, Transaction>();
  const splitLegIds = new Set<string>();
  for (const t of transactions) {
    byId.set(t.id, t);
    for (const sub of t.subtransactions ?? []) {
      byId.set(sub.id, sub);
      splitLegIds.add(sub.id);
    }
  }

  const dropped = new Set<string>();
  const labelled = new Set<string>();

  // Reason: A split leg can't be removed without breaking its parent's split, so when a split leg
  // is one side of a transfer, the other side (a plain transaction in the other account) is the
  // one dropped.
  for (const sub of splitLegIds) {
    const leg = byId.get(sub)!;
    const other = leg.transfer_id ? byId.get(leg.transfer_id) : undefined;
    if (other && !splitLegIds.has(other.id)) {
      dropped.add(other.id);
      labelled.add(leg.id);
    }
  }

  for (const t of transactions) {
    if (!t.transfer_id || dropped.has(t.id) || labelled.has(t.id)) continue;
    const other = byId.get(t.transfer_id);
    if (!other || splitLegIds.has(other.id)) continue;
    // Reason: Keep the outgoing (negative) leg so the row reads as money leaving `from`; the id
    // tie-break keeps the choice deterministic for zero-amount transfers.
    const keepThis = t.amount < 0 || (t.amount === 0 && other.amount === 0 && t.id < other.id);
    labelled.add(keepThis ? t.id : other.id);
    dropped.add(keepThis ? other.id : t.id);
  }

  const relabel = (t: Transaction): Transaction => {
    const withSubs = t.subtransactions ? { ...t, subtransactions: t.subtransactions.map(relabel) } : t;
    if (!labelled.has(t.id)) return withSubs;
    const other = byId.get(t.transfer_id!)!;
    const here = accountNames.get(t.account) ?? t.account;
    const there = accountNames.get(other.account) ?? other.account;
    const [from, to] = t.amount <= 0 ? [here, there] : [there, here];
    return { ...withSubs, payee_name: `Transfer: ${from} → ${to}` };
  };

  return transactions.filter((t) => !dropped.has(t.id)).map(relabel);
}
