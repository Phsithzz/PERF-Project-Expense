import { apiClient } from "./client";
import { toApiError } from "./errors";
import type {
  Category,
  CreateExpenseInput,
  Expense,
  ExpenseListParams,
  ExpenseListResult,
  UpdateExpenseInput,
} from "./types";

interface DataResponse<T> {
  data: T;
}

export async function listCategories(): Promise<Category[]> {
  try {
    const response =
      await apiClient.get<DataResponse<Category[]>>("/categories");
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function listExpenses(
  params: ExpenseListParams,
): Promise<ExpenseListResult> {
  try {
    const response = await apiClient.get<ExpenseListResult>("/expenses", {
      params,
    });
    return response.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function getExpense(expenseId: string): Promise<Expense> {
  try {
    const response = await apiClient.get<DataResponse<Expense>>(
      `/expenses/${expenseId}`,
    );
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function createExpense(
  input: CreateExpenseInput,
): Promise<Expense> {
  try {
    const response = await apiClient.post<DataResponse<Expense>>(
      "/expenses",
      input,
    );
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function updateExpense(
  expenseId: string,
  version: number,
  input: UpdateExpenseInput,
): Promise<Expense> {
  try {
    const response = await apiClient.patch<DataResponse<Expense>>(
      `/expenses/${expenseId}`,
      input,
      {
        headers: { "If-Match": `"${version}"` },
      },
    );
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

export async function deleteExpense(
  expenseId: string,
  version: number,
): Promise<void> {
  try {
    await apiClient.delete(`/expenses/${expenseId}`, {
      headers: { "If-Match": `"${version}"` },
    });
  } catch (error) {
    throw toApiError(error);
  }
}
