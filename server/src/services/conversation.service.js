import mongoose from "mongoose";

import Conversation from "../models/Conversation.model.js";
import User from "../models/User.model.js";

import AppError from "../utils/AppError.js";

import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  AGE_VERIFICATION_STATUSES,
  CREATOR_APPLICATION_STATUSES,
} from "../constants/account.constants.js";

/**
 * ============================================================
 * PREMIUMCHAT CONVERSATION SERVICE
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Create private conversations.
 * 2. Prevent duplicate conversations.
 * 3. Validate creator eligibility.
 * 4. Verify conversation membership.
 * 5. List authenticated user's conversations.
 * 6. Retrieve individual conversations.
 *
 * Security:
 *
 * - Never trust client-supplied participant lists.
 * - Never trust client-supplied account roles.
 * - Validate account status using MongoDB.
 * - Prevent unauthorized conversation access.
 * - Never expose password hashes or private data.
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const DEFAULT_PAGE = 1;

const DEFAULT_LIMIT = 20;

const MAX_LIMIT = 100;

const CONVERSATION_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  ARCHIVED: "ARCHIVED",
  BLOCKED: "BLOCKED",
});

/**
 * ============================================================
 * VALIDATE MONGODB ID
 * ============================================================
 */

const validateObjectId = (
  value,
  fieldName = "ID"
) => {
  if (
    typeof value !== "string" ||
    !/^[0-9a-fA-F]{24}$/.test(value)
  ) {
    throw new AppError(
      `Invalid ${fieldName}.`,
      400,
      "INVALID_OBJECT_ID"
    );
  }

  return value;
};

/**
 * ============================================================
 * SAFE USER FIELDS
 * ============================================================
 */

const SAFE_USER_FIELDS =
  "_id displayName avatarUrl role accountStatus";

/**
 * ============================================================
 * VERIFY ACTIVE USER
 * ============================================================
 */

const getActiveUser = async (userId) => {
  validateObjectId(userId, "user ID");

  const user = await User.findById(userId)
    .select(
      `${SAFE_USER_FIELDS} creatorApplication ageVerification`
    );

  if (!user) {
    throw new AppError(
      "User not found.",
      404,
      "USER_NOT_FOUND"
    );
  }

  if (
    user.accountStatus !== ACCOUNT_STATUSES.ACTIVE
  ) {
    throw new AppError(
      "This account is unavailable.",
      403,
      "ACCOUNT_UNAVAILABLE"
    );
  }

  return user;
};

/**
 * ============================================================
 * VERIFY CREATOR ELIGIBILITY
 * ============================================================
 *
 * A creator must:
 *
 * - Have the CREATOR role.
 * - Have an ACTIVE account.
 * - Have an APPROVED creator application.
 * - Have VERIFIED age verification.
 * - Have an unexpired verification.
 */

const ensureEligibleCreator = (creator) => {
  if (
    creator.role !== ACCOUNT_ROLES.CREATOR
  ) {
    throw new AppError(
      "The selected account is not a creator.",
      403,
      "NOT_A_CREATOR"
    );
  }

  if (
    creator.creatorApplication?.status !==
    CREATOR_APPLICATION_STATUSES.APPROVED
  ) {
    throw new AppError(
      "This creator is not approved.",
      403,
      "CREATOR_NOT_APPROVED"
    );
  }

  if (
    creator.ageVerification?.status !==
    AGE_VERIFICATION_STATUSES.VERIFIED
  ) {
    throw new AppError(
      "This creator has not completed age verification.",
      403,
      "CREATOR_NOT_VERIFIED"
    );
  }

  if (!creator.ageVerification?.verifiedAt) {
    throw new AppError(
      "Creator verification is incomplete.",
      403,
      "CREATOR_NOT_VERIFIED"
    );
  }

  if (
    creator.ageVerification.expiresAt &&
    creator.ageVerification.expiresAt <= new Date()
  ) {
    throw new AppError(
      "Creator verification has expired.",
      403,
      "CREATOR_VERIFICATION_EXPIRED"
    );
  }

  return true;
};

/**
 * ============================================================
 * POPULATE SAFE CONVERSATION DATA
 * ============================================================
 */

const populateConversation = async (
  conversation
) => {
  if (!conversation) {
    return null;
  }

  await conversation.populate([
    {
      path: "participants",
      select: SAFE_USER_FIELDS,
    },
    {
      path: "creatorId",
      select: SAFE_USER_FIELDS,
    },
    {
      path: "userId",
      select: SAFE_USER_FIELDS,
    },
  ]);

  return conversation;
};

/**
 * ============================================================
 * CREATE OR GET CONVERSATION
 * ============================================================
 *
 * Only a USER may initiate a conversation with
 * an eligible CREATOR.
 *
 * MongoDB's unique creatorId/userId index prevents
 * duplicate conversations under concurrent requests.
 */

