const mongoose = require("mongoose");
const Gym = require("../models/Gym");
const Customer = require("../models/Customer");
const Counter = require("../models/Counter");
const Attendance = require("../models/Attendance");
const PasswordResetOtp = require("../models/PasswordResetOtp");
const {
  addDaysToDateString,
  formatDate,
  getTodayDate,
  parseDateOnly
} = require("../utils/date");
const { getPlanEnd } = require("../utils/plan");
const { normalizePhoneNumber } = require("../utils/otp");
const { hashPassword } = require("../utils/passwords");

let activeStore = null;
let storeMode = "MongoDB";

function mapGymOwnerRecord(gym, customerCount) {
  return {
    gymId: gym.gymId,
    gymName: gym.gymName,
    ownerName: gym.ownerName,
    email: gym.email,
    phone: gym.phone,
    city: gym.city,
    status: gym.status,
    joinedOn: gym.joinedOn,
    updatedAt: gym.updatedAt,
    customerCount
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getExpiringThresholdDate() {
  const threshold = new Date();
  threshold.setHours(0, 0, 0, 0);
  threshold.setDate(threshold.getDate() + 3);
  return formatDate(threshold);
}

function buildCustomerSearchFilter(query) {
  const normalizedQuery = String(query || "").trim();

  if (!normalizedQuery) {
    return null;
  }

  const regex = new RegExp(escapeRegex(normalizedQuery), "i");
  const filters = [
    { fullName: regex },
    { phone: regex },
    { email: regex }
  ];

  if (/^\d+$/.test(normalizedQuery)) {
    filters.push({ customerId: Number(normalizedQuery) });
  }

  return { $or: filters };
}

function buildCustomerStatusFilter(status) {
  const today = getTodayDate();
  const expiringThreshold = getExpiringThresholdDate();

  if (status === "Active") {
    return { planEnd: { $gt: expiringThreshold } };
  }

  if (status === "Expiring") {
    return { planEnd: { $gte: today, $lte: expiringThreshold } };
  }

  if (status === "Expired") {
    return { planEnd: { $lt: today } };
  }

  return null;
}

function buildCustomerDueAmountFilter(dueStatus) {
  if (dueStatus === "Pending") {
    return { dueAmount: { $gt: 0 } };
  }

  return null;
}

function buildCustomerListFilter(gymId, options = {}) {
  const filter = { gymId };
  const searchFilter = buildCustomerSearchFilter(options.query);
  const statusFilter = buildCustomerStatusFilter(options.status);
  const dueAmountFilter = buildCustomerDueAmountFilter(options.dueStatus);
  const appliedFilters = [searchFilter, statusFilter, dueAmountFilter].filter(Boolean);

  if (appliedFilters.length === 1) {
    Object.assign(filter, appliedFilters[0]);
    return filter;
  }

  if (appliedFilters.length > 1) {
    filter.$and = appliedFilters;
  }

  return filter;
}

function buildAttendanceListFilter(gymId, options = {}) {
  const filter = { gymId };
  const searchFilter = buildCustomerSearchFilter(options.query);

  if (searchFilter) {
    Object.assign(filter, searchFilter);
  }

  return filter;
}

function resolveRecordedOn(value, fallback = getTodayDate()) {
  if (!value) {
    return fallback;
  }

  if (typeof value === "string" && parseDateOnly(value)) {
    return value;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value);
  }

  return fallback;
}

function createMembershipEntry({
  plan,
  amountPaid,
  dueAmount = 0,
  planStart,
  planEnd,
  recordedOn = planStart || getTodayDate()
}) {
  return {
    plan,
    amountPaid,
    dueAmount,
    planStart,
    planEnd,
    recordedOn: resolveRecordedOn(recordedOn, planStart || getTodayDate())
  };
}

function getMembershipHistory(customer) {
  const existingHistory = Array.isArray(customer.membershipHistory)
    ? customer.membershipHistory.map((entry) => ({
        plan: entry.plan,
        amountPaid: entry.amountPaid,
        dueAmount: entry.dueAmount || 0,
        planStart: entry.planStart,
        planEnd: entry.planEnd,
        recordedOn: resolveRecordedOn(
          entry.recordedOn,
          entry.planStart || resolveRecordedOn(customer.createdAt)
        )
      }))
    : [];

  if (existingHistory.length) {
    return existingHistory;
  }

  if (!customer.plan || !customer.planStart || !customer.planEnd) {
    return [];
  }

  return [
    createMembershipEntry({
      plan: customer.plan,
      amountPaid: customer.amountPaid,
      dueAmount: customer.dueAmount || 0,
      planStart: customer.planStart,
      planEnd: customer.planEnd,
      recordedOn: resolveRecordedOn(customer.createdAt, customer.planStart)
    })
  ];
}

function syncCurrentMembershipHistory(customer) {
  const history = getMembershipHistory(customer);
  const currentEntry = createMembershipEntry({
    plan: customer.plan,
    amountPaid: customer.amountPaid,
    dueAmount: customer.dueAmount || 0,
    planStart: customer.planStart,
    planEnd: customer.planEnd,
    recordedOn:
      history[history.length - 1]?.recordedOn ||
      resolveRecordedOn(customer.updatedAt, customer.planStart)
  });

  if (history.length) {
    history[history.length - 1] = currentEntry;
  } else {
    history.push(currentEntry);
  }

  customer.membershipHistory = history;
}

function mapCustomerRecord(customer) {
  if (!customer) {
    return null;
  }

  return {
    ...customer,
    membershipHistory: getMembershipHistory(customer)
  };
}

function mapAttendanceRecord(customer) {
  if (!customer) {
    return null;
  }

  return {
    customerId: customer.customerId,
    fullName: customer.fullName,
    phone: customer.phone,
    plan: customer.plan,
    planEnd: customer.planEnd,
    lastAttended: customer.lastAttended
  };
}

function updateDueAmountState(customer, nextDueAmount, changedOn = getTodayDate()) {
  const previousDueAmount = Number(customer.dueAmount || 0);
  const normalizedDueAmount = Number(nextDueAmount || 0);

  customer.dueAmount = normalizedDueAmount;

  if (normalizedDueAmount <= 0) {
    customer.dueAmountUpdatedOn = "";
    customer.lastDueAmountReminderSentOn = "";
    return;
  }

  if (
    !customer.dueAmountUpdatedOn ||
    previousDueAmount !== normalizedDueAmount
  ) {
    customer.dueAmountUpdatedOn = changedOn;
  }

  if (previousDueAmount !== normalizedDueAmount) {
    customer.lastDueAmountReminderSentOn = "";
  }
}

function getDefaultRenewalStartDate(currentPlanEnd, today = getTodayDate()) {
  if (currentPlanEnd && currentPlanEnd >= today) {
    return addDaysToDateString(currentPlanEnd, 1);
  }

  return today;
}

function buildCustomerSummaryAggregate(gymId) {
  const today = getTodayDate();
  const expiringThreshold = getExpiringThresholdDate();

  return [
    {
      $match: { gymId }
    },
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        activeCount: {
          $sum: {
            $cond: [{ $gt: ["$planEnd", expiringThreshold] }, 1, 0]
          }
        },
        expiringCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ["$planEnd", today] },
                  { $lte: ["$planEnd", expiringThreshold] }
                ]
              },
              1,
              0
            ]
          }
        },
        expiredCount: {
          $sum: {
            $cond: [{ $lt: ["$planEnd", today] }, 1, 0]
          }
        },
        dueAmountCount: {
          $sum: {
            $cond: [{ $gt: ["$dueAmount", 0] }, 1, 0]
          }
        },
        totalDueAmount: {
          $sum: {
            $ifNull: ["$dueAmount", 0]
          }
        },
        attendedToday: {
          $sum: {
            $cond: [{ $eq: ["$lastAttended", today] }, 1, 0]
          }
        }
      }
    }
  ];
}

