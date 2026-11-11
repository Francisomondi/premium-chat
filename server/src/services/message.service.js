
import Message from "../models/Message.model.js";
import Conversation from "../models/Conversation.model.js";
import User from "../models/User.model.js";
import AppError from "../utils/AppError.js";

import Media, {
  MEDIA_MODERATION_STATUSES,
} from "../models/Media.model.js";

import {
  MEDIA_ACCESS_POLICIES,
} from "../constants/mediaAccess.constants.js";

import {
  authorizeMediaAccess,
} from "./mediaAuthorization.service.js";

import {
  ACCOUNT_STATUSES,
} from "../constants/account.constants.js";

import {
  authorizeMessageSending,
} from "./messagingAuthorization.service.js";

import {
  verifyConversationAccess,
} from "./conversationAccess.service.js";

/**
 * ============================================================
 * PREMIUMCHAT MESSAGE SERVICE
 * ============================================================
 *
 * IMAGE DISPLAY RULES
 *
 * USER IMAGE:
 * - Must be uploaded by the user.
 * - Must belong to the exact conversation.
 * - Must use PUBLIC access.
 * - Must have zero price.
 * - Displays the original after processing.
 *
 * CREATOR IMAGE:
 * - Must be uploaded by the creator.
 * - Must belong to the exact conversation.
 * - Must use PURCHASE_ONLY access.
 * - Must have a positive KES price.
 * - Displays blurred preview and purchase price to users.
 * - Original is available only after verified payment.
 *
 * SECURITY:
 * - Sender identity comes from authentication.
 * - Only conversation participants may send.
 * - Media ownership is checked server-side.
 * - Storage keys and signed URLs are never returned.
 * - STK Push acceptance and callbacks never grant access.
 * - Original access is controlled by authorizeMediaAccess.
 */

const MAX_MESSAGE_LENGTH = 5000;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

const validateObjectId = (value, fieldName = "ID") => {
  if (
    typeof value !== "string" ||
    !OBJECT_ID_REGEX.test(value)
  ) {
    throw new AppError(
      `Invalid ${fieldName}.`,
      400,
      "INVALID_OBJECT_ID"
    );
  }

  return value;
};

const validateClientMessageId = (clientMessageId) => {
  if (
    typeof clientMessageId !== "string" ||
    clientMessageId.trim().length < 8 ||
    clientMessageId.trim().length > 100
  ) {
    throw new AppError(
      "A valid client message ID is required.",
      400,
      "INVALID_CLIENT_MESSAGE_ID"
    );
  }

  return clientMessageId.trim();
};

const validateTextContent = (content) => {
  if (typeof content !== "string") {
    throw new AppError(
      "Message content must be text.",
      400,
      "INVALID_MESSAGE_CONTENT"
    );
  }

  const normalized = content.trim();

  if (
    normalized.length === 0 ||
    normalized.length > MAX_MESSAGE_LENGTH
  ) {
    throw new AppError(
      `Message content must contain between 1 and ${MAX_MESSAGE_LENGTH} characters.`,
      400,
      "INVALID_MESSAGE_CONTENT"
    );
  }

  return normalized;
};

/**
 * ============================================================
 * ACCOUNT AND PARTICIPANT VALIDATION
 * ============================================================
 */

const verifyActiveSender = async (senderId) => {
  const sender = await User.findById(senderId)
    .select("_id role accountStatus")
    .lean();

  if (
    !sender ||
    sender.accountStatus !== ACCOUNT_STATUSES.ACTIVE
  ) {
    throw new AppError(
      "Your account cannot send messages.",
      403,
      "SENDER_UNAVAILABLE"
    );
  }

  return sender;
};

const verifyActiveParticipants = async (conversation) => {
  const activeCount = await User.countDocuments({
    _id: {
      $in: conversation.participants,
    },
    accountStatus: ACCOUNT_STATUSES.ACTIVE,
  });

  if (activeCount !== 2) {
    throw new AppError(
      "This conversation is currently unavailable.",
      403,
      "CONVERSATION_PARTICIPANT_UNAVAILABLE"
    );
  }
};

