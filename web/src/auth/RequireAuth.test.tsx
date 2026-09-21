import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";

import type { User } from "../api/types";
import { renderWithClient } from "../test/render";
import { AuthContext, type AuthContextValue } from "./auth-context";
import { RequireAuth } from "./RequireAuth";

const user: User = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Learner",
  email: "learner@example.com",
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

function renderGuard(value: Partial<AuthContextValue>) {
  renderWithClient(
    <AuthContext.Provider
      value={{
        user: null,
        isBootstrapping: false,
        login: vi.fn(),
        logout: vi.fn(),
        ...value,
      }}
    >
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/expenses" element={<h1>Private expenses</h1>} />
        </Route>
        <Route path="/login" element={<h1>Login destination</h1>} />
      </Routes>
    </AuthContext.Provider>,
    { route: "/expenses" },
  );
}

describe("RequireAuth", () => {
  it("waits for refresh-cookie bootstrap before deciding where to route", () => {
    renderGuard({ isBootstrapping: true });
    expect(screen.getByText("Checking your session…")).toBeInTheDocument();
    expect(screen.queryByText("Login destination")).not.toBeInTheDocument();
  });

  it("redirects an unauthenticated visitor", () => {
    renderGuard({ user: null });
    expect(
      screen.getByRole("heading", { name: "Login destination" }),
    ).toBeInTheDocument();
  });

  it("renders the protected route for an authenticated user", () => {
    renderGuard({ user });
    expect(
      screen.getByRole("heading", { name: "Private expenses" }),
    ).toBeInTheDocument();
  });
});
