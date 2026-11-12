import * as api from '@actual-app/api';
import { APIAccountEntity, APIPayeeEntity } from '@actual-app/api/models';
import { TransactionEntity } from '@actual-app/core/types/models';
import { getActualConnection } from './integrations/actual/connection.js';

// Reason: the earliest date we scan from; Actual has no "all time" option for getTransactions.
const ALL_TIME_START = '2000-01-01';

export interface RunRulesResult {
  updated: number;
  processed: number;
}

export interface TransferPair {
  sourceAccount: string;
  targetAccount: string;
  date: string;
  amount: number;
  sourceId: string;
  targetId: string;
}

export interface LinkTransfersResult {
  pairs: TransferPair[];
  skipped: number;
  ambiguous: number;
}

/**
 * Returns today's date as `YYYY-MM-DD`.
 */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Returns open, on-budget accounts.
 */
function onBudget(accounts: APIAccountEntity[]): APIAccountEntity[] {
  return accounts.filter((a) => !a.closed && !a.offbudget);
}

/**
 * Apply all rules to existing uncategorized transactions.
 *
 * @param accountId - Optional account ID to limit processing; omit to process all on-budget accounts
 * @returns Count of transactions processed and updated
 */
export function runRulesOnTransactions(accountId?: string): Promise<RunRulesResult> {
  // Reason: inside run() we must call raw api.* functions; facade wrappers would re-enter the queue.
  return getActualConnection().run(async (actualLib) => {
    const end = today();
    const allAccounts = await api.getAccounts();
    const targetAccounts = accountId ? allAccounts.filter((a) => a.id === accountId) : onBudget(allAccounts);

    let updated = 0;
    let processed = 0;

    await api.batchBudgetUpdates(async () => {
      for (const account of targetAccounts) {
        const transactions = await api.getTransactions(account.id, ALL_TIME_START, end);

        for (const transaction of transactions) {
          // Skip transfers and already-categorized transactions
          if (transaction.transfer_id || transaction.category) continue;

          processed++;

          const result = (await actualLib.send('rules-run', { transaction })) as
            { category?: string } | null | undefined;

          if (result?.category && result.category !== transaction.category) {
            await api.updateTransaction(transaction.id, { category: result.category } as Partial<TransactionEntity>);
            updated++;
          }
        }
      }
    });

    return { updated, processed };
  });
}

/**
 * Detect and link unmatched transfer transactions between on-budget accounts.
 * Matches by payee name matching an account name, same date, and opposite amount.
 *
 * @param accountId - Optional account ID to limit scanning to one source account
 * @param dryRun - If true, return what would be linked without making changes
 * @returns The linked (or would-be-linked) pairs plus skipped/ambiguous counts
 */
export function linkTransferTransactions(accountId?: string, dryRun = false): Promise<LinkTransfersResult> {
  return getActualConnection().run(async () => {
    const end = today();
    const allAccounts = await api.getAccounts();
    const onBudgetAccounts = onBudget(allAccounts);

    // Map lowercase account name → account ID for payee name matching
    const accountIdByName = new Map<string, string>();
    const accountNameById = new Map<string, string>();
    for (const account of allAccounts) {
      accountIdByName.set(account.name.toLowerCase(), account.id);
      accountNameById.set(account.id, account.name);
    }

    // Map account ID → transfer payee ID (the special payee with transfer_acct = accountId),
    // and payee ID → payee name for resolving transaction.payee
    const allPayees = await api.getPayees();
    const transferPayeeByAccount = new Map<string, string>();
    const payeeNameById = new Map<string, string>();
    for (const payee of allPayees) {
      const p = payee as APIPayeeEntity & { transfer_acct?: string };
      if (p.transfer_acct) transferPayeeByAccount.set(p.transfer_acct, payee.id);
      payeeNameById.set(payee.id, payee.name);
    }

    // Reason: pre-load a (date:amount) lookup per account so counterpart matching is O(1).
    const txByAccount = new Map<string, TransactionEntity[]>();
    const counterpartLookup = new Map<string, Map<string, TransactionEntity[]>>();
    for (const account of onBudgetAccounts) {
      const txs = await api.getTransactions(account.id, ALL_TIME_START, end);
      txByAccount.set(account.id, txs);
      const byDateAmount = new Map<string, TransactionEntity[]>();
      for (const tx of txs) {
        if (tx.transfer_id) continue;
        const key = `${tx.date}:${tx.amount}`;
        const bucket = byDateAmount.get(key) ?? [];
        bucket.push(tx);
        byDateAmount.set(key, bucket);
      }
      counterpartLookup.set(account.id, byDateAmount);
    }

    const sourceAccounts = accountId ? onBudgetAccounts.filter((a) => a.id === accountId) : onBudgetAccounts;

    const pairs: TransferPair[] = [];
    const processedIds = new Set<string>();
    let skipped = 0;
    let ambiguous = 0;

    await api.batchBudgetUpdates(async () => {
      for (const account of sourceAccounts) {
        for (const transaction of txByAccount.get(account.id) ?? []) {
          if (processedIds.has(transaction.id)) continue;
          if (transaction.transfer_id || transaction.category) continue;

          // Resolve payee name: prefer the stored payee name, fall back to imported_payee
          const payeeName =
            (transaction.payee ? (payeeNameById.get(transaction.payee) ?? '') : '') || transaction.imported_payee || '';

          const targetAccountId = accountIdByName.get(payeeName.toLowerCase());
          if (!targetAccountId || targetAccountId === account.id) continue;

          // Find counterpart: same date, opposite amount, not yet processed
          const counterpartKey = `${transaction.date}:${-transaction.amount}`;
          const candidates = (counterpartLookup.get(targetAccountId)?.get(counterpartKey) ?? []).filter(
            (t) => !processedIds.has(t.id)
          );

          if (candidates.length === 0) {
            skipped++;
            continue;
          }
          if (candidates.length > 1) {
            ambiguous++;
            continue;
          }

          const counterpart = candidates[0];

          if (!dryRun) {
            const targetTransferPayee = transferPayeeByAccount.get(targetAccountId);
            const sourceTransferPayee = transferPayeeByAccount.get(account.id);

            await api.updateTransaction(transaction.id, {
              transfer_id: counterpart.id,
              ...(targetTransferPayee ? { payee: targetTransferPayee } : {}),
            } as Partial<TransactionEntity>);

            await api.updateTransaction(counterpart.id, {
              transfer_id: transaction.id,
              ...(sourceTransferPayee ? { payee: sourceTransferPayee } : {}),
            } as Partial<TransactionEntity>);
          }

          pairs.push({
            sourceAccount: accountNameById.get(account.id) ?? account.id,
            targetAccount: accountNameById.get(targetAccountId) ?? targetAccountId,
            date: transaction.date,
            amount: transaction.amount,
            sourceId: transaction.id,
            targetId: counterpart.id,
          });

          processedIds.add(transaction.id);
          processedIds.add(counterpart.id);
        }
      }
    });

    return { pairs, skipped, ambiguous };
  });
}
