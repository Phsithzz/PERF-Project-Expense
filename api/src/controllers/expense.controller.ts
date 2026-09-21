import type { RequestHandler } from 'express';

import { getExpenseVersion } from '../middleware/if-match.middleware.js';
import type { ExpenseService } from '../services/expense.service.js';
import type {
  CreateExpenseRequest,
  ExpenseIdParams,
  IdempotencyHeaders,
  ListExpensesQuery,
  UpdateExpenseRequest,
} from '../validation/expense.validation.js';
import { getValidatedRequest } from '../validation/request-validation.js';

function setVersionEtag(response: Parameters<RequestHandler>[1], version: number): void {
  response.setHeader('ETag', `"${version}"`);
}

export class ExpenseController {
  constructor(private readonly expenses: ExpenseService) {}

  readonly list: RequestHandler = async (request, response) => {
    const query = getValidatedRequest(response.locals).query as ListExpensesQuery;
    const result = await this.expenses.listOwned(request.auth!.userId, query);
    response.status(200).json(result);
  };

  readonly create: RequestHandler = async (request, response) => {
    const validated = getValidatedRequest(response.locals);
    const input = validated.body as CreateExpenseRequest;
    const headers = validated.headers as IdempotencyHeaders;
    const expense = await this.expenses.create(request.auth!.userId, {
      ...input,
      idempotencyKey: headers['idempotency-key'],
    });
    setVersionEtag(response, expense.version);
    response.location(`/api/v1/expenses/${expense.id}`).status(201).json({ data: expense });
  };

  readonly get: RequestHandler = async (request, response) => {
    const { expenseId } = getValidatedRequest(response.locals).params as ExpenseIdParams;
    const expense = await this.expenses.getOwned(request.auth!.userId, expenseId);
    setVersionEtag(response, expense.version);
    response.status(200).json({ data: expense });
  };

  readonly update: RequestHandler = async (request, response) => {
    const validated = getValidatedRequest(response.locals);
    const { expenseId } = validated.params as ExpenseIdParams;
    const input = validated.body as UpdateExpenseRequest;
    const expense = await this.expenses.update(
      request.auth!.userId,
      expenseId,
      getExpenseVersion(response.locals),
      input,
    );
    setVersionEtag(response, expense.version);
    response.status(200).json({ data: expense });
  };

  readonly delete: RequestHandler = async (request, response) => {
    const { expenseId } = getValidatedRequest(response.locals).params as ExpenseIdParams;
    await this.expenses.delete(request.auth!.userId, expenseId, getExpenseVersion(response.locals));
    response.status(204).send();
  };
}
