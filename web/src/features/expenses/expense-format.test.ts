import { formatExpenseDate, formatMoney } from "./expense-format";

describe("expense formatting", () => {
  it("formats canonical money as Thai baht", () => {
    expect(formatMoney("1234.50")).toContain("1,234.50");
  });

  it("formats a date without shifting it across time zones", () => {
    expect(formatExpenseDate("2026-08-09")).toBe("09 Aug 2026");
  });
});
