import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import * as authApi from "../api/auth-api";
import { toApiError } from "../api/errors";

const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(100),
    email: z.string().trim().email("Enter a valid email address").max(254),
    password: z.string().min(12, "Use at least 12 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type RegisterValues = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(values: RegisterValues) {
    setSubmitError("");
    try {
      await authApi.register({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      navigate("/login", {
        replace: true,
        state: { notice: "Account created. Sign in to continue." },
      });
    } catch (error) {
      setSubmitError(toApiError(error).message);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="register-title">
        <div className="auth-heading">
          <span className="brand-mark brand-mark--large" aria-hidden="true">
            ฿
          </span>
          <p className="eyebrow">Start with secure ownership</p>
          <h1 id="register-title">Create your account</h1>
          <p>Every expense is isolated by your authenticated user identity.</p>
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
            Name
            <input
              autoComplete="name"
              aria-invalid={Boolean(errors.name)}
              {...register("name")}
            />
            {errors.name ? (
              <span className="field-error">{errors.name.message}</span>
            ) : null}
          </label>
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
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register("password")}
            />
            {errors.password ? (
              <span className="field-error">{errors.password.message}</span>
            ) : null}
          </label>
          <label>
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <span className="field-error">
                {errors.confirmPassword.message}
              </span>
            ) : null}
          </label>
          <button
            className="button button--full"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="auth-switch">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
