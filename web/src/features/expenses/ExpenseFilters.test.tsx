import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithClient } from "../../test/render";
import {
  ExpenseFilters,
  toExpenseListParams,
  type ExpenseFilterValues,
} from "./ExpenseFilters";

const value: ExpenseFilterValues = {
  q: "",
  categoryId: "",
  from: "",
  to: "",
  sort: "expenseDateDesc",
  limit: 20,
};

describe("ExpenseFilters", () => {
  it("normalizes empty optional values out of API params", () => {
    expect(
      toExpenseListParams({ ...value, q: "  lunch  " }, "opaque-cursor"),
    ).toEqual({
      q: "lunch",
      categoryId: undefined,
      from: undefined,
      to: undefined,
      sort: "expenseDateDesc",
      limit: 20,
      cursor: "opaque-cursor",
    });
  });

  it("requires both inclusive date boundaries before applying", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderWithClient(
      <ExpenseFilters value={value} categories={[]} onApply={onApply} />,
    );

    await user.type(screen.getByLabelText("From"), "2026-08-01");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Choose both start and end dates.",
    );
    expect(onApply).not.toHaveBeenCalled();
  });
});
