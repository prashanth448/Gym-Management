
const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    gymId: { type: String, required: true, unique: true },
    role: { type: String, enum: ["admin", "owner"], default: "owner" },
    name: String,
    gymName: String,
    ownerName: String,
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: String,
    city: String,
    status: {
      type: String,
      enum: ["Active", "Pending", "Suspended"],
      default: "Active"
    },
    joinedOn: String,
    updatedAt: String
  },
  {
    collection: "users"
  }
);

module.exports = mongoose.models.User || mongoose.model("User", schema);
