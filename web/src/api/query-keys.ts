import type { ExpenseListParams } from "./types";

export const queryKeys = {
  currentUser: ["auth", "current-user"] as const,
  categories: ["categories"] as const,
  expenses: {
    all: ["expenses"] as const,
    list: (params: ExpenseListParams) => ["expenses", "list", params] as const,
    detail: (expenseId: string) => ["expenses", "detail", expenseId] as const,
  },
};
