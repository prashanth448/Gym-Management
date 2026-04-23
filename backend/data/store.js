const mongoose = require("mongoose");
const Gym = require("../models/Gym");
const Customer = require("../models/Customer");
const Counter = require("../models/Counter");
const PasswordResetOtp = require("../models/PasswordResetOtp");
const { formatDate, getTodayDate, parseDateOnly } = require("../utils/date");
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
    { phone: regex }
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

function buildCustomerListFilter(gymId, options = {}) {
  const filter = { gymId };
  const searchFilter = buildCustomerSearchFilter(options.query);
  const statusFilter = buildCustomerStatusFilter(options.status);

  if (searchFilter && statusFilter) {
    filter.$and = [searchFilter, statusFilter];
    return filter;
  }

  if (searchFilter) {
    Object.assign(filter, searchFilter);
  }

  if (statusFilter) {
    Object.assign(filter, statusFilter);
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
  planStart,
  planEnd,
  recordedOn = planStart || getTodayDate()
}) {
  return {
    plan,
    amountPaid,
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
    await Gym.updateOne({ gymId }, { $set: { password } });
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
    }

    await gym.save();

    if (currentGymId !== payload.gymId) {
      await Customer.updateMany(
        { gymId: currentGymId },
        { $set: { gymId: payload.gymId } }
      );
    }

    return mapGymOwnerRecord(
      gym.toObject(),
      await Customer.countDocuments({ gymId: payload.gymId })
    );
  },

  async listCustomersByGymId(gymId) {
    const customers = await Customer.find({ gymId }).sort({ customerId: 1 }).lean();
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
      .sort({ customerId: 1 })
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
    const today = getTodayDate();
    const expiringThreshold = getExpiringThresholdDate();

    const [totalCustomers, activeCount, expiringCount, expiredCount] = await Promise.all([
      Customer.countDocuments({ gymId }),
      Customer.countDocuments({
        gymId,
        planEnd: { $gt: expiringThreshold }
      }),
      Customer.countDocuments({
        gymId,
        planEnd: { $gte: today, $lte: expiringThreshold }
      }),
      Customer.countDocuments({
        gymId,
        planEnd: { $lt: today }
      })
    ]);

    return {
      totalCustomers,
      activeCount,
      expiringCount,
      expiredCount
    };
  },

  async getAttendanceSummary(gymId) {
    const today = getTodayDate();
    const [totalCustomers, attendedToday] = await Promise.all([
      Customer.countDocuments({ gymId }),
      Customer.countDocuments({ gymId, lastAttended: today })
    ]);

    return {
      totalCustomers,
      attendedToday
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
      age: payload.age,
      plan: payload.plan,
      amountPaid: payload.amountPaid,
      planStart,
      planEnd: payload.planEnd || getPlanEnd(planStart, payload.plan),
      lastAttended: "",
      photo: payload.photo || "",
      status: "Active",
      membershipHistory: [
        createMembershipEntry({
          plan: payload.plan,
          amountPaid: payload.amountPaid,
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
    customer.age = payload.age;
    customer.plan = nextPlan;
    customer.amountPaid = payload.amountPaid;
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

    const planStart = payload.planStart || customer.planEnd || getTodayDate();
    const planEnd = payload.planEnd || getPlanEnd(planStart, payload.plan);
    const membershipHistory = getMembershipHistory(customer);

    membershipHistory.push(
        createMembershipEntry({
          plan: payload.plan,
          amountPaid: payload.amountPaid,
          planStart,
          planEnd,
          recordedOn: payload.recordedOn || planStart
        })
    );

    customer.plan = payload.plan;
    customer.amountPaid = payload.amountPaid;
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

    return mapCustomerRecord(customer);
  },

  async recordAttendance(gymId, customerId) {
    const customer = await Customer.findOne({
      gymId,
      customerId: Number(customerId)
    });

    if (!customer) {
      return null;
    }

    const today = getTodayDate();
    customer.lastAttended = today;
    await customer.save();

    return mapCustomerRecord(customer.toObject());
  }
};

async function ensureIndexes() {
  await Promise.all([
    Gym.createIndexes(),
    Customer.createIndexes(),
    Counter.createIndexes(),
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
