import { describe, expect, it, vi } from 'vitest';

import type { CategoryRepository } from '../../../src/repositories/category.repository.js';
import { ExpenseCursorCodec } from '../../../src/lib/expense-cursor.js';
import type {
  ExpenseRecord,
  ExpenseRepository,
} from '../../../src/repositories/expense.repository.js';
import { DefaultExpenseService } from '../../../src/services/expense.service.js';
import {
  createExpenseRecord,
  createExpenseSummaryRecord,
  TEST_CATEGORY,
  TEST_EXPENSE_ID,
  TEST_USER_ID,
} from '../../fixtures/expense.fixtures.js';

const userId = TEST_USER_ID;
const expenseId = TEST_EXPENSE_ID;
const category = TEST_CATEGORY;
const record = createExpenseRecord();
const summaryRecord = createExpenseSummaryRecord();

function repositories(
  options: {
    current?: ExpenseRecord | null;
    updated?: ExpenseRecord | null;
    currentVersion?: number | null;
    categoryActive?: boolean;
  } = {},
) {
  const expenses = {
    listOwned: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(record),
    findOwnedById: vi
      .fn()
      .mockResolvedValue(options.current === undefined ? record : options.current),
    findOwnedVersion: vi
      .fn()
      .mockResolvedValue(options.currentVersion === undefined ? 1 : options.currentVersion),
    update: vi
      .fn()
      .mockResolvedValue(
        options.updated === undefined ? { ...record, version: 2 } : options.updated,
      ),
    delete: vi.fn().mockResolvedValue(true),
  } satisfies ExpenseRepository;
  const categories = {
    listActive: vi.fn(),
    findStatusById: vi.fn().mockResolvedValue({
      ...category,
      isActive: options.categoryActive ?? true,
    }),
  } satisfies CategoryRepository;
  return {
    expenses,
    categories,
    service: new DefaultExpenseService(
      expenses,
      categories,
      new ExpenseCursorCodec('unit-test-cursor-secret-at-least-32-characters'),
    ),
  };
}

describe('expense service rules', () => {
  it('builds a bounded page and resumes after the last returned composite key', async () => {
    const { service, expenses } = repositories();
    const records = [
      summaryRecord,
      { ...summaryRecord, id: '30000000-0000-4000-8000-000000000002' },
      { ...summaryRecord, id: '30000000-0000-4000-8000-000000000003' },
    ];
    expenses.listOwned.mockResolvedValueOnce(records).mockResolvedValueOnce([]);

    const first = await service.listOwned(userId, { sort: 'expenseDateDesc', limit: 2 });
    expect(first.data.map((item) => item.id)).toEqual([records[0]!.id, records[1]!.id]);
    expect(first.meta.hasMore).toBe(true);
    expect(first.meta.nextCursor).toEqual(expect.any(String));

    await service.listOwned(userId, {
      sort: 'expenseDateDesc',
      limit: 2,
      cursor: first.meta.nextCursor!,
    });
    expect(expenses.listOwned).toHaveBeenLastCalledWith({
      userId,
      sort: 'expenseDateDesc',
      limit: 2,
      after: { sortValue: '2026-08-08', id: records[1]!.id },
    });
  });

  it('rejects tampered cursors and valid cursors reused with another query', async () => {
    const { service, expenses } = repositories();
    expenses.listOwned.mockResolvedValue([
      summaryRecord,
      { ...summaryRecord, id: '30000000-0000-4000-8000-000000000002' },
    ]);
    const first = await service.listOwned(userId, { sort: 'amountDesc', limit: 1 });
    const cursor = first.meta.nextCursor!;

    await expect(
      service.listOwned(userId, { sort: 'amountDesc', limit: 1, q: 'changed', cursor }),
    ).rejects.toMatchObject({ status: 400, code: 'CURSOR_QUERY_MISMATCH' });

    const tampered = `${cursor.slice(0, -1)}${cursor.endsWith('A') ? 'B' : 'A'}`;
    await expect(
      service.listOwned(userId, { sort: 'amountDesc', limit: 1, cursor: tampered }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_CURSOR' });
  });

  it('maps PostgreSQL dates/timestamps and leaves money exact', async () => {
    const { service } = repositories();
    const result = await service.getOwned(userId, expenseId);
    expect(result).toMatchObject({ amount: '120.50', expenseDate: '2026-08-08', receipt: null });
    expect(result.createdAt).toBe('2026-08-08T12:00:00.000Z');
  });

  it('rejects missing and inactive categories with distinct domain details', async () => {
    for (const categoryStatus of [null, { ...category, isActive: false }]) {
      const { service, categories } = repositories();
      categories.findStatusById.mockResolvedValue(categoryStatus);
      await expect(
        service.create(userId, {
          categoryId: category.id,
          title: 'Lunch',
          amount: '120.50',
          expenseDate: '2026-08-08',
          idempotencyKey: 'logical-create-0001',
        }),
      ).rejects.toMatchObject({
        status: 422,
        code: categoryStatus ? 'CATEGORY_INACTIVE' : 'VALIDATION_FAILED',
      });
    }
  });

  it('merges a partial update and asks for an active category only when it changes', async () => {
    const { service, expenses, categories } = repositories();
    await service.update(userId, expenseId, 1, { title: 'Dinner' });

    expect(categories.findStatusById).not.toHaveBeenCalled();
    expect(expenses.update).toHaveBeenCalledWith({
      id: expenseId,
      userId,
      categoryId: category.id,
      title: 'Dinner',
      amount: '120.50',
      expenseDate: '2026-08-08',
      note: null,
      expectedVersion: 1,
      requireActiveCategory: false,
    });
  });

  it('reports current ETag on stale update without attempting a write', async () => {
    const { service, expenses } = repositories({ current: { ...record, version: 4 } });
    await expect(service.update(userId, expenseId, 3, { title: 'Dinner' })).rejects.toMatchObject({
      status: 412,
      code: 'EXPENSE_VERSION_CONFLICT',
      headers: { ETag: '"4"' },
    });
    expect(expenses.update).not.toHaveBeenCalled();
  });

  it('classifies a concurrent update that wins after the initial read', async () => {
    const { service, expenses } = repositories({ updated: null, currentVersion: 2 });
    await expect(service.update(userId, expenseId, 1, { title: 'Dinner' })).rejects.toMatchObject({
      status: 412,
      code: 'EXPENSE_VERSION_CONFLICT',
      headers: { ETag: '"2"' },
    });
    expect(expenses.update).toHaveBeenCalledOnce();
  });

  it('does not invent a created expense when the guarded insert returns no row', async () => {
    const { service, expenses } = repositories();
    expenses.create.mockResolvedValue(null);
    await expect(
      service.create(userId, {
        categoryId: category.id,
        title: 'Lunch',
        amount: '120.50',
        expenseDate: '2026-08-08',
        idempotencyKey: 'logical-create-0001',
      }),
    ).rejects.toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
  });

  it('does not disclose whether a missing owned lookup belongs to another user', async () => {
    const { service } = repositories({ current: null });
    await expect(service.getOwned(userId, expenseId)).rejects.toMatchObject({
      status: 404,
      code: 'EXPENSE_NOT_FOUND',
    });
  });
});
