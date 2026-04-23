const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    gymId: {
      type: String,
      required: true,
      index: true
    },
    identifier: {
      type: String,
      required: true,
      index: true
    },
    channel: {
      type: String,
      enum: ["email", "phone"],
      required: true
    },
    destination: {
      type: String,
      required: true
    },
    otpHash: {
      type: String,
      required: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    usedAt: Date,
    expiresAt: {
      type: Date,
      required: true,
      expires: 0
    }
  },
  {
    collection: "password_reset_otps",
    timestamps: true
  }
);

module.exports =
  mongoose.models.PasswordResetOtp ||
  mongoose.model("PasswordResetOtp", schema);
