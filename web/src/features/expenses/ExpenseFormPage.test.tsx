import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";

import * as expenseApi from "../../api/expense-api";
import type { Expense } from "../../api/types";
import { renderWithClient } from "../../test/render";
import { ExpenseFormPage } from "./ExpenseFormPage";

vi.mock("../../api/expense-api");

const mockedExpenseApi = vi.mocked(expenseApi);
const category = {
  id: "10000000-0000-4000-8000-000000000001",
  slug: "food",
  displayName: "Food",
};
const createdExpense: Expense = {
  id: "20000000-0000-4000-8000-000000000001",
  category,
  title: "Lunch",
  amount: "89.00",
  expenseDate: "2026-08-09",
  note: null,
  version: 1,
  receipt: null,
  createdAt: "2026-08-09T12:00:00.000Z",
  updatedAt: "2026-08-09T12:00:00.000Z",
};

describe("ExpenseFormPage", () => {
  beforeEach(() => {
    mockedExpenseApi.listCategories.mockResolvedValue([category]);
    mockedExpenseApi.createExpense.mockResolvedValue(createdExpense);
  });

  function renderCreateForm() {
    return renderWithClient(
      <Routes>
        <Route path="/expenses/new" element={<ExpenseFormPage />} />
        <Route path="/expenses/:expenseId" element={<h1>Saved expense</h1>} />
      </Routes>,
      { route: "/expenses/new" },
    );
  }

  it("rejects a non-canonical money value before calling the API", async () => {
    const user = userEvent.setup();
    renderCreateForm();
    await user.type(screen.getByLabelText("Title"), "Lunch");
    await user.type(screen.getByLabelText("Amount (THB)"), "89");
    await user.selectOptions(
      await screen.findByLabelText("Category"),
      category.id,
    );

    await user.click(screen.getByRole("button", { name: "Create expense" }));

    expect(
      await screen.findByText(/positive amount with two decimals/i),
    ).toBeInTheDocument();
    expect(mockedExpenseApi.createExpense).not.toHaveBeenCalled();
  });

  it("creates a validated expense and navigates to its detail route", async () => {
    const user = userEvent.setup();
    renderCreateForm();
    await user.type(screen.getByLabelText("Title"), "Lunch");
    await user.type(screen.getByLabelText("Amount (THB)"), "89.00");
    await user.selectOptions(
      await screen.findByLabelText("Category"),
      category.id,
    );

    await user.click(screen.getByRole("button", { name: "Create expense" }));

    await waitFor(() =>
      expect(mockedExpenseApi.createExpense).toHaveBeenCalledOnce(),
    );
    expect(
      await screen.findByRole("heading", { name: "Saved expense" }),
    ).toBeInTheDocument();
  });
});
