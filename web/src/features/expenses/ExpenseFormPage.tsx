import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import * as expenseApi from "../../api/expense-api";
import { toApiError } from "../../api/errors";
import { queryKeys } from "../../api/query-keys";
import { ErrorState, LoadingState } from "../../components/AsyncState";

const moneyPattern = /^(?:0\.(?:0[1-9]|[1-9][0-9])|[1-9][0-9]{0,8}\.[0-9]{2})$/;

const expenseSchema = z.object({
  title: z
    .string()
    .min(1, "Enter a title")
    .max(200)
    .refine((value) => value.trim().length > 0, "Enter a title"),
  amount: z
    .string()
    .regex(
      moneyPattern,
      "Use a positive amount with two decimals, for example 89.00",
    ),
  categoryId: z.string().uuid("Choose a category"),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an expense date"),
  note: z.string().max(2000, "Note must not exceed 2,000 characters"),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseFormPage() {
  const { expenseId } = useParams();
  const isEditing = Boolean(expenseId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState("");
  const categoriesQuery = useQuery({
    queryKey: queryKeys.categories,
    queryFn: expenseApi.listCategories,
    staleTime: 5 * 60_000,
  });
  const expenseQuery = useQuery({
    queryKey: queryKeys.expenses.detail(expenseId ?? ""),
    queryFn: () => expenseApi.getExpense(expenseId!),
    enabled: isEditing,
  });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      title: "",
      amount: "",
      categoryId: "",
      expenseDate: today(),
      note: "",
    },
  });

  useEffect(() => {
    if (!expenseQuery.data) return;
    reset({
      title: expenseQuery.data.title,
      amount: expenseQuery.data.amount,
      categoryId: expenseQuery.data.category.id,
      expenseDate: expenseQuery.data.expenseDate,
      note: expenseQuery.data.note ?? "",
    });
  }, [expenseQuery.data, reset]);

  const mutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      const normalizedNote = values.note.trim();
      const common = {
        categoryId: values.categoryId,
        title: values.title.trim(),
        amount: values.amount,
        expenseDate: values.expenseDate,
      };

      if (expenseId && expenseQuery.data) {
        return expenseApi.updateExpense(expenseId, expenseQuery.data.version, {
          ...common,
          note: normalizedNote || null,
        });
      }

      return expenseApi.createExpense({
        ...common,
        ...(normalizedNote ? { note: normalizedNote } : {}),
      });
    },
    onSuccess: async (expense) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.setQueryData(queryKeys.expenses.detail(expense.id), expense);
      navigate(`/expenses/${expense.id}`, { replace: true });
    },
  });

  async function onSubmit(values: ExpenseFormValues) {
    setSubmitError("");
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      const apiError = toApiError(error);
      const formFields = new Set([
        "title",
        "amount",
        "categoryId",
        "expenseDate",
        "note",
      ]);
      apiError.details.forEach((detail) => {
        if (formFields.has(detail.field)) {
          setError(detail.field as keyof ExpenseFormValues, {
            message: detail.message,
          });
        }
      });
      setSubmitError(
        apiError.status === 412
          ? "This expense changed elsewhere. Return to the detail page and reload before editing again."
          : apiError.message,
      );
    }
  }

  if (isEditing && expenseQuery.isPending) {
    return <LoadingState label="Loading expense details…" />;
  }
  if (isEditing && expenseQuery.error) {
    return (
      <ErrorState
        title="Could not load this expense"
        message={toApiError(expenseQuery.error).message}
        onAction={() => void expenseQuery.refetch()}
      />
    );
  }

  return (
    <section className="form-page" aria-labelledby="expense-form-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {isEditing ? "Keep the record accurate" : "Record one transaction"}
          </p>
          <h1 id="expense-form-title">
            {isEditing ? "Edit expense" : "Add expense"}
          </h1>
          <p>Amounts are stored and returned as exact two-decimal strings.</p>
        </div>
      </div>
      <form
        className="expense-form"
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        noValidate
      >
        {submitError ? (
          <div className="form-alert" role="alert">
            {submitError}
          </div>
        ) : null}
        <label>
          Title
          <input
            maxLength={200}
            aria-invalid={Boolean(errors.title)}
            {...register("title")}
          />
          {errors.title ? (
            <span className="field-error">{errors.title.message}</span>
          ) : null}
        </label>
        <div className="form-row">
          <label>
            Amount (THB)
            <input
              inputMode="decimal"
              placeholder="89.00"
              aria-invalid={Boolean(errors.amount)}
              {...register("amount")}
            />
            {errors.amount ? (
              <span className="field-error">{errors.amount.message}</span>
            ) : null}
          </label>
          <label>
            Date
            <input
              type="date"
              aria-invalid={Boolean(errors.expenseDate)}
              {...register("expenseDate")}
            />
            {errors.expenseDate ? (
              <span className="field-error">{errors.expenseDate.message}</span>
            ) : null}
          </label>
        </div>
        <label>
          Category
          <select
            aria-invalid={Boolean(errors.categoryId)}
            {...register("categoryId")}
          >
            <option value="">Choose a category</option>
            {(categoriesQuery.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.displayName}
              </option>
            ))}
          </select>
          {categoriesQuery.isPending ? (
            <span className="field-hint">Loading categories…</span>
          ) : null}
          {categoriesQuery.error ? (
            <span className="field-error">Could not load categories.</span>
          ) : null}
          {errors.categoryId ? (
            <span className="field-error">{errors.categoryId.message}</span>
          ) : null}
        </label>
        <label>
          Note <span className="optional">Optional</span>
          <textarea
            rows={5}
            maxLength={2000}
            aria-invalid={Boolean(errors.note)}
            {...register("note")}
          />
          {errors.note ? (
            <span className="field-error">{errors.note.message}</span>
          ) : null}
        </label>
        <div className="form-actions">
          <button
            className="button"
            type="submit"
            disabled={mutation.isPending || categoriesQuery.isPending}
          >
            {mutation.isPending
              ? "Saving…"
              : isEditing
                ? "Save changes"
                : "Create expense"}
          </button>
          <Link
            className="button button--ghost"
            to={expenseId ? `/expenses/${expenseId}` : "/expenses"}
          >
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