function buildPaymentEntriesPipeline(gymId) {
  return [
    {
      $match: { gymId }
    },
    {
      $project: {
        customerId: 1,
        fullName: 1,
        phone: 1,
        paymentEntries: {
          $cond: [
            {
              $gt: [
                {
                  $size: {
                    $ifNull: ["$membershipHistory", []]
                  }
                },
                0
              ]
            },
            "$membershipHistory",
            [
              {
                plan: "$plan",
                amountPaid: "$amountPaid",
                planStart: "$planStart",
                planEnd: "$planEnd",
                recordedOn: {
                  $ifNull: [
                    "$planStart",
                    {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$createdAt"
                      }
                    }
                  ]
                }
              }
            ]
          ]
        }
      }
    },
    {
      $unwind: "$paymentEntries"
    },
    {
      $addFields: {
        paymentMonthDate: {
          $ifNull: ["$paymentEntries.planStart", "$paymentEntries.recordedOn"]
        },
        paymentRecordedDate: {
          $ifNull: ["$paymentEntries.recordedOn", "$paymentEntries.planStart"]
        }
      }
    },
    {
      $match: {
        paymentMonthDate: {
          $regex: /^\d{4}-\d{2}-\d{2}$/
        }
      }
    }
  ];
}

const mongoStore = {
  async findUserByGymId(gymId) {
    return Gym.findOne({ gymId }).lean();
  },

  async findUserByEmail(email) {
    return Gym.findOne({ email }).lean();
  },

  async findUserByPhone(phone) {
    const normalizedPhone = normalizePhoneNumber(phone);
    const exactMatch = await Gym.findOne({ phone: normalizedPhone }).lean();

    if (exactMatch) {
      return exactMatch;
    }

    const users = await Gym.find({
      phone: { $exists: true, $ne: "" }
    }).lean();

    return (
      users.find((user) => normalizePhoneNumber(user.phone) === normalizedPhone) ||
      null
    );
  },

  async updateUserPassword(gymId, password) {
    await Gym.updateOne(
      { gymId },
      {
        $set: {
          password,
          passwordUpdatedAt: new Date()
        }
      }
    );
  },

  async countAdmins() {
    return Gym.countDocuments({ role: "admin" });
  },

  async createAdmin(payload) {
    const today = getTodayDate();
    const admin = await Gym.create({
      gymId: payload.gymId,
      role: "admin",
      name: payload.name,
      email: payload.email,
      password: await hashPassword(payload.password),
      passwordUpdatedAt: new Date(),
      phone: normalizePhoneNumber(payload.phone) || "",
      city: payload.city || "",
      status: "Active",
      joinedOn: today,
      updatedAt: today
    });

    return {
      role: admin.role,
      gymId: admin.gymId,
      email: admin.email,
      name: admin.name
    };
  },

  async isGymOwnerGymIdTaken(gymId, currentGymId = null) {
    const duplicateGym = await Gym.findOne({ role: "owner", gymId }).lean();
    return Boolean(duplicateGym && duplicateGym.gymId !== currentGymId);
  },

  async isGymOwnerEmailTaken(email, currentGymId = null) {
    const duplicateEmail = await Gym.findOne({ role: "owner", email }).lean();
    return Boolean(duplicateEmail && duplicateEmail.gymId !== currentGymId);
  },

  async listGymOwners() {
    const gyms = await Gym.find({ role: "owner" }).sort({ gymId: 1 }).lean();

    return Promise.all(
      gyms.map(async (gym) =>
        mapGymOwnerRecord(
          gym,
          await Customer.countDocuments({ gymId: gym.gymId })
        )
      )
    );
  },

  async createGymOwner(payload) {
    const today = getTodayDate();
    const gym = await Gym.create({
      ...payload,
      role: "owner",
      password: await hashPassword(payload.password),
      passwordUpdatedAt: new Date(),
      phone: normalizePhoneNumber(payload.phone),
      joinedOn: today,
      updatedAt: today
    });

    return mapGymOwnerRecord(gym.toObject(), 0);
  },

  async isCustomerPhoneTaken(phone, currentGymId = null, currentCustomerId = null) {
    const normalizedPhone = normalizePhoneNumber(phone);
    const duplicateCustomer = await Customer.findOne({ phone: normalizedPhone }).lean();

    if (!duplicateCustomer) {
      return false;
    }

    return !(
      duplicateCustomer.gymId === currentGymId &&
      duplicateCustomer.customerId === currentCustomerId
    );
  },

  async updateGymOwner(currentGymId, payload) {
    const gym = await Gym.findOne({ role: "owner", gymId: currentGymId });

    if (!gym) {
      return null;
    }

    gym.gymId = payload.gymId;
    gym.gymName = payload.gymName;
    gym.ownerName = payload.ownerName;
    gym.email = payload.email;
    gym.phone = normalizePhoneNumber(payload.phone);
    gym.city = payload.city;
    gym.status = payload.status;
    gym.updatedAt = getTodayDate();

    if (payload.password) {
      gym.password = await hashPassword(payload.password);
      gym.passwordUpdatedAt = new Date();
    }

    await gym.save();

    if (currentGymId !== payload.gymId) {
      const oldCounterKey = `customer:${currentGymId}`;
      const nextCounterKey = `customer:${payload.gymId}`;
      const existingCounter = await Counter.findOne({ key: oldCounterKey }).lean();
      const nextCounter = await Counter.findOne({ key: nextCounterKey }).lean();

      await Customer.updateMany(
        { gymId: currentGymId },
        { $set: { gymId: payload.gymId } }
      );
      await Attendance.updateMany(
        { gymId: currentGymId },
        { $set: { gymId: payload.gymId } }
      );
      await PasswordResetOtp.updateMany(
        { gymId: currentGymId },
        { $set: { gymId: payload.gymId } }
      );

      if (existingCounter || nextCounter) {
        await Counter.updateOne(
          { key: nextCounterKey },
          {
            $max: {
              seq: Math.max(existingCounter?.seq || 0, nextCounter?.seq || 0)
            }
          },
          { upsert: true }
        );
      }

      await Counter.deleteOne({ key: oldCounterKey });
    }

    return mapGymOwnerRecord(
      gym.toObject(),
      await Customer.countDocuments({ gymId: payload.gymId })
    );
  },

  async listCustomersByGymId(gymId) {
    const customers = await Customer.find({ gymId }).sort({ customerId: -1 }).lean();
    return customers.map(mapCustomerRecord);
  },

  async listCustomersPageByGymId(gymId, options = {}) {
    const requestedPage = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 10));
    const filter = buildCustomerListFilter(gymId, options);
    const totalItems = await Customer.countDocuments(filter);
    const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : 1;
    const page = Math.min(requestedPage, totalPages);
    const skip = (page - 1) * pageSize;
    const customers = await Customer.find(filter)
      .sort({ customerId: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    return {
      items: customers.map(mapCustomerRecord),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages
      }
    };
  },

  async listAttendancePageByGymId(gymId, options = {}) {
    const requestedPage = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 10));
    const filter = buildAttendanceListFilter(gymId, options);
    const totalItems = await Customer.countDocuments(filter);
    const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : 1;
    const page = Math.min(requestedPage, totalPages);
    const skip = (page - 1) * pageSize;
    const customers = await Customer.find(
      filter,
      {
        _id: 0,
        customerId: 1,
        fullName: 1,
        phone: 1,
        plan: 1,
        planEnd: 1,
        lastAttended: 1
      }
    )
      .sort({ customerId: 1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    return {
      items: customers.map(mapAttendanceRecord),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages
      }
    };
  },

  async getCustomerDirectorySummary(gymId) {
    const [summary] = await Customer.aggregate(buildCustomerSummaryAggregate(gymId));

    return {
      totalCustomers: summary?.totalCustomers || 0,
      activeCount: summary?.activeCount || 0,
      expiringCount: summary?.expiringCount || 0,
      expiredCount: summary?.expiredCount || 0,
      attendedToday: summary?.attendedToday || 0,
      dueAmountCount: summary?.dueAmountCount || 0,
      totalDueAmount: summary?.totalDueAmount || 0
    };
  },

  async getAttendanceSummary(gymId) {
    const [summary] = await Customer.aggregate(buildCustomerSummaryAggregate(gymId));

    return {
      totalCustomers: summary?.totalCustomers || 0,
      attendedToday: summary?.attendedToday || 0
    };
  },

  async syncCustomerMembershipStatuses(options = {}) {
    const today = options.today || getTodayDate();
    const expiringThreshold = options.expiringThreshold || addDaysToDateString(today, 3);
    const touchedGymIds = new Set();
    const updated = {
      Active: 0,
      Expiring: 0,
      Expired: 0
    };
    const syncRules = [
      {
        status: "Expired",
        filter: {
          planEnd: { $lt: today }
        }
      },
      {
        status: "Expiring",
        filter: {
          planEnd: { $gte: today, $lte: expiringThreshold }
        }
      },
      {
        status: "Active",
        filter: {
          planEnd: { $gt: expiringThreshold }
        }
      }
    ];

    for (const rule of syncRules) {
      const filter = {
        ...rule.filter,
        status: { $ne: rule.status }
      };
      const gymIds = await Customer.distinct("gymId", filter);
      const result = await Customer.updateMany(filter, {
        $set: {
          status: rule.status
        }
      });

      updated[rule.status] = result.modifiedCount || 0;
      gymIds.forEach((gymId) => touchedGymIds.add(gymId));
    }

    return {
      today,
      expiringThreshold,
      updated,
      touchedGymIds: [...touchedGymIds]
    };
  },

  async getDashboardSnapshot(gymId) {
    const [summary, latestMembers, recentAttendance] = await Promise.all([
      this.getCustomerDirectorySummary(gymId),
      Customer.find(
        { gymId },
        {
          _id: 0,
          customerId: 1,
          fullName: 1,
          plan: 1,
          planEnd: 1
        }
      )
        .sort({ customerId: -1 })
        .limit(4)
        .lean(),
      Customer.find(
        {
          gymId,
          lastAttended: { $exists: true, $ne: "" }
        },
        {
          _id: 0,
          customerId: 1,
          fullName: 1,
          lastAttended: 1
        }
      )
        .sort({ lastAttended: -1, customerId: -1 })
        .limit(5)
        .lean()
    ]);

    return {
      summary: {
        totalCustomers: summary.totalCustomers,
        activeCount: summary.activeCount,
        expiringCount: summary.expiringCount,
        expiredCount: summary.expiredCount,
        attendedToday: summary.attendedToday || 0
      },
      latestMembers: latestMembers.map((customer) => ({
        customerId: customer.customerId,
        fullName: customer.fullName,
        plan: customer.plan,
        planEnd: customer.planEnd
      })),
      recentAttendance: recentAttendance.map((customer) => ({
        customerId: customer.customerId,
        fullName: customer.fullName,
        lastAttended: customer.lastAttended
      }))
    };
  },

  async listPaymentEntriesPageByGymId(gymId, options = {}) {
    const requestedPage = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 10));
    const selectedMonth =
      typeof options.month === "string" && options.month && options.month !== "__all__"
        ? options.month
        : "__all__";

    const monthsRaw = await Customer.aggregate([
      ...buildPaymentEntriesPipeline(gymId),
      {
        $group: {
          _id: {
            $substrBytes: ["$paymentMonthDate", 0, 7]
          },
          totalAmount: {
            $sum: "$paymentEntries.amountPaid"
          },
          paymentCount: {
            $sum: 1
          }
        }
      },
      {
        $sort: {
          _id: -1
        }
      }
    ]);

    const months = monthsRaw.map((month) => ({
      monthKey: month._id,
      totalAmount: month.totalAmount,
      paymentCount: month.paymentCount
    }));
    const selectedMonthSummary =
      selectedMonth === "__all__"
        ? null
        : months.find((month) => month.monthKey === selectedMonth) || null;
    const totalCollectedAcrossMonths = months.reduce(
      (sum, month) => sum + (month.totalAmount || 0),
      0
    );
    const allPaymentsCount = months.reduce(
      (sum, month) => sum + (month.paymentCount || 0),
      0
    );
    const selectedPaymentCount =
      selectedMonth === "__all__"
        ? allPaymentsCount
        : selectedMonthSummary?.paymentCount || 0;
    const selectedTotalAmount =
      selectedMonth === "__all__"
        ? totalCollectedAcrossMonths
        : selectedMonthSummary?.totalAmount || 0;
    const totalItems = selectedPaymentCount;
    const totalPages = totalItems ? Math.ceil(totalItems / pageSize) : 1;
    const page = Math.min(requestedPage, totalPages);
    const skip = (page - 1) * pageSize;
    const paymentFilters =
      selectedMonth === "__all__"
        ? []
        : [
            {
              $match: {
                paymentMonthDate: {
                  $regex: new RegExp(`^${escapeRegex(selectedMonth)}`)
                }
              }
            }
          ];

    const items = await Customer.aggregate([
      ...buildPaymentEntriesPipeline(gymId),
      ...paymentFilters,
      {
        $sort: {
          paymentMonthDate: -1,
          paymentRecordedDate: -1,
          customerId: -1
        }
      },
      {
        $skip: skip
      },
      {
        $limit: pageSize
      },
      {
        $project: {
          _id: 0,
          entryId: {
            $concat: [
              {
                $toString: "$customerId"
              },
              "-",
              {
                $ifNull: ["$paymentMonthDate", "month"]
              },
              "-",
              {
                $ifNull: ["$paymentRecordedDate", "recorded"]
              },
              "-",
              {
                $ifNull: ["$paymentEntries.plan", "plan"]
              }
            ]
          },
          customerId: 1,
          fullName: 1,
          phone: 1,
          plan: "$paymentEntries.plan",
          amountPaid: "$paymentEntries.amountPaid",
          planStart: "$paymentEntries.planStart",
          planEnd: "$paymentEntries.planEnd",
          recordedOn: "$paymentRecordedDate"
        }
      }
    ]);

    return {
      items,
      months,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages
      },
      summary: {
        selectedPaymentCount,
        selectedTotalAmount,
        totalCollectedAcrossMonths,
        averagePayment: selectedPaymentCount
          ? Math.round(selectedTotalAmount / selectedPaymentCount)
          : 0
      }
    };
  },

  async findCustomerByGymIdAndId(gymId, customerId) {
    const customer = await Customer.findOne({
      gymId,
      customerId: Number(customerId)
    }).lean();

    return mapCustomerRecord(customer);
  },

  async createCustomer(gymId, payload) {
    const planStart = payload.planStart || getTodayDate();
    const counter = await Counter.findOneAndUpdate(
      { key: `customer:${gymId}` },
      { $inc: { seq: 1 } },
      {
        new: true,
        upsert: true
      }
    ).lean();
    const customer = await Customer.create({
      gymId,
      customerId: counter.seq,
      fullName: payload.fullName,
      phone: normalizePhoneNumber(payload.phone),
      email: payload.email || "",
      age: payload.age,
      plan: payload.plan,
      amountPaid: payload.amountPaid,
      dueAmount: payload.dueAmount || 0,
      planStart,
      planEnd: payload.planEnd || getPlanEnd(planStart, payload.plan),
      lastAttended: "",
      dueAmountUpdatedOn: (payload.dueAmount || 0) > 0 ? getTodayDate() : "",
      lastDueAmountReminderSentOn: "",
      photo: payload.photo || "",
      status: "Active",
      membershipHistory: [
        createMembershipEntry({
          plan: payload.plan,
          amountPaid: payload.amountPaid,
          dueAmount: payload.dueAmount || 0,
          planStart,
          planEnd: payload.planEnd || getPlanEnd(planStart, payload.plan),
          recordedOn: payload.recordedOn || planStart
        })
      ]
    });

    return mapCustomerRecord(customer.toObject());
  },

  async updateCustomer(gymId, customerId, payload) {
    const customer = await Customer.findOne({
      gymId,
      customerId: Number(customerId)
    });

    if (!customer) {
      return null;
    }

    const previousPlan = customer.plan;
    const nextPlan = payload.plan || customer.plan;
    const resolvedPlanStart =
      payload.planStart || customer.planStart || getTodayDate();
    const resolvedPlanEnd =
      payload.planEnd ||
      customer.planEnd ||
      getPlanEnd(resolvedPlanStart, nextPlan);
    const resolvedLastAttended =
      payload.lastAttended !== undefined
        ? payload.lastAttended
        : customer.lastAttended || "";

    customer.fullName = payload.fullName;
    customer.phone = normalizePhoneNumber(payload.phone);
    customer.email = payload.email !== undefined ? payload.email : customer.email || "";
    customer.age = payload.age;
    customer.plan = nextPlan;
    customer.amountPaid = payload.amountPaid;
    updateDueAmountState(customer, payload.dueAmount, getTodayDate());
    customer.planStart = resolvedPlanStart;
    customer.planEnd =
      payload.planEnd !== undefined
        ? resolvedPlanEnd
        : !customer.planEnd || nextPlan !== previousPlan
          ? getPlanEnd(customer.planStart, nextPlan)
          : customer.planEnd;
    customer.lastAttended = resolvedLastAttended;
    customer.photo = payload.photo !== undefined ? payload.photo : customer.photo || "";
    syncCurrentMembershipHistory(customer);

    await customer.save();

    return mapCustomerRecord(customer.toObject());
  },

  async renewCustomer(gymId, customerId, payload) {
    const customer = await Customer.findOne({
      gymId,
      customerId: Number(customerId)
    });

    if (!customer) {
      return null;
    }

    const planStart =
      payload.planStart || getDefaultRenewalStartDate(customer.planEnd, getTodayDate());
    const planEnd = payload.planEnd || getPlanEnd(planStart, payload.plan);
    const membershipHistory = getMembershipHistory(customer);

    membershipHistory.push(
        createMembershipEntry({
          plan: payload.plan,
          amountPaid: payload.amountPaid,
          dueAmount: payload.dueAmount || 0,
          planStart,
          planEnd,
          recordedOn: payload.recordedOn || planStart
        })
    );

    customer.plan = payload.plan;
    customer.amountPaid = payload.amountPaid;
    updateDueAmountState(customer, payload.dueAmount, getTodayDate());
    customer.planStart = planStart;
    customer.planEnd = planEnd;
    customer.status = "Active";
    customer.membershipHistory = membershipHistory;

    await customer.save();

    return mapCustomerRecord(customer.toObject());
  },

  async deleteCustomer(gymId, customerId) {
    const customer = await Customer.findOneAndDelete({
      gymId,
      customerId: Number(customerId)
    }).lean();

    if (customer) {
      await Attendance.deleteMany({
        gymId,
        customerId: Number(customerId)
      });
    }

    return mapCustomerRecord(customer);
  },

  async recordAttendance(gymId, customerId, options = {}) {
    const customer = await Customer.findOne({
      gymId,
      customerId: Number(customerId)
    });

    if (!customer) {
      return null;
    }

    const today = getTodayDate();
    const result = await Attendance.updateOne(
      {
        gymId,
        customerId: Number(customerId),
        attendedOn: today
      },
      {
        $setOnInsert: {
          gymId,
          customerId: Number(customerId),
          attendedOn: today,
          source: options.source === "qr" ? "qr" : "manual",
          recordedAt: new Date()
        }
      },
      {
        upsert: true
      }
    );
    const attendanceRecorded = result.upsertedCount > 0;

    if (attendanceRecorded || customer.lastAttended !== today) {
      customer.lastAttended = today;
      await customer.save();
    }

    return {
      attendanceRecorded,
      customer: mapCustomerRecord(customer.toObject())
    };
  }
};

