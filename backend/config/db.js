
const mongoose = require("mongoose");

const CONNECT_OPTIONS = {
  serverSelectionTimeoutMS: 5000
};

module.exports = async () => {
  const remoteMongoUri = process.env.MONGO_URI?.trim();
  const localMongoUri =
    process.env.LOCAL_MONGO_URI?.trim() ||
    "mongodb://127.0.0.1:27017/fitLedger";

  if (remoteMongoUri) {
    try {
      await mongoose.connect(remoteMongoUri, CONNECT_OPTIONS);
      console.log("MongoDB connected using MONGO_URI.");
      return "remote";
    } catch (error) {
      console.error(`Remote MongoDB connection failed: ${error.message}`);
    }
  }

  try {
    await mongoose.connect(localMongoUri, CONNECT_OPTIONS);
    console.log(`MongoDB connected using local MongoDB at ${localMongoUri}.`);
    return "local";
  } catch (error) {
    throw new Error(
      `Unable to connect to MongoDB. Checked MONGO_URI${
        remoteMongoUri ? " and local MongoDB" : ""
      }. Last error: ${error.message}`
    );
  }
};
