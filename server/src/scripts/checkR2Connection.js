import "dotenv/config";

import {
  getMediaStorageConfigStatus,
  requireMediaStorage,
} from "../config/mediaStorage.js";

import {
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const checkR2Connection = async () => {
  console.log(
    "Storage config status:",
    JSON.stringify(
      getMediaStorageConfigStatus(),
      null,
      2
    )
  );

  try {
    const {
      client,
      bucket,
    } = requireMediaStorage();

    console.log("Checking private R2 bucket...");

    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1,
      })
    );

    console.log("R2 connection successful.");
    console.log("Bucket:", bucket);
    console.log("Objects found:", result.KeyCount ?? 0);
  } catch (error) {
    console.error("R2 connection failed.");
    console.error("Error:", error.name || "UnknownError");
    console.error("Message:", error.message);
  }
};

checkR2Connection();