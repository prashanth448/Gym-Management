import { useEffect, useRef, useState } from "react";
import API, { getApiError } from "../services/api";
import { subscribeToRealtime } from "../services/realtime";
import { formatDisplayDate } from "../utils/membership";

const STATUS_OPTIONS = ["Active", "Pending", "Suspended"];
const initialForm = {
  gymId: "",
  gymName: "",
  ownerName: "",
  email: "",
  phone: "",
  city: "",
  status: STATUS_OPTIONS[0],
  password: ""
};

function getStatusTone(status) {
  if (status === "Active") {
    return "success";
  }

  if (status === "Pending") {
    return "warning";
  }

  if (status === "Suspended") {
    return "danger";
  }

  return "neutral";
}

export default function GymOwnersAdmin() {
  const formCardRef = useRef(null);
  const gymIdInputRef = useRef(null);
  const selectedGymIdRef = useRef("");
  const formModeRef = useRef("create");
  const [gymOwners, setGymOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedGymId, setSelectedGymId] = useState("");
  const [formMode, setFormMode] = useState("create");
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    selectedGymIdRef.current = selectedGymId;
  }, [selectedGymId]);

  useEffect(() => {
    formModeRef.current = formMode;
  }, [formMode]);

  const loadGymOwners = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await API.get("/admin/gym-owners");
      setGymOwners(response.data);

      if (!response.data.length) {
        setSelectedGymId("");
        setFormMode("create");
        setForm(initialForm);
        return;
      }

      const preferredOwner =
        response.data.find((owner) => owner.gymId === selectedGymIdRef.current) ||
        response.data[0];

      setSelectedGymId(preferredOwner.gymId);

      if (formModeRef.current !== "create") {
        setFormMode("edit");
        setForm({ ...preferredOwner, password: "" });
      }
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to load gym owner records."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGymOwners();
    return subscribeToRealtime("admin:dataChanged", loadGymOwners);
  }, []);

  const filteredGymOwners = gymOwners.filter((owner) => {
    const searchValue = query.trim().toLowerCase();
    const matchesSearch =
      !searchValue ||
      owner.gymId.toLowerCase().includes(searchValue) ||
      owner.gymName.toLowerCase().includes(searchValue) ||
      owner.ownerName.toLowerCase().includes(searchValue) ||
      owner.email.toLowerCase().includes(searchValue) ||
      owner.city.toLowerCase().includes(searchValue);

    const matchesStatus =
      statusFilter === "All" || owner.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeCount = gymOwners.filter((owner) => owner.status === "Active").length;
  const pendingCount = gymOwners.filter((owner) => owner.status === "Pending").length;
  const suspendedCount = gymOwners.filter((owner) => owner.status === "Suspended").length;
  const totalCustomers = gymOwners.reduce(
    (count, owner) => count + owner.customerCount,
    0
  );
  const selectedOwner = gymOwners.find((owner) => owner.gymId === selectedGymId) || null;

  const syncFormWithOwner = (owner) => {
    setSelectedGymId(owner.gymId);
    setFormMode("edit");
    setForm({
      gymId: owner.gymId,
      gymName: owner.gymName,
      ownerName: owner.ownerName,
      email: owner.email,
      phone: owner.phone,
      city: owner.city,
      status: owner.status,
      password: ""
    });
  };

  const handleCreateNew = () => {
    setSelectedGymId("");
    setFormMode("create");
    setForm(initialForm);
    setMessage("Ready to add a new gym owner.");
    setError("");

    requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
      gymIdInputRef.current?.focus();
    });
  };

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        ...form,
        gymId: form.gymId.trim().toUpperCase()
      };
      const response =
        formMode === "create"
          ? await API.post("/admin/gym-owners", payload)
          : await API.put(`/admin/gym-owners/${selectedGymId}`, payload);

      setGymOwners((current) => {
        const remaining = current.filter(
          (owner) => owner.gymId !== selectedGymId && owner.gymId !== response.data.gymId
        );

        return [...remaining, response.data].sort((left, right) =>
          left.gymId.localeCompare(right.gymId)
        );
      });

      syncFormWithOwner(response.data);
      setMessage(
        formMode === "create"
          ? `${response.data.gymName} was added successfully.`
          : `${response.data.gymName} was updated successfully.`
      );
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to save this gym owner."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <h2>Gym Owners</h2>
        </div>
        <button className="button" type="button" onClick={handleCreateNew}>
          Add gym owner
        </button>
      </section>

      {message ? <div className="status-banner">{message}</div> : null}
      {error ? <div className="status-banner status-banner--error">{error}</div> : null}

      <section className="summary-strip">
        <div>
          <strong>{loading ? "..." : gymOwners.length}</strong>
          <span>Total gym owners</span>
        </div>
        <div>
          <strong>{loading ? "..." : activeCount}</strong>
          <span>Active</span>
        </div>
        <div>
          <strong>{loading ? "..." : pendingCount + suspendedCount}</strong>
          <span>Needs review</span>
        </div>
        <div>
          <strong>{loading ? "..." : totalCustomers}</strong>
          <span>Customers across gyms</span>
        </div>
      </section>

      <section className="panel-card">
        <div className="filters-row">
          <label className="field">
            <span>Search gym owners</span>
            <input
              placeholder="Gym ID, gym name, owner, email, or city"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label className="field field--compact">
            <span>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="All">All</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="panel-empty">Loading gym owners...</div>
        ) : filteredGymOwners.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Gym ID</th>
                  <th>Gym</th>
                  <th>Owner</th>
                  <th>City</th>
                  <th>Status</th>
                  <th>Customers</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredGymOwners.map((owner) => (
                  <tr key={owner.gymId}>
                    <td>{owner.gymId}</td>
                    <td>
                      <div className="table-member">
                        <strong>{owner.gymName}</strong>
                        <span>{owner.email}</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-member">
                        <strong>{owner.ownerName}</strong>
                        <span>{owner.phone}</span>
                      </div>
                    </td>
                    <td>{owner.city}</td>
                    <td>
                      <span className={`badge badge--${getStatusTone(owner.status)}`}>
                        {owner.status}
                      </span>
                    </td>
                    <td>{owner.customerCount}</td>
                    <td>{formatDisplayDate(owner.updatedAt)}</td>
                    <td>
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => syncFormWithOwner(owner)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="panel-empty">
            No gym owners match the current search. Try another filter or add a new
            record.
          </div>
        )}
      </section>

      <section className="form-layout">
        <form ref={formCardRef} className="panel-card form-card" onSubmit={handleSubmit}>
          <div className="panel-card__header">
            <h3>{formMode === "create" ? "Add gym owner" : "Edit gym owner"}</h3>
            <span className={`badge badge--${getStatusTone(form.status)}`}>{form.status}</span>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Gym ID</span>
              <input
                ref={gymIdInputRef}
                placeholder="GYM004"
                value={form.gymId}
                onChange={(event) => updateField("gymId", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Gym name</span>
              <input
                placeholder="Enter gym name"
                value={form.gymName}
                onChange={(event) => updateField("gymName", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Owner name</span>
              <input
                placeholder="Enter owner name"
                value={form.ownerName}
                onChange={(event) => updateField("ownerName", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Email</span>
              <input
                type="email"
                placeholder="owner@gym.com"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Phone</span>
              <input
                placeholder="Enter phone number"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
              />
            </label>

            <label className="field">
              <span>City</span>
              <input
                placeholder="Enter city"
                value={form.city}
                onChange={(event) => updateField("city", event.target.value)}
              />
            </label>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Status</span>
              <select
                value={form.status}
                onChange={(event) => updateField("status", event.target.value)}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>{formMode === "create" ? "Password" : "Reset password"}</span>
              <input
                type="password"
                placeholder={formMode === "create" ? "Set a password" : "Leave blank to keep"}
                value={form.password}
                onChange={(event) => updateField("password", event.target.value)}
              />
            </label>
          </div>

          <div className="form-actions">
            <button className="button" type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : formMode === "create"
                  ? "Create gym owner"
                  : "Save changes"}
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => {
                if (selectedOwner) {
                  syncFormWithOwner(selectedOwner);
                  return;
                }

                setFormMode("create");
                setForm(initialForm);
              }}
            >
              Reset form
            </button>
          </div>
        </form>

        <aside className="panel-card info-card">
          <div className="panel-card__header">
            <h3>Selected record</h3>
          </div>

          {selectedOwner ? (
            <div className="list-stack">
              <div className="info-card__row">
                <span>Gym</span>
                <strong>{selectedOwner.gymName}</strong>
              </div>
              <div className="info-card__row">
                <span>Owner</span>
                <strong>{selectedOwner.ownerName}</strong>
              </div>
              <div className="info-card__row">
                <span>Gym ID</span>
                <strong>{selectedOwner.gymId}</strong>
              </div>
              <div className="info-card__row">
                <span>Status</span>
                <strong>{selectedOwner.status}</strong>
              </div>
              <div className="info-card__row">
                <span>Customers linked</span>
                <strong>{selectedOwner.customerCount}</strong>
              </div>
              <div className="info-card__row">
                <span>Joined on</span>
                <strong>{formatDisplayDate(selectedOwner.joinedOn)}</strong>
              </div>
            </div>
          ) : (
            <div className="panel-empty">
              Pick an owner from the table or create a new record to start managing the
              network.
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
