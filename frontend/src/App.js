import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AppShell from "./components/AppShell";
import ProtectedRoute from "./components/ProtectedRoute";
import AddCustomer from "./pages/AddCustomer";
import Attendance from "./pages/Attendance";
import Customers from "./pages/Customers";
import Dashboard from "./pages/Dashboard";
import GymOwnersAdmin from "./pages/GymOwnersAdmin";
import Login from "./pages/Login";
import Payments from "./pages/Payments";
import { disconnectRealtime } from "./services/realtime";
import {
  clearSession,
  getDefaultRouteForRole,
  getStoredSession,
  getStoredToken,
  getTokenExpiryTime
} from "./services/auth";

function InstallPrompt() {
  const [prompt, setPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const iconUrl = `${process.env.PUBLIC_URL || ""}/icons/icon-192.png`;

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!prompt || dismissed) return null;

  const handleInstall = async () => {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setPrompt(null);
  };

  return (
    <div className="install-prompt">
      <img src={iconUrl} alt="" className="install-prompt__logo" />
      <span className="install-prompt__text">Install Fitledger</span>
      <button className="install-prompt__btn" onClick={handleInstall}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v12M7 11l5 5 5-5" />
          <path d="M4 20h16" />
        </svg>
        Install
      </button>
      <button className="install-prompt__dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
        &#x2715;
      </button>
    </div>
  );
}

function UpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener("sw-update-available", handler);
    return () => window.removeEventListener("sw-update-available", handler);
  }, []);

  if (!visible) return null;

  return (
    <div className="update-banner">
      A new version is available.{" "}
      <button className="update-banner__reload" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}

function SessionExpiryWatcher() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const token = getStoredToken();
    const session = getStoredSession();

    if (!token || !session) {
      return undefined;
    }

    const expiryTime = getTokenExpiryTime(token);

    if (!expiryTime) {
      return undefined;
    }

    const expireSession = () => {
      disconnectRealtime();
      clearSession();
      navigate("/login", {
        replace: true,
        state: {
          from: location.pathname,
          reason: "expired"
        }
      });
    };

    const remainingTime = expiryTime - Date.now();

    if (remainingTime <= 0) {
      expireSession();
      return undefined;
    }

    const timer = window.setTimeout(expireSession, remainingTime);

    return () => window.clearTimeout(timer);
  }, [location.pathname, navigate]);

  return null;
}

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
      <InstallPrompt />
      <UpdateBanner />
      <SessionExpiryWatcher />
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
