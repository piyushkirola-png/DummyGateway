const express = require("express");
const { v4: uuid } = require("uuid");
const refundStore = require("../services/refund-store.service");
const payinStore = require("../services/payin-store.service");
const dispatcher = require("../services/webhook-dispatcher.service");

const router = express.Router();

/**
 * POST /refund/create
 * Called by DummyRefundIntegrationService.createRefund()
 *
 * Body: { gateway_reference, reference_id, refund_local_id,
 *         refund_amount, refund_note, callback_url }
 */
router.post("/create", async (req, res) => {
  try {
    const {
      gateway_reference,
      reference_id,
      refund_local_id,
      refund_amount,
      refund_note,
    } = req.body || {};

    if (!gateway_reference) {
      return res.status(400).json({ success: false, message: "gateway_reference is required" });
    }
    if (!refund_amount || Number(refund_amount) <= 0) {
      return res.status(400).json({ success: false, message: "refund_amount must be > 0" });
    }

    // Find the original payin (for behaviour + original amount check)
    const payin = reference_id ? payinStore.getPayin(reference_id) : null;

    // Behaviour by first char of reference_id: 4 = REFUND_FAIL, else success
    const first = String(reference_id || "").charAt(0);
    const behaviour = first === "4" ? "REFUND_FAIL" : "REFUND_SUCCESS";

    // Guard: refund amount can't exceed original
    const originalAmount = payin?.amount ?? Number(refund_amount);
    if (Number(refund_amount) > originalAmount) {
      return res.status(400).json({
        success: false,
        message: `Refund amount ${refund_amount} exceeds original amount ${originalAmount}`,
        failure_code: "REFUND_AMOUNT_EXCEEDED",
      });
    }

    const gatewayRefundId = `DUMMY_RFND_${Date.now()}_${uuid().slice(0, 6)}`;

    refundStore.createRefund({
      gatewayRefundId,
      localRefundId: refund_local_id || null,
      referenceId: reference_id || null,
      amount: Number(refund_amount),
      currency: "INR",
      note: refund_note || "Refund initiated by admin",
      behaviour,
    });

    const delayMs = Number(process.env.AUTO_CALLBACK_DELAY_MS || 5000);
    const auto = String(process.env.AUTO_CALLBACK_ENABLED || "true") === "true";

    if (auto) {
      if (behaviour === "REFUND_FAIL") {
        setTimeout(() => {
          dispatcher
            .dispatchRefundFailed(gatewayRefundId, {
              reason: "Refund declined by bank",
              code: "REFUND_DECLINED",
            })
            .catch((e) =>
              console.error("[PayoutMock] refund fail callback error:", e.message)
            );
        }, delayMs);
      } else {
        setTimeout(() => {
          dispatcher
            .dispatchRefundSuccess(gatewayRefundId)
            .catch((e) =>
              console.error("[PayoutMock] refund success callback error:", e.message)
            );
        }, delayMs);
      }
    }

    return res.json({
      success: true,
      data: {
        gateway_refund_id: gatewayRefundId,
        refund_local_id: refund_local_id || null,
        reference_id: reference_id || null,
        status: "PENDING",
        refund_amount: Number(refund_amount),
        currency: "INR",
        behaviour,
        message: auto
          ? `Callback scheduled in ${delayMs}ms`
          : "Awaiting manual webhook via POST /webhook/fire",
      },
    });
  } catch (error) {
    console.error("[PayoutMock] /refund/create error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /refund/:gatewayRefundId
 * Called by DummyRefundIntegrationService.fetchRefund()
 */
router.get("/:gatewayRefundId", (req, res) => {
  const record = refundStore.getRefund(req.params.gatewayRefundId);
  if (!record) {
    return res.status(404).json({ success: false, message: "Refund not found" });
  }
  res.json({
    success: true,
    data: {
      gateway_refund_id: record.gatewayRefundId,
      refund_local_id: record.localRefundId,
      reference_id: record.referenceId,
      refund_amount: record.amount,
      currency: record.currency,
      status:
        record.status === "COMPLETED"
          ? "SUCCESS"
          : record.status === "FAILED"
            ? "FAILED"
            : "PENDING",
      failure_reason: record.failureReason,
      failure_code: record.failureCode,
    },
  });
});

/**
 * GET /refund
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    count: refundStore.listRefunds().length,
    data: refundStore.listRefunds(),
  });
});

module.exports = router;