import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API, { getApiError } from "../services/api";
import { subscribeToRealtime } from "../services/realtime";
import {
  formatDisplayDate,
  getMembershipState,
  isAttendedToday
} from "../utils/membership";

export default function Dashboard() {
  const [summary, setSummary] = useState({
    totalCustomers: 0,
    activeCount: 0,
    expiringCount: 0,
    expiredCount: 0,
    attendedToday: 0
  });
  const [latestMembers, setLatestMembers] = useState([]);
  const [recentAttendance, setRecentAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await API.get("/customers/dashboard");
      setSummary(
        response.data.summary || {
          totalCustomers: 0,
          activeCount: 0,
          expiringCount: 0,
          expiredCount: 0,
          attendedToday: 0
        }
      );
      setLatestMembers(response.data.latestMembers || []);
      setRecentAttendance(response.data.recentAttendance || []);
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
          <strong>{loading ? "..." : summary.totalCustomers}</strong>
        </article>
        <article className="metric-card">
          <span>Active plans</span>
          <strong>{loading ? "..." : summary.activeCount}</strong>
        </article>
        <article className="metric-card">
          <span>Expiring soon</span>
          <strong>{loading ? "..." : summary.expiringCount}</strong>
        </article>
        <article className="metric-card">
          <span>Checked in today</span>
          <strong>{loading ? "..." : summary.attendedToday}</strong>
        </article>
      </section>

      <section className="panel-grid">
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
                    <div className="list-copy">
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
                  <div className="list-copy">
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
      </section>

      <section className="panel-grid">
        <article className="panel-card">
          <div className="panel-card__header">
            <h3>Renewal pressure</h3>
          </div>

          <div className="pressure-grid">
            <div className="pressure-card pressure-card--warning">
              <strong>{loading ? "..." : summary.expiringCount}</strong>
              <span>Expiring in 3 days</span>
            </div>
            <div className="pressure-card pressure-card--danger">
              <strong>{loading ? "..." : summary.expiredCount}</strong>
              <span>Already expired</span>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
