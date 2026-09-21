import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";

import { toApiError } from "../api/errors";
import { useAuth } from "../auth/auth-context";

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    setIsLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(toApiError(error).message);
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink
          className="brand"
          to="/expenses"
          aria-label="Expense Tracker home"
        >
          <span className="brand-mark" aria-hidden="true">
            ฿
          </span>
          <span>Expense Tracker</span>
        </NavLink>
        <nav aria-label="Primary navigation">
          <NavLink to="/expenses">Expenses</NavLink>
        </nav>
        <div className="account-menu">
          <span className="account-name">{user?.name}</span>
          <button
            className="button button--ghost"
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>
      {logoutError ? <p className="global-error">{logoutError}</p> : null}
      <main className="page-container">
        <Outlet />
      </main>
    </div>
  );
}
