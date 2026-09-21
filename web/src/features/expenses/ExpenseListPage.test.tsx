import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";

import * as expenseApi from "../../api/expense-api";
import { ApiError } from "../../api/errors";
import type { ExpenseListResult } from "../../api/types";
import { renderWithClient } from "../../test/render";
import { ExpenseListPage } from "./ExpenseListPage";

vi.mock("../../api/expense-api");

const mockedExpenseApi = vi.mocked(expenseApi);
const category = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "food",
  displayName: "Food",
};

function page(overrides: Partial<ExpenseListResult> = {}): ExpenseListResult {
  return {
    data: [],
    meta: { limit: 20, hasMore: false, nextCursor: null },
    ...overrides,
  };
}

describe("ExpenseListPage", () => {
  beforeEach(() => {
    mockedExpenseApi.listCategories.mockResolvedValue([category]);
  });

  it("shows the initial loading state", () => {
    mockedExpenseApi.listExpenses.mockReturnValue(new Promise(() => undefined));
    renderWithClient(<ExpenseListPage />);

    expect(screen.getByText("Loading your expenses…")).toBeInTheDocument();
  });

  it("distinguishes an empty account from a failed request", async () => {
    mockedExpenseApi.listExpenses.mockResolvedValue(page());
    renderWithClient(<ExpenseListPage />);

    expect(
      await screen.findByRole("heading", { name: "No expenses yet" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add expense" }),
    ).toBeInTheDocument();
  });

  it("shows a retryable API error state", async () => {
    mockedExpenseApi.listExpenses.mockRejectedValue(
      new ApiError("API unavailable", "INTERNAL", 500),
    );
    renderWithClient(<ExpenseListPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "API unavailable",
    );
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("renders results and sends the server-issued cursor unchanged", async () => {
    const user = userEvent.setup();
    mockedExpenseApi.listExpenses.mockImplementation(async (params) =>
      params.cursor
        ? page()
        : page({
            data: [
              {
                id: "20000000-0000-4000-8000-000000000001",
                category,
                title: "Team lunch",
                amount: "450.00",
                expenseDate: "2026-08-09",
                version: 1,
                hasReceipt: false,
                createdAt: "2026-08-09T12:00:00.000Z",
                updatedAt: "2026-08-09T12:00:00.000Z",
              },
            ],
            meta: {
              limit: 20,
              hasMore: true,
              nextCursor: "opaque-server-value",
            },
          }),
    );
    renderWithClient(
      <Routes>
        <Route path="/" element={<ExpenseListPage />} />
        <Route path="/expenses/:expenseId" element={<p>Detail</p>} />
      </Routes>,
    );

    expect(
      await screen.findByRole("link", { name: "Team lunch" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(mockedExpenseApi.listExpenses).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: "opaque-server-value" }),
      ),
    );
    expect(await screen.findByText("Page 2")).toBeInTheDocument();
  });
});
