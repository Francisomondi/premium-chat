import {
  Router,
} from "express";

import {
  receiveMpesaStkCallback,
} from "../controllers/mpesaCallback.controller.js";

import {
  mpesaCallbackLimiter,
} from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post(
  "/callback",
  mpesaCallbackLimiter,
  receiveMpesaStkCallback
);

export default router;