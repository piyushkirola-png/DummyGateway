const express = require("express");
const { v4: uuid } = require("uuid");
const bankAccounts = require("../services/bank-account.service");
const payinStore = require("../services/payin-store.service");
const dispatcher = require("../services/webhook-dispatcher.service");

const router = express.Router();

/**
 * POST /payin/create
 * Called by DummyPayinIntegrationService.initiatePayInRequest()
 *
 * Body: { reference_id, amount, currency, payment_mode,
 *         customer_name, customer_email, customer_phone,
 *         callback_url, return_url }
 */
router.post("/create", async (req, res) => {
  try {
    const {
      reference_id,
      amount,
      currency,
      payment_mode,
      customer_name,
      customer_email,
      customer_phone,
      return_url,
    } = req.body || {};

    if (!reference_id) {
      return res
        .status(400)
        .json({ success: false, message: "reference_id is required" });
    }
    if (!amount || Number(amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "amount must be > 0" });
    }

    // Idempotent re-issue
    const existing = payinStore.getPayin(reference_id);
    if (existing) {
      return res.json({
        success: true,
        idempotent: true,
        data: {
          reference_id: existing.referenceId,
          gateway_reference: existing.transferId,
          status: existing.status,
          amount: existing.amount,
          checkout_url: `${process.env.PAYOUT_MOCK_URL || "http://localhost:4100"}/pay/${encodeURIComponent(existing.referenceId)}`,
        },
      });
    }

    // Behaviour: first digit of reference_id or default
    const first = String(reference_id).charAt(0);
    const behaviour =
      first === "2" ? "PAYIN_FAIL" : "PAYIN_SUCCESS_AFTER_DELAY";

    const transferId = `DUMMY_PAYIN_${Date.now()}_${uuid().slice(0, 6)}`;
    const mockBase =
      process.env.PAYOUT_MOCK_URL ||
      `http://localhost:${process.env.PAYOUT_MOCK_PORT || 4100}`;
    const checkoutUrl = `${mockBase}/pay/${encodeURIComponent(reference_id)}`;

    payinStore.createPayin({
      referenceId: reference_id,
      transferId,
      amount: Number(amount),
      currency: currency || "INR",
      paymentMode: payment_mode || "PG",
      customerName: customer_name,
      customerEmail: customer_email,
      customerPhone: customer_phone,
      behaviour,
    });

    // Read once — used by both success and failure paths
    const delayMs = Number(process.env.AUTO_CALLBACK_DELAY_MS || 0);
    const auto = String(process.env.AUTO_CALLBACK_ENABLED || "true") === "true";

    // -------- Immediate business failure --------
    if (behaviour === "PAYIN_FAIL") {
      payinStore.updatePayin(reference_id, {
        status: "FAILED",
        failureReason: "Payment declined by bank",
        failureCode: "PAYMENT_FAILED",
      });

      if (auto) {
        const fireFail = () =>
          dispatcher
            .dispatchPayinFailed(reference_id, {
              reason: "Payment declined by bank",
              code: "PAYMENT_FAILED",
            })
            .catch((e) =>
              console.error("[PayoutMock] payin fail callback error:", e.message),
            );

        if (delayMs > 0) setTimeout(fireFail, delayMs);
        else fireFail();
      }

      return res.status(200).json({
        success: false,
        message: "Payment declined by bank",
        failure_code: "PAYMENT_FAILED",
        reference_id: reference_id,
        gateway_reference: transferId,
        checkout_url: checkoutUrl,
        return_url: return_url || null,
      });
    }

    // -------- Success path: fire callback (inline when delay=0) --------
    if (auto) {
      const fireSuccess = () =>
        dispatcher
          .dispatchPayinSuccess(reference_id, { amount: Number(amount) })
          .catch((e) =>
            console.error(
              "[PayoutMock] payin success callback error:",
              e.message,
            ),
          );

      if (delayMs > 0) setTimeout(fireSuccess, delayMs);
      else fireSuccess();
    }

    return res.json({
      success: true,
      data: {
        reference_id: reference_id,
        gateway_reference: transferId,
        status: "PROCESSING",
        amount: Number(amount),
        currency: currency || "INR",
        checkout_url: checkoutUrl,
        return_url: return_url || null,
        message: auto
          ? delayMs > 0
            ? `Callback scheduled in ${delayMs}ms`
            : "Callback fired immediately"
          : "Awaiting manual webhook via POST /webhook/fire",
      },
    });
  } catch (error) {
    console.error("[PayoutMock] /payin/create error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /payin/:reference
 * Called by DummyPayinIntegrationService.checkStatus()
 */
router.get("/:reference", (req, res) => {
  const record = payinStore.getPayin(req.params.reference);
  if (!record) {
    return res.status(404).json({ success: false, message: "Payin not found" });
  }
  res.json({
    success: true,
    data: {
      reference_id: record.referenceId,
      gateway_reference: record.transferId,
      status:
        record.status === "COMPLETED"
          ? "SUCCESS"
          : record.status === "FAILED"
            ? "FAILED"
            : "PENDING",
      amount: record.amount,
      currency: record.currency,
      utr: record.utr,
      failure_reason: record.failureReason,
      failure_code: record.failureCode,
    },
  });
});

/**
 * GET /payin (list)
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    count: payinStore.listPayins().length,
    data: payinStore.listPayins(),
  });
});

module.exports = router;