/**
 * ============================================================
 * UPDATE CONVERSATION ACTIVITY
 * ============================================================
 */

const updateConversationActivity = async ({
  conversationId,
  message,
}) => {
  await Conversation.updateOne(
    {
      _id: conversationId,
      status: "ACTIVE",
      $or: [
        { lastMessageAt: null },
        { lastMessageAt: { $lte: message.createdAt } },
      ],
    },
    {
      $set: {
        lastMessageId: message._id,
        lastMessageAt: message.createdAt,
      },
    }
  );
};

/**
 * ============================================================
 * SEND TEXT MESSAGE
 * ============================================================
 */

export const sendTextMessage = async ({
  conversationId,
  senderId,
  clientMessageId,
  content,
}) => {
  validateObjectId(conversationId, "conversation ID");
  validateObjectId(senderId, "sender ID");

  const validClientMessageId =
    validateClientMessageId(clientMessageId);

  const normalizedContent =
    validateTextContent(content);

  await verifyActiveSender(senderId);

  const { conversation } = await authorizeMessageSending({
    conversationId,
    senderId,
  });

  await verifyActiveParticipants(conversation);

  const existingMessage = await Message.findOne({
    conversationId,
    senderId,
    clientMessageId: validClientMessageId,
  });

  if (existingMessage) {
    if (
      existingMessage.content !== normalizedContent ||
      existingMessage.type !== "TEXT"
    ) {
      throw new AppError(
        "This client message ID was already used for different content.",
        409,
        "CLIENT_MESSAGE_ID_CONFLICT"
      );
    }

    return {
      message: existingMessage,
      created: false,
    };
  }

  let message;
  let created = false;

  try {
    message = await Message.create({
      conversationId,
      senderId,
      clientMessageId: validClientMessageId,
      type: "TEXT",
      content: normalizedContent,
      isLocked: false,
      mediaId: null,
      status: "SENT",
    });

    created = true;
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    message = await Message.findOne({
      conversationId,
      senderId,
      clientMessageId: validClientMessageId,
    });

    if (!message) {
      throw new AppError(
        "Unable to retrieve the message.",
        409,
        "MESSAGE_CONFLICT"
      );
    }

    if (
      message.content !== normalizedContent ||
      message.type !== "TEXT"
    ) {
      throw new AppError(
        "This client message ID was already used for different content.",
        409,
        "CLIENT_MESSAGE_ID_CONFLICT"
      );
    }
  }

  await updateConversationActivity({
    conversationId,
    message,
  });

  return {
    message,
    created,
  };
};

/**
 * ============================================================
 * SEND IMAGE MESSAGE
 * ============================================================
 *
 * Only IMAGE messages are supported.
 *
 * Processing images may be attached before processing finishes.
 * They cannot be viewed until READY and APPROVED.
 */

