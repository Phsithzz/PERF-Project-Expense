import { z } from 'zod';

const uuidSchema = z.string().uuid();
const normalizedTitleSchema = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => value === value.trim(), 'Title must not have surrounding whitespace');
const normalizedNoteSchema = z
  .string()
  .min(1)
  .max(2_000)
  .refine((value) => value === value.trim(), 'Note must not have surrounding whitespace');

const moneyPattern = /^(?:0|[1-9][0-9]{0,8})\.[0-9]{2}$/;
const positiveMoneySchema = z
  .string()
  .regex(moneyPattern, 'Amount must be a decimal string with exactly two digits after the point')
  .refine((value) => value !== '0.00', 'Amount must be between 0.01 and 999999999.99');

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const expenseDateSchema = z
  .string()
  .refine(isCalendarDate, 'Expense date must be a valid ISO date');

export const expenseIdParamsSchema = z
  .object({
    expenseId: uuidSchema,
  })
  .strict();

export const createExpenseRequestSchema = z
  .object({
    categoryId: uuidSchema,
    title: normalizedTitleSchema,
    amount: positiveMoneySchema,
    expenseDate: expenseDateSchema,
    note: normalizedNoteSchema.optional(),
  })
  .strict();

export const updateExpenseRequestSchema = z
  .object({
    categoryId: uuidSchema.optional(),
    title: normalizedTitleSchema.optional(),
    amount: positiveMoneySchema.optional(),
    expenseDate: expenseDateSchema.optional(),
    note: normalizedNoteSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be supplied');

export const idempotencyHeadersSchema = z
  .object({
    'idempotency-key': z
      .string()
      .min(16)
      .max(128)
      .regex(/^[A-Za-z0-9._~-]+$/),
  })
  .passthrough();

const expenseSortSchema = z.enum(['expenseDateDesc', 'expenseDateAsc', 'amountDesc', 'amountAsc']);

const limitQuerySchema = z
  .string()
  .regex(/^(?:[1-9]|[1-9][0-9]|100)$/, 'Limit must be an integer between 1 and 100')
  .transform(Number)
  .default(20);

export const listExpensesQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(100).optional(),
    categoryId: uuidSchema.optional(),
    from: expenseDateSchema.optional(),
    to: expenseDateSchema.optional(),
    sort: expenseSortSchema.default('expenseDateDesc'),
    limit: limitQuerySchema,
    cursor: z.string().min(1).max(2_048).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.from) !== Boolean(value.to)) {
      context.addIssue({
        code: 'custom',
        path: [value.from ? 'to' : 'from'],
        message: 'from and to must be supplied together',
      });
      return;
    }
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'to must be on or after from',
      });
    }
  });

export type ExpenseIdParams = z.infer<typeof expenseIdParamsSchema>;
export type CreateExpenseRequest = z.infer<typeof createExpenseRequestSchema>;
export type UpdateExpenseRequest = z.infer<typeof updateExpenseRequestSchema>;
export type IdempotencyHeaders = z.infer<typeof idempotencyHeadersSchema>;
export type ExpenseSort = z.infer<typeof expenseSortSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
