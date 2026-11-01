const express = require("express");
const { v4: uuid } = require("uuid");
const chargebackStore = require("../services/chargeback-store.service");
const payinStore = require("../services/payin-store.service");
const dispatcher = require("../services/webhook-dispatcher.service");

const router = express.Router();

/**
 * POST /chargeback/create
 * Called by PayoutMock itself (or you, from Postman) to simulate a new dispute.
 *
 * Body: { reference_id, amount, currency, reason, reason_description }
 */
router.post("/create", async (req, res) => {
  try {
    const { reference_id, amount, currency, reason, reason_description } =
      req.body || {};

    if (!reference_id) {
      return res.status(400).json({ success: false, message: "reference_id is required" });
    }

    const payin = payinStore.getPayin(reference_id);
    const cbAmount = Number(amount || payin?.amount || 0);
    if (!cbAmount || cbAmount <= 0) {
      return res.status(400).json({ success: false, message: "amount is required" });
    }

    const gatewayChargebackId = `DUMMY_CB_${Date.now()}_${uuid().slice(0, 6)}`;

    chargebackStore.createChargeback({
      gatewayChargebackId,
      referenceId: reference_id,
      amount: cbAmount,
      currency: currency || "INR",
      reason: reason || "customer_dispute",
      reasonDescription: reason_description || null,
      behaviour: "CHARGEBACK_DISPUTED",
    });

    // Fire CHARGEBACK_CREATED webhook immediately
    const delayMs = Number(process.env.AUTO_CALLBACK_DELAY_MS || 5000);
    const auto = String(process.env.AUTO_CALLBACK_ENABLED || "true") === "true";
    if (auto) {
      setTimeout(() => {
        dispatcher
          .dispatchChargebackCreated(gatewayChargebackId, {
            reason: reason || "customer_dispute",
            amount: cbAmount,
          })
          .catch((e) =>
            console.error("[PayoutMock] chargeback create callback error:", e.message)
          );
      }, delayMs);
    }

    return res.json({
      success: true,
      data: {
        gateway_chargeback_id: gatewayChargebackId,
        reference_id,
        amount: cbAmount,
        currency: currency || "INR",
        status: "DISPUTED",
        reason: reason || "customer_dispute",
        message: auto
          ? `CHARGEBACK_CREATED webhook in ${delayMs}ms`
          : "Awaiting manual webhook",
      },
    });
  } catch (error) {
    console.error("[PayoutMock] /chargeback/create error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /chargeback/:id/accept
 * Called by DummyChargebackIntegrationService.acceptDispute()
 */
router.post("/:id/accept", (req, res) => {
  const cb = chargebackStore.getChargeback(req.params.id);
  if (!cb) {
    return res.status(404).json({ success: false, message: "Chargeback not found" });
  }
  if (cb.status === "REVERSED") {
    return res.status(400).json({
      success: false,
      message: "Chargeback already reversed",
      failure_code: "INVALID_STATE",
    });
  }
  chargebackStore.updateChargeback(req.params.id, {
    status: "ACCEPTED",
    acceptedAt: new Date().toISOString(),
  });
  return res.json({
    success: true,
    data: {
      chargeback_id: req.params.id,
      status: "ACCEPTED",
      amount: cb.amount,
      message: "Dispute accepted by merchant",
    },
  });
});

/**
 * POST /chargeback/:id/contest
 * Called by DummyChargebackIntegrationService.contestDispute()
 *
 * Body: { evidence: { ... } }
 */
router.post("/:id/contest", (req, res) => {
  const cb = chargebackStore.getChargeback(req.params.id);
  if (!cb) {
    return res.status(404).json({ success: false, message: "Chargeback not found" });
  }
  if (cb.status === "REVERSED") {
    return res.status(400).json({
      success: false,
      message: "Chargeback already reversed",
      failure_code: "INVALID_STATE",
    });
  }
  if (cb.status === "ACCEPTED") {
    return res.status(400).json({
      success: false,
      message: "Chargeback already accepted, cannot contest",
      failure_code: "INVALID_STATE",
    });
  }
  chargebackStore.updateChargeback(req.params.id, {
    status: "CONTESTED",
    contestedAt: new Date().toISOString(),
    evidence: req.body?.evidence || {},
  });
  return res.json({
    success: true,
    data: {
      chargeback_id: req.params.id,
      status: "CONTESTED",
      amount: cb.amount,
      message: "Dispute contested with evidence",
    },
  });
});

/**
 * GET /chargeback/:id
 * Called by DummyChargebackIntegrationService.fetchDispute()
 */
router.get("/:id", (req, res) => {
  const cb = chargebackStore.getChargeback(req.params.id);
  if (!cb) {
    return res.status(404).json({ success: false, message: "Chargeback not found" });
  }
  res.json({
    success: true,
    data: {
      chargeback_id: cb.gatewayChargebackId,
      reference_id: cb.referenceId,
      amount: cb.amount,
      currency: cb.currency,
      status: cb.status,
      reason: cb.reason,
      reason_description: cb.reasonDescription,
      respond_by: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
});

/**
 * POST /chargeback/:id/reverse
 * Testing convenience — fires CHARGEBACK_REVERSED webhook
 */
router.post("/:id/reverse", async (req, res) => {
  try {
    const cb = chargebackStore.getChargeback(req.params.id);
    if (!cb) {
      return res.status(404).json({ success: false, message: "Chargeback not found" });
    }
    const reason = req.body?.reason || "Chargeback reversed by bank";
    const result = await dispatcher.dispatchChargebackReversed(req.params.id, {
      reason,
    });
    return res.json({ success: true, data: { chargeback_id: req.params.id, reason, result } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /chargeback
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    count: chargebackStore.listChargebacks().length,
    data: chargebackStore.listChargebacks(),
  });
});

module.exports = router;