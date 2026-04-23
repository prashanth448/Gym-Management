const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true
    },
    seq: {
      type: Number,
      default: 0
    }
  },
  {
    collection: "counters",
    timestamps: true
  }
);

module.exports = mongoose.models.Counter || mongoose.model("Counter", schema);
