import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
import AddCustomer from "./pages/AddCustomer";
import Attendance from "./pages/Attendance";
import Customers from "./pages/Customers";
import Dashboard from "./pages/Dashboard";
import GymOwnersAdmin from "./pages/GymOwnersAdmin";
import Login from "./pages/Login";
import Payments from "./pages/Payments";
import { getDefaultRouteForRole, getStoredSession, getStoredToken } from "./services/auth";

function PublicRoute({ children }) {
  const token = getStoredToken();
  const session = getStoredSession();
  return token && session ? (
    <Navigate to={getDefaultRouteForRole(session.role)} replace />
  ) : (
    children
  );
}

function RootRedirect() {
  const token = getStoredToken();
  const session = getStoredSession();

  return <Navigate to={token && session ? getDefaultRouteForRole(session.role) : "/login"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute allowedRoles={["owner"]}>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/add" element={<AddCustomer />} />
          <Route path="/attendance" element={<Attendance />} />
        </Route>
        <Route
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/admin/gym-owners" element={<GymOwnersAdmin />} />
        </Route>
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
