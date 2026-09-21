import { useState, type FormEvent } from "react";

import type { Category, ExpenseListParams, ExpenseSort } from "../../api/types";

export interface ExpenseFilterValues {
  q: string;
  categoryId: string;
  from: string;
  to: string;
  sort: ExpenseSort;
  limit: number;
}

interface ExpenseFiltersProps {
  value: ExpenseFilterValues;
  categories: Category[];
  onApply: (filters: ExpenseFilterValues) => void;
}

// Kept beside the filter model in Phase 10; it is independently unit-tested.
// eslint-disable-next-line react-refresh/only-export-components
export function toExpenseListParams(
  filters: ExpenseFilterValues,
  cursor?: string,
): ExpenseListParams {
  return {
    q: filters.q.trim() || undefined,
    categoryId: filters.categoryId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: filters.sort,
    limit: filters.limit,
    cursor,
  };
}

export function ExpenseFilters(props: ExpenseFiltersProps) {
  return <ExpenseFilterDraft key={JSON.stringify(props.value)} {...props} />;
}

function ExpenseFilterDraft({
  value,
  categories,
  onApply,
}: ExpenseFiltersProps) {
  const [draft, setDraft] = useState(value);
  const [dateError, setDateError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Boolean(draft.from) !== Boolean(draft.to)) {
      setDateError("Choose both start and end dates.");
      return;
    }
    if (draft.from && draft.to && draft.from > draft.to) {
      setDateError("Start date must not be after end date.");
      return;
    }
    setDateError("");
    onApply(draft);
  }

  function clear() {
    const empty: ExpenseFilterValues = {
      q: "",
      categoryId: "",
      from: "",
      to: "",
      sort: "expenseDateDesc",
      limit: 20,
    };
    setDraft(empty);
    setDateError("");
    onApply(empty);
  }

  return (
    <form className="filters" onSubmit={submit} aria-label="Expense filters">
      <label className="filter-search">
        Search
        <input
          type="search"
          maxLength={100}
          placeholder="Title or note"
          value={draft.q}
          onChange={(event) => setDraft({ ...draft, q: event.target.value })}
        />
      </label>
      <label>
        Category
        <select
          value={draft.categoryId}
          onChange={(event) =>
            setDraft({ ...draft, categoryId: event.target.value })
          }
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        From
        <input
          type="date"
          value={draft.from}
          onChange={(event) => setDraft({ ...draft, from: event.target.value })}
        />
      </label>
      <label>
        To
        <input
          type="date"
          value={draft.to}
          onChange={(event) => setDraft({ ...draft, to: event.target.value })}
        />
      </label>
      <label>
        Sort
        <select
          value={draft.sort}
          onChange={(event) =>
            setDraft({ ...draft, sort: event.target.value as ExpenseSort })
          }
        >
          <option value="expenseDateDesc">Newest first</option>
          <option value="expenseDateAsc">Oldest first</option>
          <option value="amountDesc">Highest amount</option>
          <option value="amountAsc">Lowest amount</option>
        </select>
      </label>
      <label>
        Per page
        <select
          value={draft.limit}
          onChange={(event) =>
            setDraft({ ...draft, limit: Number(event.target.value) })
          }
        >
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </label>
      {dateError ? (
        <p className="filter-error" role="alert">
          {dateError}
        </p>
      ) : null}
      <div className="filter-actions">
        <button className="button" type="submit">
          Apply filters
        </button>
        <button className="button button--ghost" type="button" onClick={clear}>
          Clear
        </button>
      </div>
    </form>
  );
}
