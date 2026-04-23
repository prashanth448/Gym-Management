
const router = require("express").Router();
const auth = require("../middleware/auth");
const { getStore } = require("../data/store");
const { emitAdminDataChanged, emitGymDataChanged } = require("../realtime");
const { parseDateOnly } = require("../utils/date");
const { getPlanEnd, isValidPlan } = require("../utils/plan");
const { isValidPhoneNumber, normalizePhoneNumber } = require("../utils/otp");

function requireOwner(req, res) {
  if (req.user.role !== "owner") {
    res.status(403).json({ message: "Owner access required." });
    return false;
  }

  return true;
}

function parseOptionalNumber(value) {
  return value === undefined || value === null || value === "" ? undefined : Number(value);
}

function validateCustomerPayload(payload, options = {}) {
  const { partial = false } = options;
  const requiredFields = ["fullName", "phone", "age", "plan", "amountPaid", "planStart"];

  if (
    !partial &&
    requiredFields.some((field) => payload[field] === undefined || payload[field] === "")
  ) {
    return "Please fill in name, phone, age, membership plan, and amount paid before saving.";
  }

  if (payload.fullName !== undefined && !String(payload.fullName).trim()) {
    return "Customer name is required.";
  }

  if (payload.phone !== undefined && !String(payload.phone).trim()) {
    return "Phone number is required.";
  }

  if (payload.phone !== undefined && !isValidPhoneNumber(payload.phone)) {
    return "Enter a valid mobile number with 10 to 15 digits.";
  }

  if (payload.plan !== undefined && !isValidPlan(payload.plan)) {
    return "Choose a valid membership plan.";
  }

  if (payload.age !== undefined) {
    if (!Number.isInteger(payload.age) || payload.age < 1 || payload.age > 120) {
      return "Age must be a whole number between 1 and 120.";
    }
  }

  if (payload.amountPaid !== undefined) {
    if (!Number.isFinite(payload.amountPaid) || payload.amountPaid < 0) {
      return "Amount paid must be 0 or more.";
    }
  }

  if (payload.planStart !== undefined && payload.planStart !== "" && !parseDateOnly(payload.planStart)) {
    return "Plan start must be a valid date.";
  }

  if (payload.planEnd !== undefined && payload.planEnd !== "" && !parseDateOnly(payload.planEnd)) {
    return "Plan end must be a valid date.";
  }

  if (
    payload.lastAttended !== undefined &&
    payload.lastAttended !== "" &&
    !parseDateOnly(payload.lastAttended)
  ) {
    return "Last attended must be a valid date.";
  }

  if (payload.recordedOn !== undefined && payload.recordedOn !== "" && !parseDateOnly(payload.recordedOn)) {
    return "Payment date must be a valid date.";
  }

  const planStart = payload.planStart;
  const planEnd =
    payload.planEnd !== undefined
      ? payload.planEnd
      : payload.planStart && payload.plan
        ? getPlanEnd(payload.planStart, payload.plan)
        : undefined;

  if (planStart && planEnd && parseDateOnly(planEnd) < parseDateOnly(planStart)) {
    return "Plan end cannot be earlier than plan start.";
  }

  return "";
}

function validateRenewalPayload(payload) {
  const requiredFields = ["plan", "amountPaid", "planStart"];

  if (requiredFields.some((field) => payload[field] === undefined || payload[field] === "")) {
    return "Please fill in membership plan, amount paid, and plan start before renewing.";
  }

  if (payload.plan !== undefined && !isValidPlan(payload.plan)) {
    return "Choose a valid membership plan.";
  }

  if (payload.amountPaid !== undefined) {
    if (!Number.isFinite(payload.amountPaid) || payload.amountPaid < 0) {
      return "Amount paid must be 0 or more.";
    }
  }

  if (payload.planStart !== undefined && payload.planStart !== "" && !parseDateOnly(payload.planStart)) {
    return "Plan start must be a valid date.";
  }

  if (payload.planEnd !== undefined && payload.planEnd !== "" && !parseDateOnly(payload.planEnd)) {
    return "Plan end must be a valid date.";
  }

  if (payload.recordedOn !== undefined && payload.recordedOn !== "" && !parseDateOnly(payload.recordedOn)) {
    return "Payment date must be a valid date.";
  }

  const planEnd =
    payload.planEnd !== undefined
      ? payload.planEnd
      : payload.planStart && payload.plan
        ? getPlanEnd(payload.planStart, payload.plan)
        : undefined;

  if (payload.planStart && planEnd && parseDateOnly(planEnd) < parseDateOnly(payload.planStart)) {
    return "Plan end cannot be earlier than plan start.";
  }

  return "";
}

router.get("/", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const hasPaginationRequest =
    req.query.page !== undefined || req.query.pageSize !== undefined;

  if (hasPaginationRequest) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
    const query = String(req.query.query || "").trim();
    const status = String(req.query.status || "All").trim();

    const [directory, summary] = await Promise.all([
      getStore().listCustomersPageByGymId(req.user.gymId, {
        page,
        pageSize,
        query,
        status
      }),
      getStore().getCustomerDirectorySummary(req.user.gymId)
    ]);

    return res.json({
      items: directory.items,
      pagination: directory.pagination,
      summary
    });
  }

  const data = await getStore().listCustomersByGymId(req.user.gymId);
  res.json(data);
});

