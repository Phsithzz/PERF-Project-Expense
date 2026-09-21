export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface Category {
  id: string;
  slug: string;
  displayName: string;
}

export interface ExpenseSummary {
  id: string;
  category: Category;
  title: string;
  amount: string;
  expenseDate: string;
  version: number;
  hasReceipt: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Expense extends Omit<ExpenseSummary, "hasReceipt"> {
  note: string | null;
  receipt: ReceiptMetadata | null;
}

export interface ReceiptMetadata {
  fileName: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  checksumSha256: string;
  contentUrl: string;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseSort =
  "expenseDateDesc" | "expenseDateAsc" | "amountDesc" | "amountAsc";

export interface ExpenseListParams {
  q?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  sort: ExpenseSort;
  limit: number;
  cursor?: string;
}

export interface ExpenseListResult {
  data: ExpenseSummary[];
  meta: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
}

export interface CreateExpenseInput {
  categoryId: string;
  title: string;
  amount: string;
  expenseDate: string;
  note?: string;
}

export interface UpdateExpenseInput extends Omit<CreateExpenseInput, "note"> {
  note?: string | null;
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: ApiFieldError[];
    requestId?: string;
  };
}
