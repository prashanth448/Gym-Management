import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API, { getApiError } from "../services/api";
import { subscribeToRealtime } from "../services/realtime";
import {
  formatDisplayDate,
  getMembershipState,
  isAttendedToday
} from "../utils/membership";

function getMetricTone(key) {
  if (key === "activeCount" || key === "attendedToday") return "success";
  if (key === "expiringCount") return "warning";
  if (key === "expiredCount") return "danger";
  return "neutral";
}

function getMetricIcon(key) {
  if (key === "activeCount") return "A";
  if (key === "expiringCount") return "E";
  if (key === "expiredCount") return "X";
  if (key === "attendedToday") return "T";
  return "M";
}

function MetricCard({ label, value, loading, metricKey, delay }) {
  return (
    <article
      className={`metric-card dashboard-metric dashboard-metric--${getMetricTone(metricKey)}`}
      style={{ "--animation-delay": `${delay}ms` }}
    >
      <div className="dashboard-metric__topline">
        <span>{label}</span>
        <span className="dashboard-metric__icon" aria-hidden="true">
          {getMetricIcon(metricKey)}
        </span>
      </div>
      {loading ? (
        <div className="skeleton skeleton--metric" aria-hidden="true" />
      ) : (
        <strong>{value}</strong>
      )}
    </article>
  );
}

function ListSkeleton() {
  return (
    <div className="list-stack" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="list-row dashboard-list-row">
          <div className="list-copy">
            <div className="skeleton skeleton--line skeleton--line-medium" />
            <div className="skeleton skeleton--line skeleton--line-short" />
          </div>
          <div className="skeleton skeleton--pill" />
        </div>
      ))}
    </div>
  );
}

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

  const metricItems = [
    { key: "totalCustomers", label: "Total members", value: summary.totalCustomers },
    { key: "activeCount", label: "Active plans", value: summary.activeCount },
    { key: "expiringCount", label: "Expiring soon", value: summary.expiringCount },
    { key: "expiredCount", label: "Expired", value: summary.expiredCount },
    { key: "attendedToday", label: "Checked in today", value: summary.attendedToday }
  ];
  const membershipTotal =
    summary.activeCount + summary.expiringCount + summary.expiredCount;
  const activePercent = membershipTotal
    ? Math.round((summary.activeCount / membershipTotal) * 100)
    : 0;
  const expiringPercent = membershipTotal
    ? Math.round((summary.expiringCount / membershipTotal) * 100)
    : 0;
  const expiredPercent = membershipTotal
    ? Math.max(0, 100 - activePercent - expiringPercent)
    : 0;

  return (
    <div className="page-stack dashboard-page">
      <section className="hero-card dashboard-hero">
        <div className="dashboard-hero__copy">
          <span className="dashboard-kicker">Operations overview</span>
          <h2>Dashboard</h2>
          <p>Track membership health, check-ins, and new joins from one focused view.</p>
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
        {metricItems.map((metric, index) => (
          <MetricCard
            key={metric.key}
            label={metric.label}
            value={metric.value}
            loading={loading}
            metricKey={metric.key}
            delay={index * 55}
          />
        ))}
      </section>

      <section className="panel-card dashboard-health-panel">
        <div className="panel-card__header">
          <div>
            <h3>Membership health</h3>
            <p>{membershipTotal ? `${membershipTotal} memberships tracked` : "No memberships tracked yet"}</p>
          </div>
          <Link className="text-link" to="/customers">
            Review members
          </Link>
        </div>

        {loading ? (
          <div className="skeleton skeleton--bar" aria-hidden="true" />
        ) : (
          <div className="dashboard-health-bar" aria-label="Membership status distribution">
            <span
              className="dashboard-health-bar__segment dashboard-health-bar__segment--success"
              style={{ width: `${activePercent}%` }}
            />
            <span
              className="dashboard-health-bar__segment dashboard-health-bar__segment--warning"
              style={{ width: `${expiringPercent}%` }}
            />
            <span
              className="dashboard-health-bar__segment dashboard-health-bar__segment--danger"
              style={{ width: `${expiredPercent}%` }}
            />
          </div>
        )}

        <div className="dashboard-health-legend">
          <span><i className="legend-dot legend-dot--success" />Active {loading ? "" : activePercent + "%"}</span>
          <span><i className="legend-dot legend-dot--warning" />Expiring {loading ? "" : expiringPercent + "%"}</span>
          <span><i className="legend-dot legend-dot--danger" />Expired {loading ? "" : expiredPercent + "%"}</span>
        </div>
      </section>

      <section className="panel-grid dashboard-panel-grid">
        <article className="panel-card dashboard-panel">
          <div className="panel-card__header">
            <div>
              <h3>Newest members</h3>
              <p>Recently added profiles</p>
            </div>
            <Link className="text-link" to="/customers">
              View all
            </Link>
          </div>

          {loading ? (
            <ListSkeleton />
          ) : latestMembers.length ? (
            <div className="list-stack">
              {latestMembers.map((customer) => {
                const membership = getMembershipState(customer.planEnd);

                return (
                  <div key={customer.customerId} className="list-row dashboard-list-row">
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

        <article className="panel-card dashboard-panel">
          <div className="panel-card__header">
            <div>
              <h3>Recent attendance</h3>
              <p>Latest member activity</p>
            </div>
            <Link className="text-link" to="/attendance">
              Update
            </Link>
          </div>

          {loading ? (
            <ListSkeleton />
          ) : recentAttendance.length ? (
            <div className="list-stack">
              {recentAttendance.map((customer) => (
                <div key={customer.customerId} className="list-row dashboard-list-row">
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
    </div>
  );
}