router.get("/attendance", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 10));
  const query = String(req.query.query || "").trim();

  const [directory, summary] = await Promise.all([
    getStore().listAttendancePageByGymId(req.user.gymId, {
      page,
      pageSize,
      query
    }),
    getStore().getAttendanceSummary(req.user.gymId)
  ]);

  res.json({
    items: directory.items,
    pagination: directory.pagination,
    summary
  });
});

router.get("/:customerId", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const customer = await getStore().findCustomerByGymIdAndId(
    req.user.gymId,
    req.params.customerId
  );

  if (!customer) {
    return res.status(404).json({ message: "Not found" });
  }

  res.json(customer);
});

router.post("/", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const payload = {
    fullName: req.body.fullName?.trim(),
    phone: normalizePhoneNumber(req.body.phone),
    age: parseOptionalNumber(req.body.age),
    plan: req.body.plan,
    amountPaid: parseOptionalNumber(req.body.amountPaid),
    planStart: req.body.planStart?.trim(),
    planEnd: req.body.planEnd?.trim(),
    recordedOn: req.body.recordedOn?.trim(),
    photo: req.body.photo
  };

  const message = validateCustomerPayload(payload);

  if (message) {
    return res.status(400).json({ message });
  }

  if (await getStore().isCustomerPhoneTaken(payload.phone)) {
    return res.status(400).json({
      message: "That mobile number is already registered to another member."
    });
  }

  const c = await getStore().createCustomer(req.user.gymId, payload);
  emitAdminDataChanged("customer-created", { gymId: req.user.gymId });
  emitGymDataChanged(req.user.gymId, "customer-created");
  res.status(201).json(c);
});

router.put("/:customerId", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  try {
    const payload = {
      fullName: req.body.fullName?.trim(),
      phone: normalizePhoneNumber(req.body.phone),
      age: parseOptionalNumber(req.body.age),
      plan: req.body.plan,
      amountPaid: parseOptionalNumber(req.body.amountPaid),
      planStart: req.body.planStart?.trim(),
      planEnd: req.body.planEnd?.trim(),
      recordedOn: req.body.recordedOn?.trim(),
      lastAttended:
        req.body.lastAttended === "" ? "" : req.body.lastAttended?.trim(),
      photo: req.body.photo
    };

    const message = validateCustomerPayload(payload);

    if (message) {
      return res.status(400).json({ message });
    }

    if (
      await getStore().isCustomerPhoneTaken(
        payload.phone,
        req.user.gymId,
        Number(req.params.customerId)
      )
    ) {
      return res.status(400).json({
        message: "That mobile number is already registered to another member."
      });
    }

    const c = await getStore().updateCustomer(
      req.user.gymId,
      req.params.customerId,
      payload
    );

    if (!c) {
      return res.status(404).json({ message: "Customer not found." });
    }

    emitGymDataChanged(req.user.gymId, "customer-updated");
    res.json(c);
  } catch (error) {
    console.error("Unable to update customer.", error);
    res.status(500).json({ message: "Unable to update customer details." });
  }
});

router.delete("/:customerId", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  try {
    const customer = await getStore().deleteCustomer(
      req.user.gymId,
      req.params.customerId
    );

    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    emitAdminDataChanged("customer-deleted", { gymId: req.user.gymId });
    emitGymDataChanged(req.user.gymId, "customer-deleted");
    res.json({
      message: `${customer.fullName} was deleted successfully.`,
      customer
    });
  } catch (error) {
    console.error("Unable to delete customer.", error);
    res.status(500).json({ message: "Unable to delete this customer." });
  }
});

router.post("/:customerId/renew", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  try {
    const payload = {
      plan: req.body.plan,
      amountPaid: parseOptionalNumber(req.body.amountPaid),
      planStart: req.body.planStart?.trim(),
      planEnd: req.body.planEnd?.trim(),
      recordedOn: req.body.recordedOn?.trim()
    };

    const message = validateRenewalPayload(payload);

    if (message) {
      return res.status(400).json({ message });
    }

    const customer = await getStore().renewCustomer(
      req.user.gymId,
      req.params.customerId,
      payload
    );

    if (!customer) {
      return res.status(404).json({ message: "Customer not found." });
    }

    emitGymDataChanged(req.user.gymId, "customer-renewed");
    res.json(customer);
  } catch (error) {
    console.error("Unable to renew customer membership.", error);
    res.status(500).json({ message: "Unable to renew this membership." });
  }
});

router.post("/attendance", auth, async (req, res) => {
  if (!requireOwner(req, res)) {
    return;
  }

  const customerId = Number(req.body.customerId);

  if (!Number.isInteger(customerId) || customerId < 1) {
    return res.status(400).json({ message: "A valid customer ID is required." });
  }

  const c = await getStore().recordAttendance(
    req.user.gymId,
    customerId
  );

  if (!c) return res.status(404).json({ message: "Not found" });

  emitGymDataChanged(req.user.gymId, "attendance-recorded");
  res.json(c);
});

module.exports = router;
