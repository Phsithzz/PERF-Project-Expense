import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";

import { toApiError } from "../api/errors";
import { useAuth } from "./auth-context";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(254),
  password: z.string().min(1, "Enter your password").max(128),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login, user, isBootstrapping } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (!isBootstrapping && user) {
      const destination = (
        location.state as { from?: { pathname?: string } } | null
      )?.from?.pathname;
      navigate(destination ?? "/expenses", { replace: true });
    }
  }, [isBootstrapping, location.state, navigate, user]);

  async function onSubmit(values: LoginValues) {
    setSubmitError("");
    try {
      await login(values);
    } catch (error) {
      setSubmitError(toApiError(error).message);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-heading">
          <span className="brand-mark brand-mark--large" aria-hidden="true">
            ฿
          </span>
          <p className="eyebrow">Personal finance, clearly tracked</p>
          <h1 id="login-title">Welcome back</h1>
          <p>Sign in to review and manage only your own expenses.</p>
        </div>

        <form
          onSubmit={(event) => void handleSubmit(onSubmit)(event)}
          noValidate
        >
          {submitError ? (
            <div className="form-alert" role="alert">
              {submitError}
            </div>
          ) : null}
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              {...register("email")}
            />
            {errors.email ? (
              <span className="field-error">{errors.email.message}</span>
            ) : null}
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            {errors.password ? (
              <span className="field-error">{errors.password.message}</span>
            ) : null}
          </label>
          <button
            className="button button--full"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
