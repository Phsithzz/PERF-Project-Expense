import type {
  ExpenseRecord,
  ExpenseSummaryRecord,
} from '../../src/repositories/expense.repository.js';
import type { ExpenseResource } from '../../src/services/expense.service.js';

export const TEST_USER_ID = '20000000-0000-4000-8000-000000000001';
export const TEST_EXPENSE_ID = '30000000-0000-4000-8000-000000000001';
export const TEST_CATEGORY = {
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'food',
  displayName: 'Food',
} as const;

export function createExpenseRecord(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: TEST_EXPENSE_ID,
    category: TEST_CATEGORY,
    title: 'Lunch',
    amount: '120.50',
    expenseDate: '2026-08-08',
    note: null,
    version: 1,
    createdAt: new Date('2026-08-08T12:00:00.000Z'),
    updatedAt: new Date('2026-08-08T12:00:00.000Z'),
    ...overrides,
  };
}

export function createExpenseSummaryRecord(
  overrides: Partial<ExpenseSummaryRecord> = {},
): ExpenseSummaryRecord {
  const expense = createExpenseRecord();
  return {
    id: expense.id,
    category: expense.category,
    title: expense.title,
    amount: expense.amount,
    expenseDate: expense.expenseDate,
    version: expense.version,
    hasReceipt: false,
    createdAt: expense.createdAt,
    updatedAt: expense.updatedAt,
    ...overrides,
  };
}

export function createExpenseResource(overrides: Partial<ExpenseResource> = {}): ExpenseResource {
  const expense = createExpenseRecord();
  return {
    id: expense.id,
    category: expense.category,
    title: expense.title,
    amount: expense.amount,
    expenseDate: expense.expenseDate,
    note: expense.note,
    version: expense.version,
    receipt: null,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
    ...overrides,
  };
}
