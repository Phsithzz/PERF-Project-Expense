import type { Pool } from 'pg';

import type { CategoryRecord } from './category.repository.js';
import type { ExpenseSort } from '../validation/expense.validation.js';

export interface ExpenseRecord {
  id: string;
  category: CategoryRecord;
  title: string;
  amount: string;
  expenseDate: string;
  note: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ExpenseRow {
  id: string;
  category_id: string;
  category_slug: string;
  category_display_name: string;
  title: string;
  amount: string;
  expense_date: string | Date;
  note: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateExpenseRecordInput {
  userId: string;
  categoryId: string;
  title: string;
  amount: string;
  expenseDate: string;
  note: string | null;
}

export interface UpdateExpenseRecordInput extends CreateExpenseRecordInput {
  id: string;
  expectedVersion: number;
  requireActiveCategory: boolean;
}

export interface ExpenseSummaryRecord {
  id: string;
  category: CategoryRecord;
  title: string;
  amount: string;
  expenseDate: string;
  version: number;
  hasReceipt: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ExpenseSummaryRow extends Omit<ExpenseRow, 'note'> {
  has_receipt: boolean;
}

export interface ExpenseCursorPosition {
  sortValue: string;
  id: string;
}

export interface ListExpensesRecordInput {
  userId: string;
  q?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  sort: ExpenseSort;
  limit: number;
  after?: ExpenseCursorPosition;
}

function mapExpense(row: ExpenseRow): ExpenseRecord {
  return {
    id: row.id,
    category: {
      id: row.category_id,
      slug: row.category_slug,
      displayName: row.category_display_name,
    },
    title: row.title,
    amount: row.amount,
    expenseDate: mapExpenseDate(row.expense_date),
    note: row.note,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapExpenseDate(value: string | Date): string {
  if (typeof value === 'string') {
    return value;
  }
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mapExpenseSummary(row: ExpenseSummaryRow): ExpenseSummaryRecord {
  return {
    id: row.id,
    category: {
      id: row.category_id,
      slug: row.category_slug,
      displayName: row.category_display_name,
    },
    title: row.title,
    amount: row.amount,
    expenseDate: mapExpenseDate(row.expense_date),
    version: row.version,
    hasReceipt: row.has_receipt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const expenseColumns = `
  e.id,
  e.category_id,
  c.slug AS category_slug,
  c.display_name AS category_display_name,
  e.title,
  e.amount,
  e.expense_date,
  e.note,
  e.version,
  e.created_at,
  e.updated_at`;

export interface ExpenseRepository {
  create(input: CreateExpenseRecordInput): Promise<ExpenseRecord | null>;
  findOwnedById(id: string, userId: string): Promise<ExpenseRecord | null>;
  findOwnedVersion(id: string, userId: string): Promise<number | null>;
  update(input: UpdateExpenseRecordInput): Promise<ExpenseRecord | null>;
  delete(id: string, userId: string, expectedVersion: number): Promise<boolean>;
  listOwned(input: ListExpensesRecordInput): Promise<ExpenseSummaryRecord[]>;
}

export class PostgresExpenseRepository implements ExpenseRepository {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async create(input: CreateExpenseRecordInput): Promise<ExpenseRecord | null> {
    const result = await this.pool.query<ExpenseRow>(
      `WITH inserted AS (
         INSERT INTO expenses (user_id, category_id, title, amount, expense_date, note)
         SELECT $1, c.id, $3, $4, $5, $6
         FROM categories AS c
         WHERE c.id = $2
           AND c.is_active = TRUE
         RETURNING id, category_id, title, amount, expense_date, note, version, created_at, updated_at
       )
       SELECT ${expenseColumns}
       FROM inserted AS e
       JOIN categories AS c ON c.id = e.category_id`,
      [input.userId, input.categoryId, input.title, input.amount, input.expenseDate, input.note],
    );
    const row = result.rows[0];
    return row ? mapExpense(row) : null;
  }

  async findOwnedById(id: string, userId: string): Promise<ExpenseRecord | null> {
    const result = await this.pool.query<ExpenseRow>(
      `SELECT ${expenseColumns}
       FROM expenses AS e
       JOIN categories AS c ON c.id = e.category_id
       WHERE e.id = $1
         AND e.user_id = $2`,
      [id, userId],
    );
    const row = result.rows[0];
    return row ? mapExpense(row) : null;
  }

  async findOwnedVersion(id: string, userId: string): Promise<number | null> {
    const result = await this.pool.query<{ version: number }>(
      `SELECT version
       FROM expenses
       WHERE id = $1
         AND user_id = $2`,
      [id, userId],
    );
    return result.rows[0]?.version ?? null;
  }

  async update(input: UpdateExpenseRecordInput): Promise<ExpenseRecord | null> {
    const result = await this.pool.query<ExpenseRow>(
      `WITH updated AS (
         UPDATE expenses AS target
         SET category_id = $3,
             title = $4,
             amount = $5,
             expense_date = $6,
             note = $7,
             version = target.version + 1
         WHERE target.id = $1
           AND target.user_id = $2
           AND target.version = $8
           AND (
             $9 = FALSE
             OR EXISTS (
               SELECT 1
               FROM categories AS allowed_category
               WHERE allowed_category.id = $3
                 AND allowed_category.is_active = TRUE
             )
           )
         RETURNING id, category_id, title, amount, expense_date, note, version, created_at, updated_at
       )
       SELECT ${expenseColumns}
       FROM updated AS e
       JOIN categories AS c ON c.id = e.category_id`,
      [
        input.id,
        input.userId,
        input.categoryId,
        input.title,
        input.amount,
        input.expenseDate,
        input.note,
        input.expectedVersion,
        input.requireActiveCategory,
      ],
    );
    const row = result.rows[0];
    return row ? mapExpense(row) : null;
  }

  async delete(id: string, userId: string, expectedVersion: number): Promise<boolean> {
    const result = await this.pool.query<{ id: string }>(
      `DELETE FROM expenses
       WHERE id = $1
         AND user_id = $2
         AND version = $3
       RETURNING id`,
      [id, userId, expectedVersion],
    );
    return result.rowCount === 1;
  }

  async listOwned(input: ListExpensesRecordInput): Promise<ExpenseSummaryRecord[]> {
    const values: unknown[] = [input.userId];
    const where = ['e.user_id = $1'];
    const parameter = (value: unknown): string => {
      values.push(value);
      return `$${values.length}`;
    };

    if (input.q !== undefined) {
      const escapedSearch = input.q.replace(/[\\%_]/g, '\\$&');
      const search = parameter(`%${escapedSearch}%`);
      where.push(
        `(e.title ILIKE ${search} ESCAPE '\\' OR COALESCE(e.note, '') ILIKE ${search} ESCAPE '\\')`,
      );
    }
    if (input.categoryId !== undefined) {
      where.push(`e.category_id = ${parameter(input.categoryId)}`);
    }
    if (input.from !== undefined && input.to !== undefined) {
      where.push(`e.expense_date >= ${parameter(input.from)}::date`);
      where.push(`e.expense_date <= ${parameter(input.to)}::date`);
    }

    const sortDefinitions: Record<
      ExpenseSort,
      { column: 'e.expense_date' | 'e.amount'; direction: 'ASC' | 'DESC'; cast: 'date' | 'numeric' }
    > = {
      expenseDateDesc: { column: 'e.expense_date', direction: 'DESC', cast: 'date' },
      expenseDateAsc: { column: 'e.expense_date', direction: 'ASC', cast: 'date' },
      amountDesc: { column: 'e.amount', direction: 'DESC', cast: 'numeric' },
      amountAsc: { column: 'e.amount', direction: 'ASC', cast: 'numeric' },
    };
    const sort = sortDefinitions[input.sort];

    if (input.after !== undefined) {
      const comparison = sort.direction === 'DESC' ? '<' : '>';
      const sortValue = parameter(input.after.sortValue);
      const id = parameter(input.after.id);
      where.push(`(${sort.column}, e.id) ${comparison} (${sortValue}::${sort.cast}, ${id}::uuid)`);
    }

    const fetchLimit = parameter(input.limit + 1);
    const result = await this.pool.query<ExpenseSummaryRow>(
      `SELECT
         e.id,
         e.category_id,
         c.slug AS category_slug,
         c.display_name AS category_display_name,
         e.title,
         e.amount,
         e.expense_date,
         e.version,
         FALSE AS has_receipt,
         e.created_at,
         e.updated_at
       FROM expenses AS e
       JOIN categories AS c ON c.id = e.category_id
       WHERE ${where.join('\n         AND ')}
       ORDER BY ${sort.column} ${sort.direction}, e.id ${sort.direction}
       LIMIT ${fetchLimit}`,
      values,
    );
    return result.rows.map(mapExpenseSummary);
  }
}
