import { createHash } from 'node:crypto';

import { AppError } from '../errors/app-error.js';
import { InvalidExpenseCursorError, type ExpenseCursorCodec } from '../lib/expense-cursor.js';
import type { CategoryRepository } from '../repositories/category.repository.js';
import type {
  ExpenseRecord,
  ExpenseRepository,
  ExpenseSummaryRecord,
} from '../repositories/expense.repository.js';
import type {
  CreateExpenseRequest,
  ExpenseSort,
  ListExpensesQuery,
  UpdateExpenseRequest,
} from '../validation/expense.validation.js';

export interface ExpenseResource {
  id: string;
  category: ExpenseRecord['category'];
  title: string;
  amount: string;
  expenseDate: string;
  note: string | null;
  version: number;
  receipt: null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseCommand extends CreateExpenseRequest {
  idempotencyKey: string;
}

export interface ExpenseSummaryResource {
  id: string;
  category: ExpenseSummaryRecord['category'];
  title: string;
  amount: string;
  expenseDate: string;
  version: number;
  hasReceipt: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseListResource {
  data: ExpenseSummaryResource[];
  meta: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface ExpenseService {
  listOwned(userId: string, query: ListExpensesQuery): Promise<ExpenseListResource>;
  create(userId: string, input: CreateExpenseCommand): Promise<ExpenseResource>;
  getOwned(userId: string, expenseId: string): Promise<ExpenseResource>;
  update(
    userId: string,
    expenseId: string,
    expectedVersion: number,
    input: UpdateExpenseRequest,
  ): Promise<ExpenseResource>;
  delete(userId: string, expenseId: string, expectedVersion: number): Promise<void>;
}

function mapExpenseSummary(record: ExpenseSummaryRecord): ExpenseSummaryResource {
  return {
    id: record.id,
    category: record.category,
    title: record.title,
    amount: record.amount,
    expenseDate: record.expenseDate,
    version: record.version,
    hasReceipt: record.hasReceipt,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapExpense(record: ExpenseRecord): ExpenseResource {
  return {
    id: record.id,
    category: record.category,
    title: record.title,
    amount: record.amount,
    expenseDate: record.expenseDate,
    note: record.note,
    version: record.version,
    receipt: null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function expenseNotFound(): AppError {
  return new AppError({
    status: 404,
    code: 'EXPENSE_NOT_FOUND',
    message: 'Expense not found',
  });
}

function categoryValidationError(inactive: boolean): AppError {
  return new AppError({
    status: 422,
    code: inactive ? 'CATEGORY_INACTIVE' : 'VALIDATION_FAILED',
    message: inactive ? 'Category is inactive' : 'One or more fields are invalid',
    details: [
      {
        field: 'categoryId',
        code: inactive ? 'INACTIVE' : 'NOT_FOUND',
        message: inactive ? 'Category is inactive' : 'Category does not exist',
      },
    ],
  });
}

function versionConflict(currentVersion: number): AppError {
  return new AppError({
    status: 412,
    code: 'EXPENSE_VERSION_CONFLICT',
    message: 'Expense version does not match',
    headers: { ETag: `"${currentVersion}"` },
  });
}

function invalidCursor(): AppError {
  return new AppError({
    status: 400,
    code: 'INVALID_CURSOR',
    message: 'Cursor is invalid',
  });
}

function cursorQueryMismatch(): AppError {
  return new AppError({
    status: 400,
    code: 'CURSOR_QUERY_MISMATCH',
    message: 'Cursor does not match this expense query',
  });
}

function createQueryFingerprint(userId: string, query: ListExpensesQuery): string {
  const identity = [
    1,
    userId,
    query.q ?? null,
    query.categoryId ?? null,
    query.from ?? null,
    query.to ?? null,
    query.sort,
    query.limit,
  ];
  return createHash('sha256').update(JSON.stringify(identity), 'utf8').digest('hex');
}

function isCursorSortValue(sort: ExpenseSort, value: string): boolean {
  if (sort === 'expenseDateAsc' || sort === 'expenseDateDesc') {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }
  return /^(?:0|[1-9][0-9]{0,8})\.[0-9]{2}$/.test(value) && value !== '0.00';
}

export class DefaultExpenseService implements ExpenseService {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly categories: CategoryRepository,
    private readonly cursors: ExpenseCursorCodec,
  ) {}

  async listOwned(userId: string, query: ListExpensesQuery): Promise<ExpenseListResource> {
    const fingerprint = createQueryFingerprint(userId, query);
    let after: { sortValue: string; id: string } | undefined;

    if (query.cursor !== undefined) {
      try {
        const decoded = this.cursors.decode(query.cursor);
        if (decoded.fingerprint !== fingerprint) {
          throw cursorQueryMismatch();
        }
        if (!isCursorSortValue(query.sort, decoded.sortValue)) {
          throw invalidCursor();
        }
        after = { sortValue: decoded.sortValue, id: decoded.id };
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        if (error instanceof InvalidExpenseCursorError) {
          throw invalidCursor();
        }
        throw error;
      }
    }

    const records = await this.expenses.listOwned({
      userId,
      ...(query.q === undefined ? {} : { q: query.q }),
      ...(query.categoryId === undefined ? {} : { categoryId: query.categoryId }),
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.to === undefined ? {} : { to: query.to }),
      sort: query.sort,
      limit: query.limit,
      ...(after === undefined ? {} : { after }),
    });
    const hasMore = records.length > query.limit;
    const page = records.slice(0, query.limit);
    const last = page.at(-1);
    const nextCursor =
      hasMore && last
        ? this.cursors.encode({
            fingerprint,
            sortValue:
              query.sort === 'expenseDateAsc' || query.sort === 'expenseDateDesc'
                ? last.expenseDate
                : last.amount,
            id: last.id,
          })
        : null;

    return {
      data: page.map(mapExpenseSummary),
      meta: { limit: query.limit, hasMore, nextCursor },
    };
  }

  private async assertActiveCategory(categoryId: string): Promise<void> {
    const category = await this.categories.findStatusById(categoryId);
    if (!category?.isActive) {
      throw categoryValidationError(Boolean(category));
    }
  }

  private async classifyFailedMutation(
    userId: string,
    expenseId: string,
    expectedVersion: number,
  ): Promise<never> {
    const currentVersion = await this.expenses.findOwnedVersion(expenseId, userId);
    if (currentVersion === null) {
      throw expenseNotFound();
    }
    if (currentVersion !== expectedVersion) {
      throw versionConflict(currentVersion);
    }
    throw new AppError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
  }

  async create(userId: string, input: CreateExpenseCommand): Promise<ExpenseResource> {
    // The header is part of the stable contract now. Durable replay protection is deliberately Phase 13.
    void input.idempotencyKey;
    await this.assertActiveCategory(input.categoryId);
    const created = await this.expenses.create({
      userId,
      categoryId: input.categoryId,
      title: input.title,
      amount: input.amount,
      expenseDate: input.expenseDate,
      note: input.note ?? null,
    });
    if (!created) {
      await this.assertActiveCategory(input.categoryId);
      throw new AppError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      });
    }
    return mapExpense(created);
  }

  async getOwned(userId: string, expenseId: string): Promise<ExpenseResource> {
    const expense = await this.expenses.findOwnedById(expenseId, userId);
    if (!expense) {
      throw expenseNotFound();
    }
    return mapExpense(expense);
  }

  async update(
    userId: string,
    expenseId: string,
    expectedVersion: number,
    input: UpdateExpenseRequest,
  ): Promise<ExpenseResource> {
    const current = await this.expenses.findOwnedById(expenseId, userId);
    if (!current) {
      throw expenseNotFound();
    }
    if (current.version !== expectedVersion) {
      throw versionConflict(current.version);
    }

    const categoryId = input.categoryId ?? current.category.id;
    const categoryChanged = categoryId !== current.category.id;
    if (categoryChanged) {
      await this.assertActiveCategory(categoryId);
    }

    const updated = await this.expenses.update({
      id: expenseId,
      userId,
      categoryId,
      title: input.title ?? current.title,
      amount: input.amount ?? current.amount,
      expenseDate: input.expenseDate ?? current.expenseDate,
      note: input.note === undefined ? current.note : input.note,
      expectedVersion,
      requireActiveCategory: categoryChanged,
    });
    if (!updated) {
      const stillCurrentVersion = await this.expenses.findOwnedVersion(expenseId, userId);
      if (stillCurrentVersion === expectedVersion && categoryChanged) {
        await this.assertActiveCategory(categoryId);
      }
      await this.classifyFailedMutation(userId, expenseId, expectedVersion);
      throw new Error('Unreachable failed mutation classification');
    }
    return mapExpense(updated);
  }

  async delete(userId: string, expenseId: string, expectedVersion: number): Promise<void> {
    const deleted = await this.expenses.delete(expenseId, userId, expectedVersion);
    if (!deleted) {
      await this.classifyFailedMutation(userId, expenseId, expectedVersion);
    }
  }
}
