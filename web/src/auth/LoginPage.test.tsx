import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";

import { renderWithClient } from "../test/render";
import { AuthContext, type AuthContextValue } from "./auth-context";
import { LoginPage } from "./LoginPage";

function renderLogin(overrides: Partial<AuthContextValue> = {}) {
  const value: AuthContextValue = {
    user: null,
    isBootstrapping: false,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  renderWithClient(
    <AuthContext.Provider value={value}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    </AuthContext.Provider>,
    { route: "/login" },
  );
  return value;
}

describe("LoginPage", () => {
  it("validates input before asking the authentication boundary to log in", async () => {
    const user = userEvent.setup();
    const auth = renderLogin();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Enter a valid email address"),
    ).toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("submits normalized credentials to the authentication boundary", async () => {
    const user = userEvent.setup();
    const auth = renderLogin();
    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(auth.login).toHaveBeenCalledWith({
      email: "learner@example.com",
      password: "correct-password",
    });
  });
});
