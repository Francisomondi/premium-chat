
import "dotenv/config";
import mongoose from "mongoose";

import Media from "../src/models/Media.model.js";
import MediaProcessingJob from "../src/models/MediaProcessingJob.model.js";

const main = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const media = await Media.findOne({
      conversationId: null,
      mediaType: "IMAGE",
    })
      .sort({ createdAt: -1 })
      .select(
        "_id creatorId mediaType status moderationStatus previewStorageKey createdAt"
      )
      .lean();

    if (!media) {
      console.log("No gallery image found.");
      return;
    }

    const job = await MediaProcessingJob.findOne({
      mediaId: media._id,
    }).lean();

    console.log(
      JSON.stringify(
        {
          media: {
            id: media._id,
            status: media.status,
            moderationStatus: media.moderationStatus,
            previewGenerated: Boolean(media.previewStorageKey),
          },
          processingJob: job
            ? {
                status: job.status,
                attempts: job.attempts,
                completedAt: job.completedAt,
              }
            : null,
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error("Verification failed:", error.message);
  process.exitCode = 1;
});
