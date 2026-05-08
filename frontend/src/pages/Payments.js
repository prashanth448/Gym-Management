import { useEffect, useState } from "react";
import API, { getApiError } from "../services/api";
import { subscribeToRealtime } from "../services/realtime";
import { formatDisplayDate } from "../utils/membership";

const ALL_MONTHS = "__all__";
const PAGE_SIZE_OPTIONS = [10, 20, 50];

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

function formatMonthLabel(monthKey) {
  if (!monthKey) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(new Date(`${monthKey}-01T00:00:00`));
}

function formatCurrency(value) {
  return currencyFormatter.format(value || 0);
}

export default function Payments() {
  const [paymentEntries, setPaymentEntries] = useState([]);
  const [paymentMonths, setPaymentMonths] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE_OPTIONS[0],
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false
  });
  const [summary, setSummary] = useState({
    selectedPaymentCount: 0,
    selectedTotalAmount: 0,
    totalCollectedAcrossMonths: 0,
    averagePayment: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(ALL_MONTHS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [reloadToken, setReloadToken] = useState(0);

  const loadPayments = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await API.get("/payments", {
        params: {
          page,
          pageSize,
          month: selectedMonth
        }
      });
      setPaymentEntries(response.data.items || []);
      setPaymentMonths(response.data.months || []);
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
          selectedPaymentCount: 0,
          selectedTotalAmount: 0,
          totalCollectedAcrossMonths: 0,
          averagePayment: 0
        }
      );
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to load payment details."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [page, pageSize, selectedMonth, reloadToken]);

  useEffect(() => {
    return subscribeToRealtime("gym:dataChanged", () =>
      setReloadToken((current) => current + 1)
    );
  }, []);

  useEffect(() => {
    if (
      selectedMonth !== ALL_MONTHS &&
      paymentMonths.length &&
      !paymentMonths.some((month) => month.monthKey === selectedMonth)
    ) {
      setSelectedMonth(ALL_MONTHS);
      setPage(1);
    }
  }, [paymentMonths, selectedMonth]);

  const selectedMonthData =
    paymentMonths.find((month) => month.monthKey === selectedMonth) || null;
  const monthlyPeak = paymentMonths.reduce(
    (max, month) => Math.max(max, month.totalAmount),
    0
  );
  const selectedLabel =
    selectedMonth === ALL_MONTHS
      ? "All payments"
      : selectedMonthData
        ? formatMonthLabel(selectedMonthData.monthKey)
        : "";
  const groupingLabel =
    selectedMonth === ALL_MONTHS
      ? "All months"
      : selectedMonthData
        ? formatMonthLabel(selectedMonthData.monthKey)
        : "Selected month";

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <h2>Payments</h2>
        </div>
      </section>

      {error ? <div className="status-banner status-banner--error">{error}</div> : null}

      <section className="summary-strip">
        <div>
          <strong>
            {loading
              ? "..."
              : summary.selectedPaymentCount
                ? formatCurrency(summary.selectedTotalAmount)
                : formatCurrency(0)}
          </strong>
          <span>Collected in {groupingLabel}</span>
        </div>
        <div>
          <strong>{loading ? "..." : formatCurrency(summary.totalCollectedAcrossMonths)}</strong>
          <span>Collected across all months</span>
        </div>
        <div>
          <strong>{loading ? "..." : summary.selectedPaymentCount}</strong>
          <span>Payments in view</span>
        </div>
        <div>
          <strong>{loading ? "..." : formatCurrency(summary.averagePayment)}</strong>
          <span>Average payment in view</span>
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-card__header">
          <h3>Monthly collections</h3>
          {paymentMonths.length ? (
            <label className="field field--compact">
              <span>Select month</span>
              <select
                value={selectedMonth}
                onChange={(event) => {
                  setSelectedMonth(event.target.value);
                  setPage(1);
                }}
              >
                <option value={ALL_MONTHS}>All months</option>
                {paymentMonths.map((month) => (
                  <option key={month.monthKey} value={month.monthKey}>
                    {formatMonthLabel(month.monthKey)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {loading ? (
          <div className="panel-empty">Loading monthly collections...</div>
        ) : paymentMonths.length ? (
          <div className="payments-month-list">
            {paymentMonths.map((month) => {
              const ratio = monthlyPeak ? (month.totalAmount / monthlyPeak) * 100 : 0;

              return (
                <button
                  key={month.monthKey}
                  type="button"
                  className={`payment-month-card${
                    selectedMonth === month.monthKey ? " is-active" : ""
                  }`}
                  onClick={() => setSelectedMonth(month.monthKey)}
                >
                  <div className="payment-month-card__header">
                    <strong>{formatMonthLabel(month.monthKey)}</strong>
                    <span>{month.paymentCount} payments</span>
                  </div>
                  <div className="payment-month-card__bar">
                    <div style={{ width: `${Math.max(ratio, 8)}%` }} />
                  </div>
                  <p>{formatCurrency(month.totalAmount)}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="panel-empty">
            {selectedMonth === ALL_MONTHS
              ? "No payment data yet. Payments will appear here after customers are added."
              : "No collection data found for the selected month."}
          </div>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-card__header">
          <h3>Payment entries</h3>
          {selectedLabel ? (
            <span className="badge badge--neutral">{selectedLabel}</span>
          ) : null}
        </div>

        {!loading && pagination.totalItems ? (
          <div className="pagination-toolbar">
            <span className="pagination-copy">
              Showing {paymentEntries.length ? (pagination.page - 1) * pagination.pageSize + 1 : 0}-
              {(pagination.page - 1) * pagination.pageSize + paymentEntries.length} of{" "}
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
          <div className="panel-empty">Loading payment entries...</div>
        ) : paymentEntries.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Member</th>
                  <th>Plan</th>
                  <th>Plan starts</th>
                  <th>Recorded on</th>
                  <th>Plan ends</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {paymentEntries.map((payment) => (
                  <tr key={payment.entryId}>
                    <td data-label="ID">#{payment.customerId}</td>
                    <td data-label="Member">
                      <div className="table-member">
                        <strong>{payment.fullName}</strong>
                        <span>{payment.phone}</span>
                      </div>
                    </td>
                    <td data-label="Plan">{payment.plan}</td>
                    <td data-label="Plan starts">{formatDisplayDate(payment.planStart)}</td>
                    <td data-label="Recorded on">{formatDisplayDate(payment.recordedOn)}</td>
                    <td data-label="Plan ends">{formatDisplayDate(payment.planEnd)}</td>
                    <td data-label="Amount">{formatCurrency(payment.amountPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-empty">
            {selectedMonth === ALL_MONTHS
              ? "No payments recorded yet."
              : "No payments recorded for the selected month."}
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
                  setPage((current) =>
                    pagination.hasNextPage ? current + 1 : current
                  )
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
