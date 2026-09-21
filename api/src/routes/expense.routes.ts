import { Router, type RequestHandler } from 'express';

import type { ExpenseController } from '../controllers/expense.controller.js';
import { requireExpenseVersion } from '../middleware/if-match.middleware.js';
import {
  createExpenseRequestSchema,
  expenseIdParamsSchema,
  idempotencyHeadersSchema,
  listExpensesQuerySchema,
  updateExpenseRequestSchema,
} from '../validation/expense.validation.js';
import { validateRequest } from '../validation/request-validation.js';

export function createExpenseRouter(
  controller: ExpenseController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  router.get(
    '/',
    authenticate,
    validateRequest({ query: listExpensesQuerySchema }),
    controller.list,
  );

  router.post(
    '/',
    authenticate,
    validateRequest({ body: createExpenseRequestSchema, headers: idempotencyHeadersSchema }),
    controller.create,
  );
  router.get(
    '/:expenseId',
    authenticate,
    validateRequest({ params: expenseIdParamsSchema }),
    controller.get,
  );
  router.patch(
    '/:expenseId',
    authenticate,
    validateRequest({ params: expenseIdParamsSchema, body: updateExpenseRequestSchema }),
    requireExpenseVersion,
    controller.update,
  );
  router.delete(
    '/:expenseId',
    authenticate,
    validateRequest({ params: expenseIdParamsSchema }),
    requireExpenseVersion,
    controller.delete,
  );

  return router;
}
