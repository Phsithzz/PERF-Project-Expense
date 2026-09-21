import { Navigate, Outlet, useLocation } from "react-router-dom";

import { FullPageLoader } from "../components/AsyncState";
import { useAuth } from "./auth-context";

export function RequireAuth() {
  const { user, isBootstrapping } = useAuth();
  const location = useLocation();

  if (isBootstrapping) {
    return <FullPageLoader label="Checking your session…" />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
