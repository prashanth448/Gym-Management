import { Navigate, useLocation } from "react-router-dom";
import { getDefaultRouteForRole, getStoredSession, getStoredToken } from "../services/auth";

export default function ProtectedRoute({ children, allowedRoles }) {
  const location = useLocation();
  const token = getStoredToken();
  const session = getStoredSession();

  if (!token || !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(session?.role)) {
    return <Navigate to={getDefaultRouteForRole(session?.role)} replace />;
  }

  return children;
}