async function ensureIndexes() {
  await Promise.all([
    Gym.createIndexes(),
    Customer.createIndexes(),
    Counter.createIndexes(),
    Attendance.createIndexes(),
    PasswordResetOtp.createIndexes()
  ]);
}

async function syncCustomerCounters() {
  const groupedCustomers = await Customer.aggregate([
    {
      $group: {
        _id: "$gymId",
        maxCustomerId: { $max: "$customerId" }
      }
    }
  ]);

  await Promise.all(
    groupedCustomers.map((group) =>
      Counter.updateOne(
        { key: `customer:${group._id}` },
        {
          $max: {
            seq: Number(group.maxCustomerId) || 0
          }
        },
        { upsert: true }
      )
    )
  );
}

async function backfillAttendanceHistory() {
  const customersWithAttendance = await Customer.find({
    lastAttended: { $exists: true, $ne: "" }
  }).lean();

  for (const customer of customersWithAttendance) {
    await Attendance.updateOne(
      {
        gymId: customer.gymId,
        customerId: customer.customerId,
        attendedOn: customer.lastAttended
      },
      {
        $setOnInsert: {
          gymId: customer.gymId,
          customerId: customer.customerId,
          attendedOn: customer.lastAttended,
          source: "manual",
          recordedAt: customer.updatedAt || customer.createdAt || new Date()
        }
      },
      {
        upsert: true
      }
    );
  }
}