export const sendMediaMessage = async ({
  conversationId,
  senderId,
  clientMessageId,
  mediaId,
  content = "",
}) => {
  validateObjectId(conversationId, "conversation ID");
  validateObjectId(senderId, "sender ID");
  validateObjectId(mediaId, "media ID");

  const validClientMessageId =
    validateClientMessageId(clientMessageId);

  if (
    typeof content !== "string" ||
    content.trim().length > MAX_MESSAGE_LENGTH
  ) {
    throw new AppError(
      "Media caption must not exceed 5000 characters.",
      400,
      "INVALID_MEDIA_CAPTION"
    );
  }

  const normalizedContent = content.trim();

  /**
   * STEP 1: Verify sender and conversation.
   */

  const sender = await verifyActiveSender(senderId);

  const { conversation } = await authorizeMessageSending({
    conversationId,
    senderId,
  });

  await verifyActiveParticipants(conversation);

  const isCreator = sender.role === "CREATOR";
  const isUser = sender.role === "USER";

  if (!isCreator && !isUser) {
    throw new AppError(
      "This account cannot send media messages.",
      403,
      "MEDIA_MESSAGE_FORBIDDEN"
    );
  }

  /**
   * STEP 2: Load media owned by sender.
   */

  const media = await Media.findOne({
    _id: mediaId,

    $or: [
      { uploaderId: senderId },
      {
        uploaderId: null,
        creatorId: senderId,
      },
    ],

    status: {
      $in: ["PROCESSING", "READY"],
    },

    deletedAt: null,
  })
    .select(
      [
        "_id",
        "uploaderId",
        "creatorId",
        "conversationId",
        "mediaType",
        "accessPolicy",
        "priceMinor",
        "currency",
        "status",
        "moderationStatus",
      ].join(" ")
    )
    .lean();

  if (!media) {
    throw new AppError(
      "This media is unavailable or you do not own it.",
      404,
      "MEDIA_NOT_AVAILABLE"
    );
  }

  /**
   * STEP 3: Images only.
   */

  if (media.mediaType !== "IMAGE") {
    throw new AppError(
      "Only images can be sent in chat.",
      400,
      "UNSUPPORTED_MEDIA_TYPE"
    );
  }

  const conversationCreatorId = String(
    conversation.creatorId?._id ??
      conversation.creatorId
  );

  const conversationUserId = String(
    conversation.userId?._id ??
      conversation.userId
  );

  const mediaCreatorId = String(
    media.creatorId?._id ??
      media.creatorId
  );

  const mediaConversationId = media.conversationId
    ? String(
        media.conversationId?._id ??
          media.conversationId
      )
    : null;

  /**
   * STEP 4: Enforce sender-specific media policies.
   */

  if (isCreator) {
    const validCreatorPrice =
      Number.isSafeInteger(media.priceMinor) &&
      media.priceMinor > 0;

    const validCreatorCurrency =
      media.currency === "KES";

    if (
      mediaCreatorId !== String(senderId) ||
      conversationCreatorId !== String(senderId) ||
      mediaConversationId !== String(conversationId) ||
      media.accessPolicy !==
        MEDIA_ACCESS_POLICIES.PURCHASE_ONLY ||
      !validCreatorPrice ||
      !validCreatorCurrency
    ) {
      throw new AppError(
        "Creator images must belong to you, be attached to this conversation, and have a positive KES purchase price.",
        403,
        "CREATOR_MEDIA_POLICY_INVALID"
      );
    }
  } else {
    const mediaUploaderId = media.uploaderId
      ? String(
          media.uploaderId?._id ??
            media.uploaderId
        )
      : null;

    if (
      mediaUploaderId !== String(senderId) ||
      conversationUserId !== String(senderId) ||
      mediaCreatorId !== conversationCreatorId ||
      mediaConversationId !== String(conversationId) ||
      media.accessPolicy !==
        MEDIA_ACCESS_POLICIES.PUBLIC ||
      media.priceMinor !== 0
    ) {
      throw new AppError(
        "You can only send your own free images in your conversation.",
        403,
        "USER_MEDIA_FORBIDDEN"
      );
    }
  }

  /**
   * STEP 5: Verify conversation membership.
   */

  const senderIsParticipant =
    conversation.participants.some(
      (participantId) =>
        participantId.toString() === String(senderId)
    );

  if (!senderIsParticipant) {
    throw new AppError(
      "You cannot attach media to this conversation.",
      403,
      "MEDIA_CONVERSATION_FORBIDDEN"
    );
  }

  /**
   * STEP 6: Idempotency.
   */

  const existingMessage = await Message.findOne({
    conversationId,
    senderId,
    clientMessageId: validClientMessageId,
  });

  if (existingMessage) {
    if (
      existingMessage.type !== "IMAGE" ||
      existingMessage.mediaId?.toString() !==
        String(mediaId) ||
      existingMessage.content !== normalizedContent
    ) {
      throw new AppError(
        "This client message ID was already used for different content.",
        409,
        "CLIENT_MESSAGE_ID_CONFLICT"
      );
    }

    return {
      message: existingMessage,
      created: false,
    };
  }

  /**
   * STEP 7: Initial lock state.
   *
   * Creator PURCHASE_ONLY images start locked.
   * User PUBLIC images start unlocked.
   *
   * Actual access is recalculated when history is retrieved.
   */

  const isLocked =
    media.accessPolicy ===
    MEDIA_ACCESS_POLICIES.PURCHASE_ONLY;

  let message;
  let created = false;

  try {
    message = await Message.create({
      conversationId,
      senderId,
      clientMessageId: validClientMessageId,
      type: "IMAGE",
      content: normalizedContent,
      mediaId: media._id,
      isLocked,
      status: "SENT",
    });

    created = true;
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }

    message = await Message.findOne({
      conversationId,
      senderId,
      clientMessageId: validClientMessageId,
    });

    if (!message) {
      throw new AppError(
        "Unable to retrieve the image message.",
        409,
        "MESSAGE_CONFLICT"
      );
    }

    if (
      message.type !== "IMAGE" ||
      message.mediaId?.toString() !==
        String(mediaId) ||
      message.content !== normalizedContent
    ) {
      throw new AppError(
        "This client message ID was already used for different content.",
        409,
        "CLIENT_MESSAGE_ID_CONFLICT"
      );
    }
  }

  await updateConversationActivity({
    conversationId,
    message,
  });

  return {
    message,
    created,
  };
};