export const createOrGetConversation = async ({
  userId,
  creatorId,
}) => {
  validateObjectId(userId, "user ID");

  validateObjectId(creatorId, "creator ID");

  if (userId === creatorId) {
    throw new AppError(
      "You cannot start a conversation with yourself.",
      400,
      "SELF_CONVERSATION_NOT_ALLOWED"
    );
  }

  /**
   * STEP 1:
   * Verify the initiating account.
   */

  const user = await getActiveUser(userId);

  if (user.role !== ACCOUNT_ROLES.USER) {
    throw new AppError(
      "Only user accounts can initiate creator conversations.",
      403,
      "USER_ROLE_REQUIRED"
    );
  }

  /**
   * STEP 2:
   * Verify creator eligibility.
   */

  const creator = await getActiveUser(creatorId);

  ensureEligibleCreator(creator);

  /**
   * STEP 3:
   * Check for an existing conversation.
   */

  let conversation = await Conversation.findOne({
    userId: user._id,
    creatorId: creator._id,
  });

  if (conversation) {
    if (
      conversation.status ===
      CONVERSATION_STATUSES.BLOCKED
    ) {
      throw new AppError(
        "This conversation is unavailable.",
        403,
        "CONVERSATION_BLOCKED"
      );
    }

    return populateConversation(conversation);
  }

  /**
   * STEP 4:
   * Create the conversation.
   */

  try {
    conversation = await Conversation.create({
      userId: user._id,

      creatorId: creator._id,

      participants: [
        user._id,
        creator._id,
      ],

      status: CONVERSATION_STATUSES.ACTIVE,

      isPaidConversation: false,
    });
  } catch (error) {
    /**
     * Concurrent requests may attempt to create
     * the same conversation.
     *
     * MongoDB's unique index guarantees only one
     * successful insertion once the index exists.
     */

    if (error?.code === 11000) {
      conversation = await Conversation.findOne({
        userId: user._id,
        creatorId: creator._id,
      });

      if (!conversation) {
        throw new AppError(
          "Unable to retrieve the conversation.",
          409,
          "CONVERSATION_CONFLICT"
        );
      }

      if (
        conversation.status ===
        CONVERSATION_STATUSES.BLOCKED
      ) {
        throw new AppError(
          "This conversation is unavailable.",
          403,
          "CONVERSATION_BLOCKED"
        );
      }
    } else {
      throw error;
    }
  }

  /**
   * STEP 5:
   * Return safe conversation details.
   */

  return populateConversation(conversation);
};

/**
 * ============================================================
 * VERIFY CONVERSATION MEMBERSHIP
 * ============================================================
 *
 * Used by:
 *
 * - REST messaging controllers
 * - Socket.IO messaging handlers
 * - Message history services
 * - Read receipt handlers
 */

export const verifyConversationMembership = async ({
  conversationId,
  userId,
  requireActive = true,
}) => {
  validateObjectId(
    conversationId,
    "conversation ID"
  );

  validateObjectId(
    userId,
    "user ID"
  );

  const conversation = await Conversation.findOne({
    _id: conversationId,

    participants: new mongoose.Types.ObjectId(
      userId
    ),
  });

  if (!conversation) {
    throw new AppError(
      "Conversation not found or access denied.",
      404,
      "CONVERSATION_NOT_FOUND"
    );
  }

  if (
    conversation.status ===
    CONVERSATION_STATUSES.BLOCKED
  ) {
    throw new AppError(
      "This conversation is unavailable.",
      403,
      "CONVERSATION_BLOCKED"
    );
  }

  if (
    requireActive &&
    conversation.status !==
      CONVERSATION_STATUSES.ACTIVE
  ) {
    throw new AppError(
      "This conversation is not active.",
      403,
      "CONVERSATION_NOT_ACTIVE"
    );
  }

  return conversation;
};

/**
 * ============================================================
 * GET CONVERSATION BY ID
 * ============================================================
 */

export const getConversationById = async ({
  conversationId,
  userId,
}) => {
  const conversation =
    await verifyConversationMembership({
      conversationId,
      userId,
      requireActive: false,
    });

  return populateConversation(conversation);
};

/**
 * ============================================================
 * LIST MY CONVERSATIONS
 * ============================================================
 *
 * Paginated list ordered by most recent activity.
 */

export const listMyConversations = async ({
  userId,
  page = DEFAULT_PAGE,
  limit = DEFAULT_LIMIT,
}) => {
  validateObjectId(userId, "user ID");

  const parsedPage = Number(page);

  const parsedLimit = Number(limit);

  if (
    !Number.isInteger(parsedPage) ||
    parsedPage < 1
  ) {
    throw new AppError(
      "Page must be a positive integer.",
      400,
      "INVALID_PAGE"
    );
  }

  if (
    !Number.isInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > MAX_LIMIT
  ) {
    throw new AppError(
      `Limit must be between 1 and ${MAX_LIMIT}.`,
      400,
      "INVALID_LIMIT"
    );
  }

  /**
   * STEP 1:
   * Verify the requesting account.
   */

  await getActiveUser(userId);

  /**
   * STEP 2:
   * Build the membership filter.
   */

  const filter = {
    participants: new mongoose.Types.ObjectId(
      userId
    ),

    status: {
      $ne: CONVERSATION_STATUSES.BLOCKED,
    },
  };

  /**
   * STEP 3:
   * Count matching conversations.
   */

  const total = await Conversation.countDocuments(
    filter
  );

  /**
   * STEP 4:
   * Retrieve the requested page.
   */

  const skip =
    (parsedPage - 1) * parsedLimit;

  const conversations = await Conversation.find(
    filter
  )
    .sort({
      lastMessageAt: -1,
      createdAt: -1,
      _id: -1,
    })
    .skip(skip)
    .limit(parsedLimit)
    .populate([
      {
        path: "participants",
        select: SAFE_USER_FIELDS,
      },
      {
        path: "creatorId",
        select: SAFE_USER_FIELDS,
      },
      {
        path: "userId",
        select: SAFE_USER_FIELDS,
      },
    ]);

  /**
   * STEP 5:
   * Return paginated results.
   */

  return {
    conversations,

    pagination: {
      page: parsedPage,

      limit: parsedLimit,

      total,

      totalPages: Math.ceil(
        total / parsedLimit
      ),
    },
  };
};

/**
 * ============================================================
 * CONVERSATION SERVICE EXPORT
 * ============================================================
 */

const conversationService = {
  createOrGetConversation,
  verifyConversationMembership,
  getConversationById,
  listMyConversations,
};

export default conversationService;