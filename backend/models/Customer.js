const mongoose = require("mongoose");

const membershipHistorySchema = new mongoose.Schema(
  {
    plan: { type: String, required: true },
    amountPaid: { type: Number, required: true, min: 0 },
    planStart: { type: String, required: true },
    planEnd: { type: String, required: true },
    recordedOn: { type: String, required: true }
  },
  {
    _id: false
  }
);

const schema = new mongoose.Schema(
  {
    gymId: { type: String, required: true, index: true },
    customerId: { type: Number, required: true },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    age: { type: Number, required: true, min: 1 },
    plan: { type: String, required: true },
    amountPaid: { type: Number, required: true, min: 0 },
    planStart: { type: String, required: true },
    planEnd: { type: String, required: true },
    lastAttended: { type: String, default: "" },
    photo: { type: String, default: "" },
    status: { type: String, default: "Active" },
    membershipHistory: { type: [membershipHistorySchema], default: [] }
  },
  {
    timestamps: true
  }
);

schema.index({ gymId: 1, customerId: 1 }, { unique: true });
schema.index({ phone: 1 }, { unique: true });

module.exports = mongoose.model("Customer", schema);
