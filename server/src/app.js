import express from "express";
import cookieParser from "cookie-parser";
import hpp from "hpp";

import authRoutes from "./routes/auth.routes.js";

import creatorApplicationRoutes from "./routes/creatorApplication.routes.js";

import adminCreatorApplicationRoutes from "./routes/adminCreatorApplication.routes.js";

import conversationRoutes from "./routes/conversation.routes.js";

import creatorMonetizationRoutes from "./routes/creatorMonetization.routes.js";

import creatorSubscriptionPlanRoutes from "./routes/creatorSubscriptionPlan.routes.js";

import publicCreatorSubscriptionPlanRoutes from "./routes/publicCreatorSubscriptionPlan.routes.js";
/**
 * ============================================================
 * MODULE 4.3.5 — SUBSCRIBER SUBSCRIPTION MANAGEMENT
 * ============================================================
 */

import subscriberSubscriptionRoutes from "./routes/subscriberSubscription.routes.js";

import creatorSubscriberRoutes from "./routes/creatorSubscriber.routes.js";
import mpesaPaymentRoutes from "./routes/mpesaPayment.routes.js";
import mpesaCallbackRoutes from "./routes/mpesaCallback.routes.js";

import { env } from "./config/env.js";

import {
  helmetMiddleware,
  corsMiddleware,
} from "./config/security.js";

import {
  globalApiLimiter,
} from "./middleware/rateLimit.middleware.js";

import {
  requestIdMiddleware,
} from "./middleware/requestId.middleware.js";

import {
  errorHandler,
} from "./middleware/error.middleware.js";

import {
  notFoundHandler,
} from "./middleware/notFound.middleware.js";

import healthRoutes from "./routes/health.routes.js";

import securityTestRoutes from "./routes/securityTest.routes.js";

import creatorDiscoveryRoutes from "./routes/creatorDiscovery.routes.js";

const app = express();

/*
 * ============================================================
 * EXPRESS SETTINGS
 * ============================================================
 */

app.disable("x-powered");

app.set("trust proxy", env.TRUST_PROXY);

/*
 * ============================================================
 * REQUEST IDENTIFICATION
 * ============================================================
 */

app.use(requestIdMiddleware);

/*
 * ============================================================
 * SECURITY HEADERS
 * ============================================================
 */

app.use(helmetMiddleware);

/*
 * ============================================================
 * CORS
 * ============================================================
 */

app.use(corsMiddleware);

/*
 * ============================================================
 * REQUEST BODY PARSERS
 * ============================================================
 */

app.use(
  express.json({
    limit: env.JSON_BODY_LIMIT,
    strict: true,
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: env.URLENCODED_BODY_LIMIT,
    parameterLimit: 100,
  })
);

app.use(cookieParser());

/*
 * ============================================================
 * HTTP PARAMETER POLLUTION PROTECTION
 * ============================================================
 */

app.use(hpp());

/*
 * ============================================================
 * GLOBAL API RATE LIMITING
 * ============================================================
 */

app.use(
  env.API_PREFIX,
  globalApiLimiter
);

/*
 * ============================================================
 * HEALTH ROUTES
 * ============================================================
 */

app.use(
  `${env.API_PREFIX}/health`,
  healthRoutes
);

/*
 * ============================================================
 * API ROOT
 * ============================================================
 */

app.get(env.API_PREFIX, (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Welcome to Premium Chat API.",
    version: "1.0.0",
    requestId: req.requestId,
  });
});

/*
 * ============================================================
 * AUTHENTICATION ROUTES
 * ============================================================
 */

app.use(
  `${env.API_PREFIX}/auth`,
  authRoutes
);

/*
 * ============================================================
 * CREATOR APPLICATION ROUTES
 * ============================================================
 */

app.use(
  `${env.API_PREFIX}/creator/applications`,
  creatorApplicationRoutes
);

/*
 * ============================================================
 * ADMIN CREATOR APPLICATION ROUTES
 * ============================================================
 */

app.use(
  `${env.API_PREFIX}/admin/creator-applications`,
  adminCreatorApplicationRoutes
);

/*
 * ============================================================
 * CONVERSATION ROUTES
 * ============================================================
 */

app.use(
  `${env.API_PREFIX}/conversations`,
  conversationRoutes
);

/*
 * ============================================================
 * CREATOR DISCOVERY ROUTES
 * ============================================================
 */

app.use(
  "/api/creators",
  creatorDiscoveryRoutes
);



app.use(
  `${env.API_PREFIX}/creator`,
  creatorMonetizationRoutes
);



app.use(
  `${env.API_PREFIX}/creator/subscription-plans`,
  creatorSubscriptionPlanRoutes
);



app.use(
  `${env.API_PREFIX}/creators`,
  publicCreatorSubscriptionPlanRoutes
);


app.use(
  `${env.API_PREFIX}/subscriptions`,
  subscriberSubscriptionRoutes
);



app.use(
  `${env.API_PREFIX}/creator/subscribers`,
  creatorSubscriberRoutes
);



app.use(
  `${env.API_PREFIX}/payments/mpesa`,
  mpesaPaymentRoutes
);

/*
 * ============================================================
 * DEVELOPMENT-ONLY TEST ROUTES
 * ============================================================
 */

if (!env.IS_PRODUCTION) {
  app.use(
    `${env.API_PREFIX}/dev`,
    securityTestRoutes
  );
}

/**
 * ============================================================
 * MODULE 4.3.5.7.8.13.11 — M-PESA CALLBACKS
 * ============================================================
 *
 * POST /api/payments/mpesa/callback
 *
 * Public provider callback.
 *
 * Does not grant subscription access.
 */

app.use(
  `${env.API_PREFIX}/payments/mpesa`,
  mpesaCallbackRoutes
);

/*
 * ============================================================
 * NOT FOUND
 * ============================================================
 */

app.use(notFoundHandler);

/*
 * ============================================================
 * ERROR HANDLER
 * ============================================================
 */

app.use(errorHandler);

export default app;