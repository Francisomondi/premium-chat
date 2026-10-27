import {
  createCreatorSubscriptionPlan,
  getMyCreatorSubscriptionPlans,
  updateCreatorSubscriptionPlan,
  updateCreatorSubscriptionPlanStatus,
  getPublicCreatorSubscriptionPlans,
} from "../services/creatorSubscriptionPlan.service.js";

/**
 * ============================================================
 * PREMIUMCHAT — CREATOR SUBSCRIPTION PLAN CONTROLLER
 * ============================================================
 */

/**
 * ============================================================
 * CREATE PLAN
 * ============================================================
 *
 * POST /api/creator/subscription-plans
 */

export const createMySubscriptionPlan = async (
  req,
  res,
  next
) => {
  try {
    const creatorId =
      req.auth.userId;

    const plan =
      await createCreatorSubscriptionPlan(
        creatorId,
        req.body
      );

    return res.status(201).json({
      success: true,
      message:
        "Subscription plan created successfully.",
      data: {
        plan,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * GET MY PLANS
 * ============================================================
 *
 * GET /api/creator/subscription-plans
 */

export const getMySubscriptionPlans = async (
  req,
  res,
  next
) => {
  try {
    const creatorId =
      req.auth.userId;

    const plans =
      await getMyCreatorSubscriptionPlans(
        creatorId
      );

    return res.status(200).json({
      success: true,
      data: {
        plans,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * UPDATE PLAN
 * ============================================================
 *
 * PATCH /api/creator/subscription-plans/:planId
 */

export const updateMySubscriptionPlan = async (
  req,
  res,
  next
) => {
  try {
    const creatorId =
      req.auth.userId;

    const { planId } = req.params;

    const plan =
      await updateCreatorSubscriptionPlan(
        creatorId,
        planId,
        req.body
      );

    return res.status(200).json({
      success: true,
      message:
        "Subscription plan updated successfully.",
      data: {
        plan,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * ============================================================
 * UPDATE PLAN STATUS
 * ============================================================
 *
 * PATCH /api/creator/subscription-plans/:planId/status
 */

export const updateMySubscriptionPlanStatus =
  async (req, res, next) => {
    try {
      const creatorId =
        req.auth.userId;

      const { planId } =
        req.params;

      const plan =
        await updateCreatorSubscriptionPlanStatus(
          creatorId,
          planId,
          req.body
        );

      return res.status(200).json({
        success: true,
        message:
          "Subscription plan status updated successfully.",
        data: {
          plan,
        },
      });
    } catch (error) {
      return next(error);
    }
  };

/**
 * ============================================================
 * PUBLIC CREATOR PLANS
 * ============================================================
 *
 * GET /api/creators/:creatorId/subscription-plans
 */

export const getCreatorPublicSubscriptionPlans =
  async (req, res, next) => {
    try {
      const { creatorId } =
        req.params;

      const plans =
        await getPublicCreatorSubscriptionPlans(
          creatorId
        );

      return res.status(200).json({
        success: true,
        data: {
          creatorId,
          plans,
        },
      });
    } catch (error) {
      return next(error);
    }
  };