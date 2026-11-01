const express = require("express");
const payoutStore = require("../services/payout-store.service");
const dispatcher = require("../services/webhook-dispatcher.service");

const router = express.Router();

/**
 * POST /webhook/fire  — manual trigger (testing only)
 */
router.post("/fire", async (req, res) => {
  try {
    const {
      reference_id,
      gateway_refund_id,
      chargeback_id,
      event = "PAYOUT_SUCCESS",
      utr,
      amount,
      failure_reason,
      failure_code,
      delay_seconds = 0,
      duplicate = false,
    } = req.body || {};

    const payoutEvents = ["PAYOUT_SUCCESS", "PAYOUT_FAILED", "PAYOUT_PENDING"];
    const payinEvents = [
      "PAYIN_SUCCESS",
      "PAYIN_FAILED",
      "PAYMENT_SUCCESS",
      "PAYMENT_FAILED",
    ];
    const refundEvents = ["REFUND_SUCCESS", "REFUND_FAILED"];
    const chargebackEvents = ["CHARGEBACK_CREATED", "CHARGEBACK_REVERSED"];

    if (
      (payoutEvents.includes(event) || payinEvents.includes(event)) &&
      !reference_id
    ) {
      return res
        .status(400)
        .json({ success: false, message: "reference_id is required for this event" });
    }
    if (refundEvents.includes(event) && !gateway_refund_id) {
      return res.status(400).json({
        success: false,
        message: "gateway_refund_id is required for this event",
      });
    }
    if (chargebackEvents.includes(event) && !chargeback_id) {
      return res.status(400).json({
        success: false,
        message: "chargeback_id is required for this event",
      });
    }

    const fireOnce = async () => {
      switch (event) {
        case "PAYOUT_SUCCESS":
          return dispatcher.dispatchPayoutSuccess(reference_id, { utr, amount });
        case "PAYOUT_FAILED":
          return dispatcher.dispatchPayoutFailed(reference_id, {
            reason: failure_reason,
            code: failure_code,
            amount,
          });
        case "PAYOUT_PENDING":
          return dispatcher.dispatchPayoutPending(reference_id);
        case "PAYIN_SUCCESS":
        case "PAYMENT_SUCCESS":
          return dispatcher.dispatchPayinSuccess(reference_id, { utr, amount });
        case "PAYIN_FAILED":
        case "PAYMENT_FAILED":
          return dispatcher.dispatchPayinFailed(reference_id, {
            reason: failure_reason,
            code: failure_code,
            amount,
          });
        case "REFUND_SUCCESS":
          return dispatcher.dispatchRefundSuccess(gateway_refund_id);
        case "REFUND_FAILED":
          return dispatcher.dispatchRefundFailed(gateway_refund_id, {
            reason: failure_reason,
            code: failure_code,
          });
        case "CHARGEBACK_CREATED":
          return dispatcher.dispatchChargebackCreated(chargeback_id, {
            reason: failure_reason,
            amount,
          });
        case "CHARGEBACK_REVERSED":
          return dispatcher.dispatchChargebackReversed(chargeback_id, {
            reason: failure_reason,
          });
        default:
          throw new Error(`Unknown event: ${event}`);
      }
    };

    if (Number(delay_seconds) > 0) {
      const ms = Number(delay_seconds) * 1000;
      setTimeout(() => {
        fireOnce().catch((e) =>
          console.error("[manual fire] delayed failed:", e.message),
        );
        if (duplicate) {
          setTimeout(() => {
            fireOnce().catch((e) =>
              console.error("[manual fire] delayed duplicate failed:", e.message),
            );
          }, 2000);
        }
      }, ms);
      return res.json({
        success: true,
        scheduled: true,
        delaySeconds: Number(delay_seconds),
        duplicate,
        event,
      });
    }

    const result = await fireOnce();
    let duplicateResult = null;
    if (duplicate) {
      await new Promise((r) => setTimeout(r, 2000));
      duplicateResult = await fireOnce();
    }

    return res.json({
      success: true,
      event,
      reference_id,
      gateway_refund_id,
      chargeback_id,
      result,
      duplicate: duplicateResult,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
      detail: error.result || null,
    });
  }
});

router.get("/log", (req, res) => {
  const limit = Number(req.query.limit || 50);
  res.json({ success: true, data: payoutStore.getWebhookLog(limit) });
});

router.get("/target", (req, res) => {
  res.json({
    success: true,
    backendUrl: process.env.BACKEND_WEBHOOK_URL,
    hasSecret: Boolean(process.env.DUMMY_WEBHOOK_SECRET),
    autoCallbacks: String(process.env.AUTO_CALLBACK_ENABLED || "true") === "true",
    autoCallbackDelayMs: Number(process.env.AUTO_CALLBACK_DELAY_MS || 0),
  });
});

module.exports = router;