import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { normalizeCustomerForm } from "../components/CustomerForm";
import API, { getApiError } from "../services/api";
import { subscribeToRealtime } from "../services/realtime";
import { getCustomerInitials } from "../utils/customerPhoto";
import {
  PLAN_OPTIONS,
  addDaysToDateString,
  formatDisplayDate,
  getMembershipState,
  getPlanEndDate,
  getTodayDateString
} from "../utils/membership";

export default function Customers() {
  const PAGE_SIZE = 10;
  const location = useLocation();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false
  });
  const [summary, setSummary] = useState({
    totalCustomers: 0,
    activeCount: 0,
    expiringCount: 0,
    expiredCount: 0,
    dueAmountCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flashMessage, setFlashMessage] = useState(location.state?.message || "");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dueAmountFilter, setDueAmountFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [deletingCustomer, setDeletingCustomer] = useState(false);
  const [renewingCustomer, setRenewingCustomer] = useState(null);
  const [renewForm, setRenewForm] = useState(null);
  const [renewError, setRenewError] = useState("");
  const [savingRenewal, setSavingRenewal] = useState(false);
  const latestRequestRef = useRef(0);

  useEffect(() => {
    const nextQuery = query.trim();

    if (!nextQuery) {
      setAppliedQuery("");
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setAppliedQuery(nextQuery);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  const loadCustomers = async () => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;
    setLoading(true);
    setError("");

    try {
      const response = await API.get("/customers", {
        params: {
          page,
          pageSize: PAGE_SIZE,
          query: appliedQuery,
          status: statusFilter,
          dueStatus: dueAmountFilter
        }
      });

      if (latestRequestRef.current !== requestId) {
        return;
      }

      setCustomers(response.data.items || []);
      setPagination(
        response.data.pagination || {
          page: 1,
          pageSize: PAGE_SIZE,
          totalItems: 0,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false
        }
      );
      setSummary(
        response.data.summary || {
          totalCustomers: 0,
          activeCount: 0,
          expiringCount: 0,
          expiredCount: 0,
          dueAmountCount: 0
        }
      );
    } catch (requestError) {
      if (latestRequestRef.current !== requestId) {
        return;
      }

      setError(getApiError(requestError, "Unable to load customers."));
    } finally {
      if (latestRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [page, appliedQuery, statusFilter, dueAmountFilter, reloadToken]);

  useEffect(() => {
    return subscribeToRealtime("gym:dataChanged", () =>
      setReloadToken((current) => current + 1)
    );
  }, []);

  useEffect(() => {
    if (location.state?.message) {
      navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.state, navigate]);
  const editPreviewEndDate =
    editingCustomer && editForm
      ? getPlanEndDate(
          editForm.planStart || getTodayDateString(),
          editForm.plan
        )
      : "";
  const renewalPreviewEndDate =
    renewingCustomer && renewForm
      ? getPlanEndDate(
          renewForm.planStart || getTodayDateString(),
          renewForm.plan
        )
      : "";

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setEditForm(normalizeCustomerForm(customer));
    setEditError("");
  };

  const getRenewalStartDate = (customer) => {
    const today = getTodayDateString();

    if (customer.planEnd && customer.planEnd >= today) {
      return addDaysToDateString(customer.planEnd, 1);
    }

    return today;
  };

  const openRenewModal = (customer) => {
    const planStart = getRenewalStartDate(customer);
    const plan = customer.plan || PLAN_OPTIONS[0];

    setRenewingCustomer(customer);
    setRenewForm({
      plan,
      amountPaid:
        customer.amountPaid === 0 || customer.amountPaid
          ? String(customer.amountPaid)
          : "",
      dueAmount:
        customer.dueAmount === 0 || customer.dueAmount
          ? String(customer.dueAmount)
          : "0",
      planStart,
      planEnd: getPlanEndDate(planStart, plan)
    });
    setRenewError("");
  };

  const openDeleteModal = (customer) => {
    setCustomerToDelete(customer);
    setEditError("");
  };

  const closeEditModal = (force = false) => {
    if (savingEdit && !force) {
      return;
    }

    setEditingCustomer(null);
    setEditForm(null);
    setEditError("");
  };

  const closeRenewModal = (force = false) => {
    if (savingRenewal && !force) {
      return;
    }

    setRenewingCustomer(null);
    setRenewForm(null);
    setRenewError("");
  };

  const closeDeleteModal = (force = false) => {
    if (deletingCustomer && !force) {
      return;
    }

    setCustomerToDelete(null);
  };

  const updateEditField = (key, value) => {
    setEditForm((current) => ({ ...current, [key]: value }));
    setEditError("");
  };

  const updateRenewField = (key, value) => {
    setRenewForm((current) => ({ ...current, [key]: value }));
  };

  const handleEditSubmit = async (event) => {
    event.preventDefault();

    if (!editingCustomer || !editForm) {
      return;
    }

    setEditError("");

    if (
      !editForm.fullName ||
      !editForm.phone ||
      !editForm.age ||
      editForm.amountPaid === "" ||
      !editForm.planStart ||
      !editForm.planEnd
    ) {
      setEditError("Please fill in name, phone, age, amount paid, plan start, and plan end before saving.");
      return;
    }

    if (editForm.planEnd < editForm.planStart) {
      setEditError("Plan end cannot be earlier than plan start.");
      return;
    }

    setSavingEdit(true);

    try {
      const response = await API.put(`/customers/${editingCustomer.customerId}`, {
        ...editForm,
        age: Number(editForm.age),
        amountPaid: Number(editForm.amountPaid),
        dueAmount: Number(editForm.dueAmount || 0)
      });
      setFlashMessage(`${response.data.fullName} was updated successfully.`);
      closeEditModal(true);
      setReloadToken((current) => current + 1);
    } catch (requestError) {
      setEditError(getApiError(requestError, "Unable to update this customer."));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) {
      return;
    }

    setDeletingCustomer(true);

    try {
      const response = await API.delete(`/customers/${customerToDelete.customerId}`);
      setFlashMessage(
        response.data?.message || `${customerToDelete.fullName} was deleted successfully.`
      );
      if (editingCustomer?.customerId === customerToDelete.customerId) {
        closeEditModal(true);
      }
      closeDeleteModal(true);
      setPage((current) => {
        const nextTotalItems = Math.max(0, pagination.totalItems - 1);
        const nextTotalPages = Math.max(1, Math.ceil(nextTotalItems / PAGE_SIZE));
        return Math.min(current, nextTotalPages);
      });
      setReloadToken((current) => current + 1);
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to delete this customer."));
    } finally {
      setDeletingCustomer(false);
    }
  };

  const handleRenewSubmit = async (event) => {
    event.preventDefault();

    if (!renewingCustomer || !renewForm) {
      return;
    }

    setRenewError("");

    if (
      !renewForm.plan ||
      renewForm.amountPaid === "" ||
      !renewForm.planStart ||
      !renewForm.planEnd
    ) {
      setRenewError("Please fill in plan, amount paid, plan start, and plan end.");
      return;
    }

    if (renewForm.planEnd < renewForm.planStart) {
      setRenewError("Plan end cannot be earlier than plan start.");
      return;
    }

    setSavingRenewal(true);

    try {
      const response = await API.post(`/customers/${renewingCustomer.customerId}/renew`, {
        ...renewForm,
        amountPaid: Number(renewForm.amountPaid),
        dueAmount: Number(renewForm.dueAmount || 0)
      });
      setFlashMessage(`${response.data.fullName} was renewed successfully.`);
      closeRenewModal(true);
      setReloadToken((current) => current + 1);
    } catch (requestError) {
      setRenewError(getApiError(requestError, "Unable to renew this membership."));
    } finally {
      setSavingRenewal(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <h2>Customers</h2>
        </div>
        <Link className="button" to="/add">
          Add Customer
        </Link>
      </section>

      {flashMessage ? (
        <div className="status-banner">
          {flashMessage}
          <button className="text-link" onClick={() => setFlashMessage("")}>
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? <div className="status-banner status-banner--error">{error}</div> : null}

      <section className="summary-strip">
        <div>
          <strong>{loading ? "..." : summary.totalCustomers}</strong>
          <span>Total customers</span>
        </div>
        <div>
          <strong>{loading ? "..." : summary.activeCount}</strong>
          <span>Active</span>
        </div>
        <div>
          <strong>{loading ? "..." : summary.expiringCount}</strong>
          <span>Expiring soon</span>
        </div>
        <div>
          <strong>{loading ? "..." : summary.expiredCount}</strong>
          <span>Expired</span>
        </div>
        <div>
          <strong>{loading ? "..." : summary.dueAmountCount}</strong>
          <span>With due amount</span>
        </div>
      </section>

      <section className="panel-card">
        <div className="filters-row">
          <label className="field">
            <span>Search members</span>
            <input
              placeholder="Name, phone, email, or ID"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className="field field--compact">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="All">All</option>
              <option value="Active">Active</option>
              <option value="Expiring">Expiring soon</option>
              <option value="Expired">Expired</option>
            </select>
          </label>

          <label className="field field--compact">
            <span>Due amount</span>
            <select
              value={dueAmountFilter}
              onChange={(event) => {
                setDueAmountFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="All">All</option>
              <option value="Pending">Pending due only</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="panel-empty">Loading customers...</div>
        ) : customers.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Member</th>
                  <th>Plan</th>
                  <th>Amount</th>
                  <th>Due amount</th>
                  <th>Plan ends</th>
                  <th>Last attended</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const membership = getMembershipState(customer.planEnd);

                  return (
                    <tr key={customer.customerId}>
                      <td data-label="ID">#{customer.customerId}</td>
                      <td data-label="Member">
                        <div className="member-cell">
                          <div className="customer-photo-preview customer-photo-preview--small">
                            {customer.photo ? (
                              <img src={customer.photo} alt={`${customer.fullName} profile`} />
                            ) : (
                              <span>{getCustomerInitials(customer.fullName)}</span>
                            )}
                          </div>
                          <div className="table-member">
                            <strong>{customer.fullName}</strong>
                            <span>
                              {customer.phone}
                              {customer.email ? ` • ${customer.email}` : ""}
                              {" • "}Age {customer.age || "N/A"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Plan">{customer.plan}</td>
                      <td data-label="Amount">Rs. {customer.amountPaid}</td>
                      <td data-label="Due amount">Rs. {customer.dueAmount || 0}</td>
                      <td data-label="Plan ends">{formatDisplayDate(customer.planEnd)}</td>
                      <td data-label="Last attended">{formatDisplayDate(customer.lastAttended)}</td>
                      <td data-label="Status">
                        <span className={`badge badge--${membership.tone}`}>
                          {membership.label}
                        </span>
                      </td>
                      <td data-label="Action">
                        <div className="table-actions">
                          <button
                            className="text-link"
                            type="button"
                            onClick={() => openRenewModal(customer)}
                          >
                            Renew
                          </button>
                          <button
                            className="text-link"
                            type="button"
                            onClick={() => openEditModal(customer)}
                          >
                            Edit
                          </button>
                          <button
                            className="text-link"
                            type="button"
                            onClick={() => openDeleteModal(customer)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-empty">
            No customers match the current search. Try another filter or add a
            new member.
          </div>
        )}

        {!loading && pagination.totalItems ? (
          <div className="pagination-row">
            <span className="pagination-copy">
              Showing {customers.length ? (pagination.page - 1) * pagination.pageSize + 1 : 0}-
              {(pagination.page - 1) * pagination.pageSize + customers.length} of{" "}
              {pagination.totalItems}
            </span>
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

      {editingCustomer && editForm ? (
        <div className="modal-backdrop" onClick={closeEditModal}>
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-customer-title"
          >
            <div className="modal-card__header">
              <div>
                <h3 id="edit-customer-title">Edit {editingCustomer.fullName}</h3>
              </div>
              <button
                className="modal-close-button"
                type="button"
                onClick={closeEditModal}
                aria-label="Close edit dialog"
                disabled={savingEdit}
              >
                X
              </button>
            </div>

            <form className="modal-form" onSubmit={handleEditSubmit}>
              {editError ? (
                <div className="status-banner status-banner--error">{editError}</div>
              ) : null}

              <div className="form-grid">
                <label className="field">
                  <span>Full name</span>
                  <input
                    placeholder="Enter member name"
                    value={editForm.fullName}
                    onChange={(event) => updateEditField("fullName", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Phone number</span>
                  <input
                    placeholder="Enter phone number"
                    value={editForm.phone}
                    onChange={(event) => updateEditField("phone", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Email (optional)</span>
                  <input
                    type="email"
                    placeholder="Enter email address"
                    value={editForm.email}
                    onChange={(event) => updateEditField("email", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Age</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Enter age"
                    value={editForm.age}
                    onChange={(event) => updateEditField("age", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Amount paid</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Enter amount paid"
                    value={editForm.amountPaid}
                    onChange={(event) => updateEditField("amountPaid", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Due amount</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Enter due amount"
                    value={editForm.dueAmount}
                    onChange={(event) => updateEditField("dueAmount", event.target.value)}
                  />
                </label>
              </div>

              <label className="field">
                <span>Membership plan</span>
                <select
                  value={editForm.plan}
                  onChange={(event) => updateEditField("plan", event.target.value)}
                >
                  {PLAN_OPTIONS.map((plan) => (
                    <option key={plan} value={plan}>
                      {plan}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-grid">
                <label className="field">
                  <span>Plan start</span>
                  <input
                    type="date"
                    value={editForm.planStart}
                    onChange={(event) => updateEditField("planStart", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Plan end</span>
                  <input
                    type="date"
                    value={editForm.planEnd}
                    onChange={(event) => updateEditField("planEnd", event.target.value)}
                  />
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => updateEditField("planEnd", editPreviewEndDate)}
                  >
                    Use suggested end date
                  </button>
                </label>
              </div>

              <label className="field">
                <span>Last attended</span>
                <input
                  type="date"
                  value={editForm.lastAttended}
                  onChange={(event) => updateEditField("lastAttended", event.target.value)}
                />
                <button
                  className="text-link"
                  type="button"
                  onClick={() => updateEditField("lastAttended", "")}
                >
                  Clear date
                </button>
              </label>

              <div className="modal-summary">
                <div className="info-card__row">
                  <span>Customer ID</span>
                  <strong>#{editingCustomer.customerId}</strong>
                </div>
                <div className="info-card__row">
                  <span>Plan start</span>
                  <strong>{formatDisplayDate(editForm.planStart)}</strong>
                </div>
                <div className="info-card__row">
                  <span>Plan end</span>
                  <strong>{formatDisplayDate(editForm.planEnd)}</strong>
                </div>
                <div className="info-card__row">
                  <span>Due amount</span>
                  <strong>Rs. {editForm.dueAmount || 0}</strong>
                </div>
                <div className="info-card__row">
                  <span>Last attended</span>
                  <strong>{formatDisplayDate(editForm.lastAttended)}</strong>
                </div>
                <div className="info-card__row">
                  <span>Suggested end date</span>
                  <strong>{formatDisplayDate(editPreviewEndDate)}</strong>
                </div>
              </div>

              <div className="form-actions">
                <button className="button" type="submit" disabled={savingEdit}>
                  {savingEdit ? "Saving..." : "Save changes"}
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={closeEditModal}
                  disabled={savingEdit}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {customerToDelete ? (
        <div className="modal-backdrop" onClick={closeDeleteModal}>
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-customer-title"
          >
            <div className="modal-card__header">
              <div>
                <h3 id="delete-customer-title">Delete {customerToDelete.fullName}?</h3>
              </div>
              <button
                className="modal-close-button"
                type="button"
                onClick={closeDeleteModal}
                aria-label="Close delete dialog"
                disabled={deletingCustomer}
              >
                X
              </button>
            </div>

            <div className="modal-form">
              <div className="status-banner status-banner--error">
                This action cannot be undone.
              </div>

              <div className="modal-summary">
                <div className="info-card__row">
                  <span>Customer ID</span>
                  <strong>#{customerToDelete.customerId}</strong>
                </div>
                <div className="info-card__row">
                  <span>Membership</span>
                  <strong>{customerToDelete.plan}</strong>
                </div>
                <div className="info-card__row">
                  <span>Plan end</span>
                  <strong>{formatDisplayDate(customerToDelete.planEnd)}</strong>
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="button"
                  type="button"
                  onClick={handleDeleteCustomer}
                  disabled={deletingCustomer}
                >
                  {deletingCustomer ? "Deleting..." : "Confirm delete"}
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={closeDeleteModal}
                  disabled={deletingCustomer}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {renewingCustomer && renewForm ? (
        <div className="modal-backdrop" onClick={closeRenewModal}>
          <div
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="renew-customer-title"
          >
            <div className="modal-card__header">
              <div>
                <h3 id="renew-customer-title">
                  Renew Membership for {renewingCustomer.fullName}
                </h3>
              </div>
              <button
                className="modal-close-button"
                type="button"
                onClick={closeRenewModal}
                aria-label="Close renew dialog"
                disabled={savingRenewal}
              >
                X
              </button>
            </div>

            <form className="modal-form" onSubmit={handleRenewSubmit}>
              {renewError ? (
                <div className="status-banner status-banner--error">{renewError}</div>
              ) : null}

              <div className="info-card__row">
                <span>Current plan</span>
                <strong>
                  {renewingCustomer.plan} until {formatDisplayDate(renewingCustomer.planEnd)}
                </strong>
              </div>

              <label className="field">
                <span>Membership plan</span>
                <select
                  value={renewForm.plan}
                  onChange={(event) => updateRenewField("plan", event.target.value)}
                >
                  {PLAN_OPTIONS.map((plan) => (
                    <option key={plan} value={plan}>
                      {plan}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-grid">
                <label className="field">
                  <span>Amount paid</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Enter amount paid"
                    value={renewForm.amountPaid}
                    onChange={(event) => updateRenewField("amountPaid", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Due amount</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="Enter due amount"
                    value={renewForm.dueAmount}
                    onChange={(event) => updateRenewField("dueAmount", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Plan start</span>
                  <input
                    type="date"
                    value={renewForm.planStart}
                    onChange={(event) => updateRenewField("planStart", event.target.value)}
                  />
                </label>
              </div>

              <label className="field">
                <span>Plan end</span>
                <input
                  type="date"
                  value={renewForm.planEnd}
                  onChange={(event) => updateRenewField("planEnd", event.target.value)}
                />
                <button
                  className="text-link"
                  type="button"
                  onClick={() => updateRenewField("planEnd", renewalPreviewEndDate)}
                >
                  Use suggested end date
                </button>
              </label>

              <div className="modal-summary">
                <div className="info-card__row">
                  <span>Next plan starts</span>
                  <strong>{formatDisplayDate(renewForm.planStart)}</strong>
                </div>
                <div className="info-card__row">
                  <span>Next plan ends</span>
                  <strong>{formatDisplayDate(renewForm.planEnd)}</strong>
                </div>
                <div className="info-card__row">
                  <span>Due amount</span>
                  <strong>Rs. {renewForm.dueAmount || 0}</strong>
                </div>
                <div className="info-card__row">
                  <span>Suggested end date</span>
                  <strong>{formatDisplayDate(renewalPreviewEndDate)}</strong>
                </div>
                <div className="info-card__row">
                  <span>Recorded subscriptions</span>
                  <strong>{(renewingCustomer.membershipHistory?.length || 1) + 1}</strong>
                </div>
              </div>

              <div className="form-actions">
                <button className="button" type="submit" disabled={savingRenewal}>
                  {savingRenewal ? "Renewing..." : "Renew membership"}
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={closeRenewModal}
                  disabled={savingRenewal}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
