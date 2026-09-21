import { Navigate, Route, Routes } from "react-router-dom";

import { LoginPage } from "../auth/LoginPage";
import { RegisterPage } from "../auth/RegisterPage";
import { RequireAuth } from "../auth/RequireAuth";
import { AppShell } from "../components/AppShell";
import { ExpenseDetailPage } from "../features/expenses/ExpenseDetailPage";
import { ExpenseFormPage } from "../features/expenses/ExpenseFormPage";
import { ExpenseListPage } from "../features/expenses/ExpenseListPage";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/expenses" element={<ExpenseListPage />} />
          <Route path="/expenses/new" element={<ExpenseFormPage />} />
          <Route path="/expenses/:expenseId" element={<ExpenseDetailPage />} />
          <Route
            path="/expenses/:expenseId/edit"
            element={<ExpenseFormPage />}
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/expenses" replace />} />
    </Routes>
  );
}
