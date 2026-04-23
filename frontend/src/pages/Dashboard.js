import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Notifications from "../components/Notifications";
import API, { getApiError } from "../services/api";
import { subscribeToRealtime } from "../services/realtime";
import {
  formatDisplayDate,
  getMembershipState,
  isAttendedToday
} from "../utils/membership";

export default function Dashboard() {
  const [customers, setCustomers] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");

    try {
      const [customersResponse, alertsResponse] = await Promise.all([
        API.get("/customers"),
        API.get("/notifications")
      ]);

      setCustomers(customersResponse.data);
      setAlerts(alertsResponse.data);
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to load dashboard data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    return subscribeToRealtime("gym:dataChanged", loadDashboard);
  }, []);

  const activeCustomers = customers.filter(
    (customer) => getMembershipState(customer.planEnd).tone === "success"
  ).length;
  const expiringCustomers = customers.filter(
    (customer) => getMembershipState(customer.planEnd).tone === "warning"
  ).length;
  const expiredCustomers = customers.filter(
    (customer) => getMembershipState(customer.planEnd).tone === "danger"
  ).length;
  const attendedToday = customers.filter((customer) =>
    isAttendedToday(customer.lastAttended)
  ).length;

  const latestMembers = [...customers]
    .sort((left, right) => right.customerId - left.customerId)
    .slice(0, 4);

  const recentAttendance = [...customers]
    .filter((customer) => customer.lastAttended)
    .sort((left, right) => right.lastAttended.localeCompare(left.lastAttended))
    .slice(0, 5);

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <h2>Dashboard</h2>
        </div>

        <div className="hero-card__actions">
          <Link className="button" to="/add">
            Add member
          </Link>
          <Link className="button button--ghost" to="/attendance">
            Mark attendance
          </Link>
        </div>
      </section>

      {error ? <div className="status-banner status-banner--error">{error}</div> : null}

      <section className="metrics-grid">
        <article className="metric-card">
          <span>Total members</span>
          <strong>{loading ? "..." : customers.length}</strong>
        </article>
        <article className="metric-card">
          <span>Active plans</span>
          <strong>{loading ? "..." : activeCustomers}</strong>
        </article>
        <article className="metric-card">
          <span>Expiring soon</span>
          <strong>{loading ? "..." : expiringCustomers}</strong>
        </article>
        <article className="metric-card">
          <span>Checked in today</span>
          <strong>{loading ? "..." : attendedToday}</strong>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel-card">
          <div className="panel-card__header">
            <h3>Renewal alerts</h3>
            {!loading ? (
              <span className="badge badge--warning">
                {alerts.length} needs review
              </span>
            ) : null}
          </div>
          <Notifications alerts={alerts} loading={loading} error={error} />
        </article>

        <article className="panel-card">
          <div className="panel-card__header">
            <h3>Newest members</h3>
            <Link className="text-link" to="/customers">
              View all
            </Link>
          </div>

          {loading ? (
            <div className="panel-empty">Loading members...</div>
          ) : latestMembers.length ? (
            <div className="list-stack">
              {latestMembers.map((customer) => {
                const membership = getMembershipState(customer.planEnd);

                return (
                  <div key={customer.customerId} className="list-row">
                    <div>
                      <strong>{customer.fullName}</strong>
                      <span>
                        #{customer.customerId} • {customer.plan}
                      </span>
                    </div>
                    <span className={`badge badge--${membership.tone}`}>
                      {membership.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="panel-empty">No customers yet. Add your first member to begin.</div>
          )}
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel-card">
          <div className="panel-card__header">
            <h3>Recent attendance</h3>
            <Link className="text-link" to="/attendance">
              Update
            </Link>
          </div>

          {loading ? (
            <div className="panel-empty">Loading attendance...</div>
          ) : recentAttendance.length ? (
            <div className="list-stack">
              {recentAttendance.map((customer) => (
                <div key={customer.customerId} className="list-row">
                  <div>
                    <strong>{customer.fullName}</strong>
                    <span>Last visited {formatDisplayDate(customer.lastAttended)}</span>
                  </div>
                  <span className="badge badge--success">
                    {isAttendedToday(customer.lastAttended) ? "Today" : "Recorded"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel-empty">Attendance will start showing here after check-ins.</div>
          )}
        </article>

        <article className="panel-card">
          <div className="panel-card__header">
            <h3>Renewal pressure</h3>
          </div>

          <div className="pressure-grid">
            <div className="pressure-card pressure-card--warning">
              <strong>{loading ? "..." : expiringCustomers}</strong>
              <span>Expiring in 3 days</span>
            </div>
            <div className="pressure-card pressure-card--danger">
              <strong>{loading ? "..." : expiredCustomers}</strong>
              <span>Already expired</span>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
