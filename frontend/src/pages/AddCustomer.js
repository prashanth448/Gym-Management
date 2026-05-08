import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CustomerForm, { emptyCustomerForm } from "../components/CustomerForm";
import API, { getApiError } from "../services/api";
import { getTodayDateString } from "../utils/membership";

function createInitialForm() {
  return {
    ...emptyCustomerForm,
    planStart: getTodayDateString()
  };
}

function buildCustomerCreateMessage(customer, fallbackName) {
  const fullName = customer?.fullName || fallbackName;
  return `${fullName} was added successfully.`;
}

export default function AddCustomer() {
  const navigate = useNavigate();
  const [form, setForm] = useState(createInitialForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handlePhotoChange = (photo) => {
    updateField("photo", photo);
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (
      !form.fullName ||
      !form.phone ||
      !form.age ||
      form.amountPaid === "" ||
      !form.planStart
    ) {
      setError(
        "Please fill in full name, mobile number, age, amount paid, and plan start date before saving."
      );
      return;
    }

    setSaving(true);

    try {
      const response = await API.post("/customers", {
        ...form,
        age: Number(form.age),
        amountPaid: Number(form.amountPaid),
        dueAmount: Number(form.dueAmount || 0)
      });

      navigate("/customers", {
        state: { message: buildCustomerCreateMessage(response.data, form.fullName) }
      });
    } catch (requestError) {
      setError(getApiError(requestError, "Unable to add this customer."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <CustomerForm
      title="Add Customer"
      form={form}
      error={error}
      saving={saving}
      submitLabel="Create customer"
      savingLabel="Saving..."
      onSubmit={handleSubmit}
      onChange={updateField}
      onPhotoChange={handlePhotoChange}
      secondaryAction={() => setForm(createInitialForm())}
      secondaryLabel="Reset form"
      previewStartDate={getTodayDateString()}
    />
  );
}
