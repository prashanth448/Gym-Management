import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getStoredSession } from "../services/auth";
import { disconnectRealtime } from "../services/realtime";

export default function AppShell() {
  const navigate = useNavigate();
  const session = getStoredSession();
  const isAdmin = session?.role === "admin";
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full"
  }).format(new Date());
  const navItems = isAdmin
    ? [{ to: "/admin/gym-owners", label: "Gym Owners" }]
    : [
        { to: "/dashboard", label: "Dashboard" },
        { to: "/customers", label: "Customers" },
        { to: "/payments", label: "Payments" },
        { to: "/add", label: "Add Customer" },
        { to: "/attendance", label: "Attendance" }
      ];

  const handleLogout = () => {
    disconnectRealtime();
    clearSession();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__sidebar-top">
          <div className="brand-mark">fitLedger</div>
          <nav className="app-shell__nav" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `app-shell__nav-link${isActive ? " is-active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="app-shell__sidebar-note">
          <span className="sidebar-note__label">{isAdmin ? "Admin mode" : "Today"}</span>
          <strong>{isAdmin ? session?.name || "Admin" : todayLabel}</strong>
        </div>
      </aside>

      <div className="app-shell__main">
        <header className="app-shell__header">
          <div />

          <button className="button button--ghost" onClick={handleLogout}>
            Log out
          </button>
        </header>

        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
