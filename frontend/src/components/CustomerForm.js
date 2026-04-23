import { PLAN_OPTIONS, formatDisplayDate, getPlanEndDate } from "../utils/membership";
import CustomerPhotoField from "./CustomerPhotoField";

export const emptyCustomerForm = {
  fullName: "",
  phone: "",
  age: "",
  plan: PLAN_OPTIONS[0],
  amountPaid: "",
  planStart: "",
  planEnd: "",
  lastAttended: "",
  photo: ""
};

export function normalizeCustomerForm(customer) {
  if (!customer) {
    return emptyCustomerForm;
  }

  return {
    fullName: customer.fullName || "",
    phone: customer.phone || "",
    age: customer.age ? String(customer.age) : "",
    plan: customer.plan || PLAN_OPTIONS[0],
    amountPaid:
      customer.amountPaid === 0 || customer.amountPaid
        ? String(customer.amountPaid)
        : "",
    planStart: customer.planStart || "",
    planEnd: customer.planEnd || "",
    lastAttended: customer.lastAttended || "",
    photo: customer.photo || ""
  };
}

export default function CustomerForm({
  title,
  form,
  error,
  saving,
  submitLabel,
  savingLabel,
  onSubmit,
  onChange,
  onPhotoChange,
  secondaryAction,
  secondaryLabel,
  previewStartDate
}) {
  const resolvedPreviewStartDate = form.planStart || previewStartDate;
  const previewEndDate = getPlanEndDate(resolvedPreviewStartDate, form.plan);

  const updateField = (key, value) => {
    onChange(key, value);
  };

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <h2>{title}</h2>
        </div>
      </section>

      <section className="form-layout">
        <form className="panel-card form-card" onSubmit={onSubmit}>
          <div className="panel-card__header">
            <h3>Member details</h3>
          </div>

          {error ? <div className="status-banner status-banner--error">{error}</div> : null}

          <div className="form-grid">
            <label className="field">
              <span>Full name *</span>
              <input
                required
                placeholder="Enter member name"
                value={form.fullName}
                onChange={(event) => updateField("fullName", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Mobile number *</span>
              <input
                required
                inputMode="numeric"
                pattern="[0-9]{10,15}"
                placeholder="Enter 10 to 15 digit mobile number"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Age *</span>
              <input
                required
                type="number"
                min="1"
                placeholder="Enter age"
                value={form.age}
                onChange={(event) => updateField("age", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Amount paid *</span>
              <input
                required
                type="number"
                min="0"
                placeholder="Enter amount paid"
                value={form.amountPaid}
                onChange={(event) => updateField("amountPaid", event.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span>Membership plan *</span>
            <select
              required
              value={form.plan}
              onChange={(event) => updateField("plan", event.target.value)}
            >
              {PLAN_OPTIONS.map((plan) => (
                <option key={plan} value={plan}>
                  {plan}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Plan start date *</span>
            <input
              required
              type="date"
              value={form.planStart}
              onChange={(event) => updateField("planStart", event.target.value)}
            />
          </label>

          <CustomerPhotoField
            photo={form.photo}
            fullName={form.fullName}
            onChange={(value) => onPhotoChange?.(value)}
          />

          <div className="form-actions">
            <button className="button" type="submit" disabled={saving}>
              {saving ? savingLabel : submitLabel}
            </button>
            {secondaryAction ? (
              <button
                className="button button--ghost"
                type="button"
                onClick={secondaryAction}
                disabled={saving}
              >
                {secondaryLabel}
              </button>
            ) : null}
          </div>
        </form>

        <aside className="panel-card info-card">
          <div className="panel-card__header">
            <h3>Membership preview</h3>
          </div>

          <div className="info-card__row">
            <span>Selected plan</span>
            <strong>{form.plan}</strong>
          </div>
          <div className="info-card__row">
            <span>Starts on</span>
            <strong>{formatDisplayDate(resolvedPreviewStartDate)}</strong>
          </div>
          <div className="info-card__row">
            <span>Expected end date</span>
            <strong>{formatDisplayDate(previewEndDate)}</strong>
          </div>
        </aside>
      </section>
    </div>
  );
}
