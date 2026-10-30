/**
 * ============================================================
 * PREMIUMCHAT — M-PESA CHECKOUT RECOVERY
 * ============================================================
 *
 * STEP 19.8.29
 *
 * Responsibilities:
 *
 * - Preserve checkout request identifiers.
 * - Preserve pending subscription ID.
 * - Preserve payment tracking ID.
 * - Restore interrupted checkout sessions.
 * - Prevent unnecessary new payment requests.
 *
 * SECURITY:
 *
 * - No authentication tokens.
 * - No M-Pesa PINs.
 * - No financial verification evidence.
 * - Browser storage is not authoritative.
 * - Backend must enforce payment ownership.
 */

const STORAGE_PREFIX =
  "premiumchat:mpesa-checkout:v1";

const MAX_AGE_MS =
  24 * 60 * 60 * 1000;

/**
 * ============================================================
 * STORAGE KEY
 * ============================================================
 */

const getStorageKey = ({
  subscriberId,
  creatorId,
}) => {
  if (!subscriberId || !creatorId) {
    return null;
  }

  return [
    STORAGE_PREFIX,
    String(subscriberId).trim(),
    String(creatorId).trim(),
  ].join(":");
};

/**
 * ============================================================
 * STORAGE ACCESS
 * ============================================================
 */

const getStorage = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * ============================================================
 * SAVE CHECKOUT
 * ============================================================
 */

export const saveMpesaCheckout = ({
  subscriberId,
  creatorId,
  checkout,
}) => {
  const storage = getStorage();

  const key = getStorageKey({
    subscriberId,
    creatorId,
  });

  if (!storage || !key || !checkout) {
    return false;
  }

  try {
    const existing =
      loadMpesaCheckout({
        subscriberId,
        creatorId,
      });

    const record = {
      ...existing,
      ...checkout,

      subscriberId: String(
        subscriberId
      ),

      creatorId: String(
        creatorId
      ),

      updatedAt: Date.now(),
    };

    storage.setItem(
      key,
      JSON.stringify(record)
    );

    return true;
  } catch {
    return false;
  }
};

/**
 * ============================================================
 * LOAD CHECKOUT
 * ============================================================
 */

export const loadMpesaCheckout = ({
  subscriberId,
  creatorId,
}) => {
  const storage = getStorage();

  const key = getStorageKey({
    subscriberId,
    creatorId,
  });

  if (!storage || !key) {
    return null;
  }

  try {
    const raw =
      storage.getItem(key);

    if (!raw) {
      return null;
    }

    const record =
      JSON.parse(raw);

    if (
      !record ||
      typeof record !== "object" ||
      record.subscriberId !==
        String(subscriberId) ||
      record.creatorId !==
        String(creatorId)
    ) {
      storage.removeItem(key);
      return null;
    }

    const updatedAt =
      Number(record.updatedAt);

    if (
      !Number.isFinite(updatedAt) ||
      updatedAt > Date.now() ||
      Date.now() - updatedAt >
        MAX_AGE_MS
    ) {
      storage.removeItem(key);
      return null;
    }

    return record;
  } catch {
    return null;
  }
};

/**
 * ============================================================
 * CLEAR CHECKOUT
 * ============================================================
 */

export const clearMpesaCheckout = ({
  subscriberId,
  creatorId,
}) => {
  const storage = getStorage();

  const key = getStorageKey({
    subscriberId,
    creatorId,
  });

  if (!storage || !key) {
    return false;
  }

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};