async function migrateGymsCollectionIfNeeded() {
  const db = mongoose.connection.db;

  if (!db) {
    return;
  }

  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const collectionNames = new Set(collections.map((collection) => collection.name));

  if (!collectionNames.has("gyms")) {
    return;
  }

  const usersCollection = db.collection("users");
  const usersCount = collectionNames.has("users")
    ? await usersCollection.countDocuments()
    : 0;

  if (usersCount > 0) {
    return;
  }

  const legacyGymDocuments = await db.collection("gyms").find({}).toArray();

  if (!legacyGymDocuments.length) {
    return;
  }

  await usersCollection.insertMany(legacyGymDocuments, { ordered: true });
  console.log("Migrated existing documents from 'gyms' to 'users'.");
}

async function configureStore(options = {}) {
  const { mode = "local" } = options;
  activeStore = mongoStore;
  storeMode =
    mode === "remote"
      ? "MongoDB via MONGO_URI"
      : "local MongoDB on 127.0.0.1:27017/fitLedger";
  await migrateGymsCollectionIfNeeded();
  await ensureIndexes();
  await syncCustomerCounters();
  await backfillAttendanceHistory();
}

function getStore() {
  if (!activeStore) {
    throw new Error("The data store has not been configured yet.");
  }

  return activeStore;
}

function getStoreMode() {
  return storeMode;
}

module.exports = {
  configureStore,
  getStore,
  getStoreMode
};
