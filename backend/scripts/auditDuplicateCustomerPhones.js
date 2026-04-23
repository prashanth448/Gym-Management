require("dotenv").config();
const connectDB = require("../config/db");
const Customer = require("../models/Customer");

async function run() {
  await connectDB();

  const duplicates = await Customer.aggregate([
    {
      $group: {
        _id: "$phone",
        count: { $sum: 1 },
        members: {
          $push: {
            gymId: "$gymId",
            customerId: "$customerId",
            fullName: "$fullName"
          }
        }
      }
    },
    {
      $match: {
        _id: { $nin: [null, ""] },
        count: { $gt: 1 }
      }
    },
    {
      $sort: {
        count: -1,
        _id: 1
      }
    }
  ]);

  if (!duplicates.length) {
    console.log("No duplicate member mobile numbers found.");
    return;
  }

  console.log(`Found ${duplicates.length} duplicate member mobile number group(s):`);

  duplicates.forEach((entry) => {
    console.log(`\nMobile: ${entry._id} (${entry.count} records)`);
    entry.members.forEach((member) => {
      console.log(
        `  - Gym ${member.gymId}, member #${member.customerId}, ${member.fullName}`
      );
    });
  });

  process.exitCode = 1;
}

run()
  .catch((error) => {
    console.error("Duplicate phone audit failed.", error);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await require("mongoose").disconnect();
    } catch (error) {
      // Ignore disconnect errors during audit shutdown.
    }
  });
