import mongoose from "mongoose";

/**
 * ============================================================
 * PREMIUMCHAT CONVERSATION MODEL
 * ============================================================
 *
 * A conversation represents a private chat between
 * one USER and one CREATOR.
 *
 * Future features:
 *
 * - Last message preview
 * - Unread message counts
 * - Conversation archiving
 * - Blocking
 * - Paid creator conversations
 */

const conversationSchema = new mongoose.Schema(
  {
    /**
     * Conversation participants.
     *
     * Exactly two distinct users are required.
     */
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      ],

      required: true,

      validate: {
        validator(value) {
          if (!Array.isArray(value) || value.length !== 2) {
            return false;
          }

          return (
            value[0].toString() !== value[1].toString()
          );
        },

        message:
          "A conversation must contain two different participants.",
      },
    },

    /**
     * Creator associated with the conversation.
     */
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    /**
     * User communicating with the creator.
     */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },

    /**
     * Most recent message.
     */
    lastMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    lastMessageAt: {
      type: Date,
      default: null,
    },

    /**
     * Conversation status.
     */
    status: {
      type: String,
      enum: ["ACTIVE", "ARCHIVED", "BLOCKED"],
      default: "ACTIVE",
      required: true,
    },

    /**
     * Future paid messaging support.
     *
     * No payment entitlement is granted by this field.
     */
    isPaidConversation: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/**
 * ============================================================
 * INDEXES
 * ============================================================
 */

/**
 * Prevent duplicate conversations between the
 * same creator and user.
 */
conversationSchema.index(
  {
    creatorId: 1,
    userId: 1,
  },
  {
    unique: true,
    name: "unique_creator_user_conversation",
  }
);

/**
 * Efficiently retrieve conversations belonging
 * to a participant.
 */
conversationSchema.index(
  {
    participants: 1,
    updatedAt: -1,
  },
  {
    name: "participant_conversations",
  }
);

/**
 * Sort conversations by latest activity.
 */
conversationSchema.index(
  {
    lastMessageAt: -1,
  },
  {
    name: "conversation_latest_activity",
  }
);

/**
 * ============================================================
 * MODEL EXPORT
 * ============================================================
 */

const Conversation =
  mongoose.models.Conversation ||
  mongoose.model(
    "Conversation",
    conversationSchema
  );

export default Conversation;