import mongoose from "mongoose";

import {
  ACCOUNT_ROLES,
  ACCOUNT_STATUSES,
  AGE_VERIFICATION_STATUSES,
  CREATOR_APPLICATION_STATUSES,
  ROLE_VALUES,
  ACCOUNT_STATUS_VALUES,
  AGE_VERIFICATION_STATUS_VALUES,
  CREATOR_APPLICATION_STATUS_VALUES,
} from "../constants/account.constants.js";

import {
  hashPassword,
  verifyPassword,
} from "../services/password.service.js";

/**
 * ============================================================
 * AGE VERIFICATION SUBDOCUMENT
 * ============================================================
 *
 * Do not store identity document images or raw
 * verification-provider responses in this model.
 */

const ageVerificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: AGE_VERIFICATION_STATUS_VALUES,
      default: AGE_VERIFICATION_STATUSES.NOT_STARTED,
      required: true,
    },

    provider: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    providerReference: {
      type: String,
      trim: true,
      maxlength: 255,
      select: false,
      default: null,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

/**
 * ============================================================
 * CREATOR APPLICATION SUBDOCUMENT
 * ============================================================
 */

const creatorApplicationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: CREATOR_APPLICATION_STATUS_VALUES,
      default:
        CREATOR_APPLICATION_STATUSES.NOT_APPLIED,
      required: true,
    },

    /**
     * Applicant's explanation of their creator plans.
     *
     * Required by the submission service, rather than
     * required globally, to preserve compatibility
     * with existing User documents.
     */
    motivation: {
      type: String,
      trim: true,
      minlength: 30,
      maxlength: 1000,
      default: null,
    },

    appliedAt: {
      type: Date,
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    _id: false,
  }
);

/**
 * ============================================================
 * USER SCHEMA
 * ============================================================
 */

const userSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address.",
      ],
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ROLE_VALUES,
      default: ACCOUNT_ROLES.USER,
      required: true,
    },

    accountStatus: {
      type: String,
      enum: ACCOUNT_STATUS_VALUES,
      default: ACCOUNT_STATUSES.ACTIVE,
      required: true,
    },

    dateOfBirth: {
      type: Date,
      select: false,
      default: null,
    },

    ageVerification: {
      type: ageVerificationSchema,
      default: () => ({}),
    },

    creatorApplication: {
      type: creatorApplicationSchema,
      default: () => ({}),
    },

    emailVerifiedAt: {
      type: Date,
      default: null,
    },

    avatarUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: null,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
    },

    suspendedAt: {
      type: Date,
      default: null,
    },

    bannedAt: {
      type: Date,
      default: null,
    },

    deactivatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,

    versionKey: "__v",

    optimisticConcurrency: true,

    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.dateOfBirth;
        delete ret.__v;

        if (ret.ageVerification) {
          delete ret.ageVerification.providerReference;
        }

        return ret;
      },
    },
  }
);

/**
 * ============================================================
 * INDEXES
 * ============================================================
 */

userSchema.index(
  { email: 1 },
  {
    unique: true,
    name: "unique_user_email",
  }
);

userSchema.index(
  { role: 1, accountStatus: 1 },
  {
    name: "user_role_status",
  }
);

/**
 * ============================================================
 * PASSWORD VIRTUAL
 * ============================================================
 *
 * Plaintext passwords are assigned to this virtual,
 * never directly to passwordHash.
 */

userSchema.virtual("password").set(function (password) {
  this.$locals.plaintextPassword = password;
});

/**
 * ============================================================
 * PASSWORD HASHING MIDDLEWARE
 * ============================================================
 */

userSchema.pre("validate", async function () {
  const password = this.$locals.plaintextPassword;

  if (password === undefined) {
    return;
  }

  this.passwordHash = await hashPassword(password);

  this.passwordChangedAt = new Date();

  delete this.$locals.plaintextPassword;
});

/**
 * ============================================================
 * PASSWORD VERIFICATION METHOD
 * ============================================================
 */

userSchema.methods.comparePassword = async function (
  candidatePassword
) {
  if (!this.passwordHash) {
    throw new Error(
      "Password hash was not selected in the query."
    );
  }

  return verifyPassword(
    candidatePassword,
    this.passwordHash
  );
};

/**
 * ============================================================
 * ACCOUNT ACCESS METHODS
 * ============================================================
 */

userSchema.methods.isAccountActive = function () {
  return (
    this.accountStatus === ACCOUNT_STATUSES.ACTIVE
  );
};

userSchema.methods.isAdultVerified = function () {
  const verification = this.ageVerification;

  if (
    verification?.status !==
    AGE_VERIFICATION_STATUSES.VERIFIED
  ) {
    return false;
  }

  if (!verification.verifiedAt) {
    return false;
  }

  if (
    verification.expiresAt &&
    verification.expiresAt <= new Date()
  ) {
    return false;
  }

  return true;
};

userSchema.methods.canAccessRestrictedContent =
  function () {
    return (
      this.isAccountActive() &&
      this.isAdultVerified()
    );
  };

userSchema.methods.canUseCreatorFeatures =
  function () {
    return (
      this.canAccessRestrictedContent() &&
      this.role === ACCOUNT_ROLES.CREATOR &&
      this.creatorApplication?.status ===
        CREATOR_APPLICATION_STATUSES.APPROVED
    );
  };

/**
 * ============================================================
 * PROTECT SENSITIVE FIELDS
 * ============================================================
 *
 * Block direct password-hash updates through common
 * query-based update methods.
 *
 * Password changes must use the document password
 * virtual and save() workflow.
 */

const rejectSensitiveUpdates = function () {
  const update = this.getUpdate();

  if (!update) return;

  const protectedFields = [
    "passwordHash",
    "password",
  ];

  const containsProtectedField = (object) => {
    if (
      !object ||
      typeof object !== "object"
    ) {
      return false;
    }

    return Object.keys(object).some((key) =>
      protectedFields.some(
        (field) =>
          key === field ||
          key.startsWith(`${field}.`)
      )
    );
  };

  const operations = [
    update,
    update.$set,
    update.$unset,
    update.$setOnInsert,
  ];

  if (operations.some(containsProtectedField)) {
    throw new Error(
      "Password fields cannot be modified through query updates."
    );
  }

  if (Array.isArray(update)) {
    throw new Error(
      "Pipeline updates are not supported for User accounts."
    );
  }
};

userSchema.pre(
  "updateOne",
  rejectSensitiveUpdates
);

userSchema.pre(
  "updateMany",
  rejectSensitiveUpdates
);

userSchema.pre(
  "findOneAndUpdate",
  rejectSensitiveUpdates
);

userSchema.pre(
  "replaceOne",
  function () {
    throw new Error(
      "Account replacement operations are not supported."
    );
  }
);

userSchema.pre(
  "findOneAndReplace",
  function () {
    throw new Error(
      "Account replacement operations are not supported."
    );
  }
);

/**
 * ============================================================
 * MODEL EXPORT
 * ============================================================
 */

const User =
  mongoose.models.User ||
  mongoose.model("User", userSchema);

export default User;