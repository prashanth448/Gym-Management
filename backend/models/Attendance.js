const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    gymId: { type: String, required: true, index: true },
    customerId: { type: Number, required: true },
    attendedOn: { type: String, required: true },
    source: { type: String, enum: ["manual", "qr"], default: "manual" },
    recordedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true
  }
);

schema.index({ gymId: 1, customerId: 1, attendedOn: 1 }, { unique: true });
schema.index({ gymId: 1, attendedOn: 1 });

module.exports = mongoose.model("Attendance", schema);