/**
 * ============================================================
 * GET CONVERSATION MESSAGE HISTORY
 * ============================================================
 *
 * Returns chronological messages with server-calculated
 * media permissions.
 *
 * Never returns:
 * - R2 storage keys.
 * - Private preview storage keys.
 * - Original image URLs.
 * - Signed media URLs.
 *
 * The frontend obtains URLs through the protected
 * preview and original-media endpoints.
 */


export const getConversationMessages = async ({
  conversationId,
  userId,
  before = null,
  limit = DEFAULT_LIMIT,
}) => {
  validateObjectId(conversationId, "conversation ID");
  validateObjectId(userId, "user ID");

  const parsedLimit = Number(limit);

  if (
    !Number.isInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > MAX_LIMIT
  ) {
    throw new AppError(
      `Limit must be between 1 and ${MAX_LIMIT}.`,
      400,
      "INVALID_MESSAGE_LIMIT"
    );
  }

  // STEP 1: Verify active viewer.
  await verifyActiveSender(userId);

  // STEP 2: Verify conversation access.
  await verifyConversationAccess({
    conversationId,
    userId,
    requireActive: false,
  });

  // STEP 3: Build pagination query.
  const query = {
    conversationId,
    deletedAt: null,
  };

  if (before !== null && before !== undefined) {
    validateObjectId(before, "message cursor");

    const cursorMessage = await Message.findOne({
      _id: before,
      conversationId,
      deletedAt: null,
    })
      .select("_id createdAt")
      .lean();

    if (!cursorMessage) {
      throw new AppError(
        "Invalid message cursor.",
        400,
        "INVALID_MESSAGE_CURSOR"
      );
    }

    query.$or = [
      {
        createdAt: {
          $lt: cursorMessage.createdAt,
        },
      },
      {
        createdAt: cursorMessage.createdAt,
        _id: {
          $lt: cursorMessage._id,
        },
      },
    ];
  }

  // STEP 4: Fetch paginated messages.
  const results = await Message.find(query)
    .sort({
      createdAt: -1,
      _id: -1,
    })
    .limit(parsedLimit + 1)
    .lean();

  const hasMore = results.length > parsedLimit;

  const pageResults = results.slice(0, parsedLimit);

  const nextCursor =
    hasMore && pageResults.length > 0
      ? pageResults[
          pageResults.length - 1
        ]._id.toString()
      : null;

  const orderedMessages = pageResults.reverse();

  // STEP 5: Load referenced media.
  // Private storage keys and signed URLs are never selected.
  const mediaIds = [
    ...new Set(
      orderedMessages
        .filter(
          (message) =>
            message.type === "IMAGE" &&
            message.mediaId
        )
        .map((message) => message.mediaId.toString())
    ),
  ];

  const mediaRecords = mediaIds.length
    ? await Media.find({
        _id: {
          $in: mediaIds,
        },
      })
        .select(
          [
            "_id",
            "creatorId",
            "mediaType",
            "accessPolicy",
            "priceMinor",
            "currency",
            "status",
            "moderationStatus",
            "deletedAt",
          ].join(" ")
        )
        .lean()
    : [];

  const mediaMap = new Map(
    mediaRecords.map((media) => [
      media._id.toString(),
      media,
    ])
  );

  // STEP 6: Enrich messages with server-calculated permissions.
  const enrichedMessages = await Promise.all(
    orderedMessages.map(async (message) => {
      if (
        message.type !== "IMAGE" ||
        !message.mediaId
      ) {
        return {
          ...message,
          media: null,
        };
      }

      const media = mediaMap.get(
        message.mediaId.toString()
      );

      // Missing media never grants access.
      if (!media) {
        return {
          ...message,
          isLocked: true,
          media: {
            id: message.mediaId.toString(),
            type: "IMAGE",
            available: false,
            status: "UNAVAILABLE",
            moderationStatus: null,
            accessPolicy: null,
            priceMinor: 0,
            currency: "KES",
            canAccess: false,
            canPurchase: false,
            accessType: null,
          },
        };
      }

      // Only actual chat images can be delivered here.
      const isImage = media.mediaType === "IMAGE";

      const mediaAvailable =
        isImage &&
        media.status === "READY" &&
        media.moderationStatus ===
          MEDIA_MODERATION_STATUSES.APPROVED &&
        media.deletedAt == null;

      /*
       * STEP 7: Authoritative authorization.
       *
       * Do not call authorizeMediaAccess for PROCESSING,
       * PENDING, rejected, deleted, or otherwise unavailable
       * media. The authorization service requires READY
       * and APPROVED media.
       *
       * This also ensures that a creator viewing their own
       * image receives access only after processing and
       * approval are complete.
       */
      let authorization = {
        hasAccess: false,
        accessType: null,
      };

      if (mediaAvailable) {
        authorization = await authorizeMediaAccess({
          viewerId: userId,
          media,
        });
      }

      const canAccess =
        mediaAvailable &&
        authorization?.hasAccess === true;

      const isCreator =
        String(media.creatorId) === String(userId);

      /*
       * STEP 8: Purchase eligibility.
       *
       * A purchase can only be initiated for an available
       * image with a valid positive KES price.
       */
      const purchasePolicy = [
        MEDIA_ACCESS_POLICIES.PURCHASE_ONLY,
        MEDIA_ACCESS_POLICIES.SUBSCRIPTION_OR_PURCHASE,
      ].includes(media.accessPolicy);

      const validPurchasePrice =
        Number.isSafeInteger(media.priceMinor) &&
        media.priceMinor > 0;

      const validPurchaseCurrency =
        media.currency === "KES";

      const canPurchase =
        mediaAvailable &&
        !canAccess &&
        !isCreator &&
        purchasePolicy &&
        validPurchasePrice &&
        validPurchaseCurrency;

      /*
       * STEP 9: Calculate lock state.
       *
       * PURCHASE_ONLY media remains locked until the
       * authorization service confirms entitlement.
       *
       * STK Push acceptance and callbacks are not used
       * here to grant access.
       */
      const isLocked =
        purchasePolicy && !canAccess;

      /*
       * STEP 10: Return safe media information.
       *
       * The frontend obtains preview and original URLs
       * through their separate protected endpoints.
       */
      return {
        ...message,

        isLocked,

        media: {
          id: media._id.toString(),

          type: "IMAGE",

          available: mediaAvailable,

          status: media.status,

          moderationStatus:
            media.moderationStatus,

          accessPolicy: media.accessPolicy,

          priceMinor:
            Number.isSafeInteger(media.priceMinor)
              ? media.priceMinor
              : 0,

          currency: media.currency || "KES",

          canAccess,

          canPurchase,

          accessType: canAccess
            ? authorization?.accessType ?? null
            : null,
        },
      };
    })
  );

  // STEP 11: Return history and pagination.
  return {
    messages: enrichedMessages,

    pagination: {
      limit: parsedLimit,
      hasMore,
      nextCursor,
    },
  };
};


/**
 * ============================================================
 * DEFAULT EXPORT
 * ============================================================
 */

const messageService = {
  sendTextMessage,
  sendMediaMessage,
  getConversationMessages,
};

export default messageService;
