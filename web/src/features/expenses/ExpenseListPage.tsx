import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import * as expenseApi from "../../api/expense-api";
import { toApiError } from "../../api/errors";
import { queryKeys } from "../../api/query-keys";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../components/AsyncState";
import {
  ExpenseFilters,
  toExpenseListParams,
  type ExpenseFilterValues,
} from "./ExpenseFilters";
import { formatExpenseDate, formatMoney } from "./expense-format";

const initialFilters: ExpenseFilterValues = {
  q: "",
  categoryId: "",
  from: "",
  to: "",
  sort: "expenseDateDesc",
  limit: 20,
};

export function ExpenseListPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(initialFilters);
  const [cursorHistory, setCursorHistory] = useState<Array<string | undefined>>(
    [undefined],
  );
  const [pageIndex, setPageIndex] = useState(0);
  const params = useMemo(
    () => toExpenseListParams(filters, cursorHistory[pageIndex]),
    [cursorHistory, filters, pageIndex],
  );

  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: expenseApi.listCategories,
    staleTime: 5 * 60_000,
  });
  const expensesQuery = useQuery({
    queryKey: queryKeys.expenses.list(params),
    queryFn: () => expenseApi.listExpenses(params),
    placeholderData: keepPreviousData,
  });

  function applyFilters(next: ExpenseFilterValues) {
    setFilters(next);
    setCursorHistory([undefined]);
    setPageIndex(0);
  }

  function nextPage() {
    const nextCursor = expensesQuery.data?.meta.nextCursor;
    if (!nextCursor) return;
    setCursorHistory((current) => [
      ...current.slice(0, pageIndex + 1),
      nextCursor,
    ]);
    setPageIndex((current) => current + 1);
  }

  const hasFilters = Boolean(
    filters.q || filters.categoryId || filters.from || filters.to,
  );
  const listError = expensesQuery.error
    ? toApiError(expensesQuery.error)
    : null;
  const expenses = expensesQuery.data?.data ?? [];
  const isEmptyFirstPage =
    expensesQuery.data && expenses.length === 0 && pageIndex === 0;
  const isEmptyLaterPage =
    expensesQuery.data && expenses.length === 0 && pageIndex > 0;

  return (
    <section aria-labelledby="expenses-heading">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your personal ledger</p>
          <h1 id="expenses-heading">Expenses</h1>
          <p>
            Search and review records returned by your authenticated account.
          </p>
        </div>
        <Link className="button" to="/expenses/new">
          Add expense
        </Link>
      </div>

      <ExpenseFilters
        value={filters}
        categories={categoriesQuery.data ?? []}
        onApply={applyFilters}
      />

      {expensesQuery.isFetching && !expensesQuery.isPending ? (
        <p className="refresh-status" role="status">
          Refreshing results…
        </p>
      ) : null}

      {expensesQuery.isPending ? (
        <LoadingState label="Loading your expenses…" />
      ) : null}
      {listError ? (
        <ErrorState
          title="Could not load expenses"
          message={listError.message}
          onAction={() => void expensesQuery.refetch()}
        />
      ) : null}
      {isEmptyFirstPage ? (
        <EmptyState
          title={hasFilters ? "No matching expenses" : "No expenses yet"}
          message={
            hasFilters
              ? "Try changing or clearing your filters."
              : "Create your first expense to start tracking."
          }
          actionLabel={hasFilters ? "Clear filters" : "Add expense"}
          onAction={
            hasFilters
              ? () => applyFilters(initialFilters)
              : () => navigate("/expenses/new")
          }
        />
      ) : null}
      {isEmptyLaterPage ? (
        <EmptyState
          title="No more expenses"
          message="Records may have changed since the previous page was loaded. Go back to continue."
        />
      ) : null}

      {expenses.length > 0 ? (
        <div className="expense-list" aria-label="Expense results">
          {expenses.map((expense) => (
            <article className="expense-card" key={expense.id}>
              <div>
                <p className="expense-category">
                  {expense.category.displayName}
                </p>
                <h2>
                  <Link to={`/expenses/${expense.id}`}>{expense.title}</Link>
                </h2>
                <p>{formatExpenseDate(expense.expenseDate)}</p>
              </div>
              <p className="expense-amount">{formatMoney(expense.amount)}</p>
            </article>
          ))}
        </div>
      ) : null}

      {expenses.length > 0 || pageIndex > 0 ? (
        <nav className="pagination" aria-label="Expense pages">
          <button
            className="button button--secondary"
            type="button"
            disabled={pageIndex === 0 || expensesQuery.isFetching}
            onClick={() => setPageIndex((current) => current - 1)}
          >
            Previous
          </button>
          <span>Page {pageIndex + 1}</span>
          <button
            className="button button--secondary"
            type="button"
            disabled={
              !expensesQuery.data?.meta.hasMore || expensesQuery.isFetching
            }
            onClick={nextPage}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}
