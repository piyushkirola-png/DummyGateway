const express = require("express");
const { v4: uuid } = require("uuid");
const bankAccounts = require("../services/bank-account.service");
const payoutStore = require("../services/payout-store.service");
const dispatcher = require("../services/webhook-dispatcher.service");

const router = express.Router();

/**
 * POST /payouts
 * Called by fintech-backend's DummyPayoutIntegrationService.
 *
 * Behaviour: PENDING immediately + auto webhook fires right away
 * (controlled by AUTO_CALLBACK_ENABLED / AUTO_CALLBACK_DELAY_MS).
 */
router.post("/", async (req, res) => {
  try {
    const {
      reference_id,
      transfer_amount,
      beneficiary_account,
      beneficiary_ifsc,
      beneficiary_name,
      idempotency_key,
    } = req.body || {};

    if (!reference_id) {
      return res
        .status(400)
        .json({ success: false, message: "reference_id is required" });
    }
    if (!transfer_amount || Number(transfer_amount) <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "transfer_amount must be > 0" });
    }

    // Idempotency: if this reference is already known, return same result
    const existing = payoutStore.getPayout(reference_id);
    if (existing) {
      return res.json({
        success: true,
        idempotent: true,
        data: {
          reference_id: existing.referenceId,
          transfer_id: existing.transferId,
          transfer_status:
            existing.status === "COMPLETED"
              ? "SUCCESS"
              : existing.status === "FAILED"
                ? "FAILED"
                : "PENDING",
          transfer_amount: existing.amount,
          bank_reference: existing.utr,
          failure_reason: existing.failureReason,
          failure_code: existing.failureCode,
        },
      });
    }

    const transferId = `DUMMY_${Date.now()}_${uuid().slice(0, 6)}`;
    const account = bankAccounts.getAccount(beneficiary_account);

    // ---------- Decide behaviour ----------
    let behaviour = account?.behaviour || null;
    if (!behaviour) {
      const first = String(beneficiary_account || "").charAt(0);
      behaviour =
        first === "2"
          ? "BUSINESS_FAIL"
          : first === "5"
            ? "TIMEOUT"
            : first === "6"
              ? "RETRY_503"
              : first === "7"
                ? "NEVER_CALLBACK"
                : first === "4"
                  ? "PENDING_THEN_FAIL"
                  : "PENDING_THEN_SUCCESS";
    }

    // Save record
    payoutStore.createPayout({
      referenceId: reference_id,
      transferId,
      amount: Number(transfer_amount),
      accountNumber: beneficiary_account,
      beneficiaryName: beneficiary_name,
      ifsc: beneficiary_ifsc,
      bank: account?.bank || "Unknown",
      behaviour,
    });

    const fail = (reason, code, extra = {}) => {
      payoutStore.updatePayout(reference_id, {
        status: "FAILED",
        failureReason: reason,
        failureCode: code,
      });
      const data = {
        transfer_id: transferId,
        transfer_status: "FAILED",
        transfer_amount: Number(transfer_amount),
        reference_id: reference_id,
        failure_reason: reason,
        failure_code: code,
        ...extra,
      };
      return res.json({ success: true, data });
    };

    // ---------- Validation ----------
    const ifsc = beneficiary_ifsc ? String(beneficiary_ifsc).toUpperCase() : "";
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      return fail(`Invalid IFSC: ${beneficiary_ifsc}`, "BENEFICIARY_INVALID");
    }
    if (!account) {
      return fail(
        `Beneficiary account not found: ${beneficiary_account}`,
        "BENEFICIARY_INVALID",
      );
    }
    if (account.ifsc && account.ifsc.toUpperCase() !== ifsc) {
      return fail(
        `IFSC mismatch. Expected ${account.ifsc}, got ${ifsc}`,
        "BENEFICIARY_INVALID",
      );
    }
    if (
      Number(account.maxReceivable || 0) > 0 &&
      Number(transfer_amount) > Number(account.maxReceivable)
    ) {
      return fail(
        `Amount ${transfer_amount} exceeds bank limit ${account.maxReceivable}`,
        "TRANSACTION_LIMIT_EXCEEDED",
      );
    }

    // ---------- TIMEOUT ----------
    if (behaviour === "TIMEOUT") {
      return res.status(504).json({
        success: false,
        message: "Gateway timeout",
        transfer_id: transferId,
      });
    }

    // ---------- RETRY_503 ----------
    if (behaviour === "RETRY_503") {
      return res.status(503).json({
        success: false,
        message: "Dummy gateway temporarily unavailable",
        failure_code: "SERVICE_UNAVAILABLE",
        transfer_id: transferId,
      });
    }

    // ---------- BUSINESS_FAIL ----------
    if (behaviour === "BUSINESS_FAIL") {
      return fail("Beneficiary account blocked by bank", "BENEFICIARY_INVALID");
    }

    // ---------- PENDING + auto webhook ----------
    const delayMs = Number(process.env.AUTO_CALLBACK_DELAY_MS || 0);
    const auto = String(process.env.AUTO_CALLBACK_ENABLED || "true") === "true";

    const fireWebhook = () => {
      if (behaviour === "PENDING_THEN_SUCCESS") {
        dispatcher
          .dispatchPayoutSuccess(reference_id, {
            amount: Number(transfer_amount),
          })
          .catch((e) =>
            console.error("[PayoutMock] auto success callback failed:", e.message),
          );
      } else if (behaviour === "PENDING_THEN_FAIL") {
        dispatcher
          .dispatchPayoutFailed(reference_id, {
            amount: Number(transfer_amount),
          })
          .catch((e) =>
            console.error("[PayoutMock] auto fail callback failed:", e.message),
          );
      }
    };

    if (auto && behaviour !== "NEVER_CALLBACK") {
      if (delayMs > 0) {
        setTimeout(fireWebhook, delayMs);
      } else {
        // Fire immediately (fire-and-forget; response is not blocked)
        fireWebhook();
      }
    }

    return res.json({
      success: true,
      data: {
        transfer_id: transferId,
        transfer_status: "PENDING",
        transfer_amount: Number(transfer_amount),
        reference_id: reference_id,
        idempotency_key: idempotency_key || null,
        behaviour,
        message:
          auto && behaviour !== "NEVER_CALLBACK"
            ? delayMs > 0
              ? `Callback scheduled in ${delayMs}ms`
              : "Callback fired immediately"
            : "Awaiting manual webhook",
      },
    });
  } catch (error) {
    console.error("[PayoutMock] /payouts error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /payouts
 */
router.get("/", (req, res) => {
  res.json({
    success: true,
    count: payoutStore.listPayouts().length,
    data: payoutStore.listPayouts(),
  });
});

/**
 * GET /payouts/:reference
 */
router.get("/:reference", (req, res) => {
  const record = payoutStore.getPayout(req.params.reference);
  if (!record) {
    return res
      .status(404)
      .json({ success: false, message: "Payout not found" });
  }
  res.json({
    success: true,
    data: {
      reference_id: record.referenceId,
      transfer_id: record.transferId,
      transfer_status:
        record.status === "COMPLETED"
          ? "SUCCESS"
          : record.status === "FAILED"
            ? "FAILED"
            : "PENDING",
      transfer_amount: record.amount,
      bank_reference: record.utr,
      failure_reason: record.failureReason,
      failure_code: record.failureCode,
      behaviour: record.behaviour,
    },
  });
});

module.exports = router;