import { useDeferredValue, useEffect, useRef, useState } from "react";
import API, { getApiError } from "../services/api";
import { subscribeToRealtime } from "../services/realtime";
import {
  formatDisplayDate,
  getMembershipState,
  isAttendedToday
} from "../utils/membership";

export default function Attendance() {
  const PAGE_SIZE_OPTIONS = [10, 20, 50];
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE_OPTIONS[0],
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false
  });
  const [summary, setSummary] = useState({
    totalCustomers: 0,
    attendedToday: 0
  });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeCustomerId, setActiveCustomerId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [reloadToken, setReloadToken] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const skipNextAttendanceReloadRef = useRef(false);

  const loadCustomers = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await API.get("/customers/attendance", {
        params: {
          page,
          pageSize,
          query: deferredQuery.trim()
        }
      });
      setCustomers(response.data.items || []);
      setPagination(
        response.data.pagination || {
          page: 1,
          pageSize,
          totalItems: 0,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false
        }
      );
      setSummary(
        response.data.summary || {
          totalCustomers: 0,
          attendedToday: 0
        }
      );
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to load customer attendance."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [page, pageSize, deferredQuery, reloadToken]);

  useEffect(() => {
    return subscribeToRealtime("gym:dataChanged", (payload) => {
      if (payload?.reason === "attendance-recorded" && skipNextAttendanceReloadRef.current) {
        skipNextAttendanceReloadRef.current = false;
        return;
      }

      setReloadToken((current) => current + 1);
    });
  }, []);

  const handleMarkAttendance = async (customerId) => {
    setActiveCustomerId(customerId);
    setMessage("");
    setError("");

    try {
      const response = await API.post("/customers/attendance", { customerId });
      const updatedCustomer = response.data;
      const previousCustomer = customers.find((customer) => customer.customerId === customerId);
      const wasAttendedToday = isAttendedToday(previousCustomer?.lastAttended);
      const isNowAttendedToday = isAttendedToday(updatedCustomer.lastAttended);

      skipNextAttendanceReloadRef.current = true;
      setCustomers((current) =>
        current.map((customer) =>
          customer.customerId === customerId
            ? {
                ...customer,
                ...updatedCustomer
              }
            : customer
        )
      );
      if (!wasAttendedToday && isNowAttendedToday && updatedCustomer.attendanceRecorded) {
        setSummary((current) => ({
          ...current,
          attendedToday: Math.min(current.totalCustomers, current.attendedToday + 1)
        }));
      }
      setMessage(
        updatedCustomer.attendanceRecorded
          ? `Attendance marked for ${updatedCustomer.fullName}.`
          : `${updatedCustomer.fullName} is already checked in for today.`
      );
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to mark attendance."));
    } finally {
      setActiveCustomerId(null);
    }
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <h2>Attendance</h2>
        </div>
      </section>

      {message ? <div className="status-banner">{message}</div> : null}
      {error ? <div className="status-banner status-banner--error">{error}</div> : null}

      <section className="summary-strip">
        <div>
          <strong>{loading ? "..." : summary.totalCustomers}</strong>
          <span>Total members</span>
        </div>
        <div>
          <strong>{loading ? "..." : summary.attendedToday}</strong>
          <span>Checked in today</span>
        </div>
        <div>
          <strong>{loading ? "..." : pagination.totalItems}</strong>
          <span>Matching results</span>
        </div>
      </section>

      <section className="panel-card">
        <div className="filters-row">
          <label className="field">
            <span>Find a member</span>
            <input
              placeholder="Search by name, phone, or ID"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>

        {!loading && pagination.totalItems ? (
          <div className="pagination-toolbar">
            <span className="pagination-copy">
              Showing {customers.length ? (pagination.page - 1) * pagination.pageSize + 1 : 0}-
              {(pagination.page - 1) * pagination.pageSize + customers.length} of{" "}
              {pagination.totalItems}
            </span>
            <label className="field field--compact">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {loading ? (
          <div className="panel-empty">Loading attendance roster...</div>
        ) : customers.length ? (
          <div className="attendance-list">
            {customers.map((customer) => {
              const membership = getMembershipState(customer.planEnd);
              const attended = isAttendedToday(customer.lastAttended);

              return (
                <article key={customer.customerId} className="attendance-card">
                  <div className="attendance-card__content">
                    <div>
                      <div className="attendance-card__title">
                        <strong>{customer.fullName}</strong>
                        <span>#{customer.customerId}</span>
                      </div>
                      <p>
                        {customer.phone} • {customer.plan} • Plan ends{" "}
                        {formatDisplayDate(customer.planEnd)}
                      </p>
                    </div>

                    <div className="attendance-card__badges">
                      <span className={`badge badge--${membership.tone}`}>
                        {membership.label}
                      </span>
                      <span className={`badge badge--${attended ? "success" : "neutral"}`}>
                        {attended
                          ? "Checked in today"
                          : `Last visit ${formatDisplayDate(customer.lastAttended)}`}
                      </span>
                    </div>
                  </div>

                  <button
                    className="button"
                    onClick={() => handleMarkAttendance(customer.customerId)}
                    disabled={activeCustomerId === customer.customerId}
                  >
                    {activeCustomerId === customer.customerId
                      ? "Updating..."
                      : "Mark attendance"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="panel-empty">
            No customers match that search. Try another member name or ID.
          </div>
        )}

        {!loading && pagination.totalItems ? (
          <div className="pagination-row">
            <div className="pagination-actions">
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={!pagination.hasPreviousPage}
              >
                Previous
              </button>
              <span className="pagination-copy">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                className="button button--ghost"
                type="button"
                onClick={() =>
                  setPage((current) => (pagination.hasNextPage ? current + 1 : current))
                }
                disabled={!pagination.hasNextPage}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
