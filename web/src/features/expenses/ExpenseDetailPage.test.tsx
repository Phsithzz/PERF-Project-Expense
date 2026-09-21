import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";

import * as expenseApi from "../../api/expense-api";
import type { Expense } from "../../api/types";
import { renderWithClient } from "../../test/render";
import { ExpenseDetailPage } from "./ExpenseDetailPage";

vi.mock("../../api/expense-api");

const mockedExpenseApi = vi.mocked(expenseApi);
const expense: Expense = {
  id: "20000000-0000-4000-8000-000000000001",
  category: {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "food",
    displayName: "Food",
  },
  title: "Team lunch",
  amount: "450.00",
  expenseDate: "2026-08-09",
  note: "Project retrospective",
  version: 7,
  receipt: null,
  createdAt: "2026-08-09T12:00:00.000Z",
  updatedAt: "2026-08-09T12:00:00.000Z",
};

describe("ExpenseDetailPage", () => {
  it("requires explicit confirmation and deletes with the current version", async () => {
    const user = userEvent.setup();
    mockedExpenseApi.getExpense.mockResolvedValue(expense);
    mockedExpenseApi.deleteExpense.mockResolvedValue(undefined);
    renderWithClient(
      <Routes>
        <Route path="/expenses/:expenseId" element={<ExpenseDetailPage />} />
        <Route path="/expenses" element={<h1>Expense list</h1>} />
      </Routes>,
      { route: `/expenses/${expense.id}` },
    );

    expect(
      await screen.findByRole("heading", { name: "Team lunch" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "cannot be undone",
    );

    await user.click(screen.getByRole("button", { name: "Yes, delete" }));

    expect(mockedExpenseApi.deleteExpense).toHaveBeenCalledWith(expense.id, 7);
    expect(
      await screen.findByRole("heading", { name: "Expense list" }),
    ).toBeInTheDocument();
  });
});
