import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import * as expenseApi from "../../api/expense-api";
import { toApiError } from "../../api/errors";
import { queryKeys } from "../../api/query-keys";
import { ErrorState, LoadingState } from "../../components/AsyncState";
import { formatExpenseDate, formatMoney } from "./expense-format";

export function ExpenseDetailPage() {
  const { expenseId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const expenseQuery = useQuery({
    queryKey: queryKeys.expenses.detail(expenseId),
    queryFn: () => expenseApi.getExpense(expenseId),
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      expenseApi.deleteExpense(expenseId, expenseQuery.data!.version),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: queryKeys.expenses.detail(expenseId),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      navigate("/expenses", { replace: true });
    },
  });

  if (expenseQuery.isPending)
    return <LoadingState label="Loading expense details…" />;
  if (expenseQuery.error) {
    return (
      <ErrorState
        title="Could not load this expense"
        message={toApiError(expenseQuery.error).message}
        onAction={() => void expenseQuery.refetch()}
      />
    );
  }

  const expense = expenseQuery.data;
  const deleteError = deleteMutation.error
    ? toApiError(deleteMutation.error)
    : null;

  return (
    <section aria-labelledby="expense-title">
      <Link className="back-link" to="/expenses">
        ← Back to expenses
      </Link>
      <article className="detail-card">
        <div className="detail-heading">
          <div>
            <p className="expense-category">{expense.category.displayName}</p>
            <h1 id="expense-title">{expense.title}</h1>
            <p>{formatExpenseDate(expense.expenseDate)}</p>
          </div>
          <p className="detail-amount">{formatMoney(expense.amount)}</p>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Note</dt>
            <dd>{expense.note ?? "No note"}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{expense.version}</dd>
          </div>
          <div>
            <dt>Receipt</dt>
            <dd>{expense.receipt ? expense.receipt.fileName : "No receipt"}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{new Date(expense.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>

        {deleteError ? (
          <div className="form-alert" role="alert">
            {deleteError.status === 412
              ? "This expense changed elsewhere. Reload it before deleting."
              : deleteError.message}
          </div>
        ) : null}

        {confirmingDelete ? (
          <div
            className="delete-confirmation"
            role="alertdialog"
            aria-labelledby="delete-title"
          >
            <div>
              <h2 id="delete-title">Permanently delete this expense?</h2>
              <p>This action cannot be undone.</p>
            </div>
            <div className="form-actions">
              <button
                className="button button--danger"
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="form-actions">
            <Link className="button" to={`/expenses/${expense.id}/edit`}>
              Edit expense
            </Link>
            <button
              className="button button--danger-outline"
              type="button"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete
            </button>
          </div>
        )}
      </article>
    </section>
  );
}
