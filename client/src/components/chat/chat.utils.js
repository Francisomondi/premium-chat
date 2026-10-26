/**
 * ============================================================
 * PREMIUMCHAT — CHAT UI UTILITIES
 * ============================================================
 *
 * Reusable helpers for:
 *
 * - Conversation participant details
 * - Profile avatars
 * - Initials
 * - Message previews
 * - Conversation timestamps
 */

/**
 * ============================================================
 * NORMALIZE ID
 * ============================================================
 */

export const normalizeChatId = (value) => {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    value._id
  ) {
    return normalizeChatId(value._id);
  }

  if (
    typeof value === "object" &&
    value.id
  ) {
    return normalizeChatId(value.id);
  }

  return String(value).toLowerCase();
};

/**
 * ============================================================
 * GET CONVERSATION ID
 * ============================================================
 */

export const getConversationId = (
  conversation
) => {
  return normalizeChatId(
    conversation?._id ??
      conversation?.id
  );
};

/**
 * ============================================================
 * GET OTHER PARTICIPANT
 * ============================================================
 *
 * Supports populated participants and
 * creator/user objects.
 *
 * The current user's ID is used to identify
 * the other participant.
 */

export const getOtherParticipant = (
  conversation,
  currentUserId
) => {
  if (!conversation) {
    return null;
  }

  const currentId =
    normalizeChatId(currentUserId);

  /**
   * Prefer populated participant objects.
   */

  if (
    Array.isArray(conversation.participants)
  ) {
    const participant =
      conversation.participants.find(
        (item) => {
          const participantId =
            normalizeChatId(item);

          return (
            participantId &&
            participantId !== currentId &&
            typeof item === "object"
          );
        }
      );

    if (participant) {
      return participant;
    }
  }

  /**
   * Fallback to creator/user objects.
   */

  const creatorId = normalizeChatId(
    conversation.creatorId
  );

  const userId = normalizeChatId(
    conversation.userId
  );

  if (
    currentId === creatorId &&
    conversation.user
  ) {
    return conversation.user;
  }

  if (
    currentId === userId &&
    conversation.creator
  ) {
    return conversation.creator;
  }

  /**
   * Some APIs populate creatorId/userId
   * directly with user objects.
   */

  if (
    currentId === creatorId &&
    typeof conversation.userId ===
      "object"
  ) {
    return conversation.userId;
  }

  if (
    currentId === userId &&
    typeof conversation.creatorId ===
      "object"
  ) {
    return conversation.creatorId;
  }

  return null;
};

/**
 * ============================================================
 * GET PARTICIPANT NAME
 * ============================================================
 */

export const getParticipantName = (
  participant
) => {
  const name =
    participant?.displayName ??
    participant?.name ??
    participant?.username;

  if (
    typeof name === "string" &&
    name.trim()
  ) {
    return name.trim();
  }

  return "PremiumChat User";
};

/**
 * ============================================================
 * GET PARTICIPANT AVATAR
 * ============================================================
 */

export const getParticipantAvatar = (
  participant
) => {
  const avatar =
    participant?.avatarUrl ??
    participant?.profileImage ??
    participant?.avatar;

  if (
    typeof avatar === "string" &&
    avatar.trim()
  ) {
    return avatar;
  }

  return null;
};

/**
 * ============================================================
 * GET INITIALS
 * ============================================================
 */

export const getParticipantInitials = (
  name
) => {
  if (
    typeof name !== "string" ||
    !name.trim()
  ) {
    return "PC";
  }

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
};

/**
 * ============================================================
 * GET LAST MESSAGE
 * ============================================================
 *
 * Supports populated lastMessageId
 * and lastMessage objects.
 */

export const getLastMessage = (
  conversation
) => {
  if (
    conversation?.lastMessage &&
    typeof conversation.lastMessage ===
      "object"
  ) {
    return conversation.lastMessage;
  }

  if (
    conversation?.lastMessageId &&
    typeof conversation.lastMessageId ===
      "object"
  ) {
    return conversation.lastMessageId;
  }

  return null;
};

/**
 * ============================================================
 * GET MESSAGE PREVIEW
 * ============================================================
 */

export const getMessagePreview = (
  conversation,
  currentUserId
) => {
  const message =
    getLastMessage(conversation);

  if (!message) {
    return "Start the conversation";
  }

  if (message.deletedAt) {
    return "Message deleted";
  }

  /**
   * Media previews.
   */

  if (message.type === "IMAGE") {
    return "📷 Photo";
  }

  if (message.type === "VIDEO") {
    return "🎬 Video";
  }

  const content =
    typeof message.content === "string"
      ? message.content.trim()
      : "";

  if (!content) {
    return "New message";
  }

  const senderId = normalizeChatId(
    message.senderId
  );

  const isOwnMessage =
    senderId &&
    senderId ===
      normalizeChatId(currentUserId);

  const prefix = isOwnMessage
    ? "You: "
    : "";

  const maxLength = 55;

  const preview =
    content.length > maxLength
      ? `${content.slice(0, maxLength)}…`
      : content;

  return `${prefix}${preview}`;
};

/**
 * ============================================================
 * FORMAT CONVERSATION TIME
 * ============================================================
 */

export const formatConversationTime = (
  value
) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  const now = new Date();

  const isSameDay =
    date.toDateString() ===
    now.toDateString();

  if (isSameDay) {
    return date.toLocaleTimeString(
      undefined,
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  }

  const yesterday = new Date(now);

  yesterday.setDate(
    yesterday.getDate() - 1
  );

  if (
    date.toDateString() ===
    yesterday.toDateString()
  ) {
    return "Yesterday";
  }

  const daysDifference =
    Math.floor(
      (now.getTime() -
        date.getTime()) /
        (1000 * 60 * 60 * 24)
    );

  if (
    daysDifference >= 0 &&
    daysDifference < 7
  ) {
    return date.toLocaleDateString(
      undefined,
      {
        weekday: "short",
      }
    );
  }

  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    }
  );
};

/**
 * ============================================================
 * GET CONVERSATION ACTIVITY DATE
 * ============================================================
 */

export const getConversationActivityDate = (
  conversation
) => {
  return (
    conversation?.lastMessageAt ??
    conversation?.updatedAt ??
    conversation?.createdAt ??
    null
  );
};