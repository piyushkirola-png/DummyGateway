const axios = require("axios");
const crypto = require("crypto");
const bankAccountService = require("./bank-account.service");

const BACKEND_URL =
  process.env.BACKEND_WEBHOOK_URL || "http://localhost:4000/api/webhooks/dummy";
const SECRET = process.env.DUMMY_WEBHOOK_SECRET || "dummy-webhook-secret";

/**
 * Build the webhook payload in the shape dummy.webhook.js expects.
 */
function buildPayload({
  merchantReference,
  transferId,
  status,
  utr,
  amount,
  failureReason,
  failureCode,
}) {
  const normalised = String(status || "COMPLETED").toUpperCase();

  const transferStatus =
    normalised === "COMPLETED"
      ? "SUCCESS"
      : normalised === "FAILED"
        ? "FAILED"
        : normalised === "PENDING"
          ? "PENDING"
          : normalised;

  const event =
    normalised === "COMPLETED"
      ? "PAYOUT_SUCCESS"
      : normalised === "FAILED"
        ? "PAYOUT_FAILED"
        : "PAYOUT_PENDING";

  return {
    event,
    type: event,
    reference_id: merchantReference || null,
    transfer_id: transferId || `DUMMY_${Date.now()}`,
    transfer_status: transferStatus,
    transfer_amount: amount != null ? Number(amount) : null,
    bank_reference: utr || null,
    failure_reason: failureReason || null,
    failure_code: failureCode || null,
    fired_at: new Date().toISOString(),
  };
}

function sign(payload) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");
}

/**
 * Fire one webhook (unsigned but headers include signature).
 */
async function fireOnce(payload) {
  const signature = sign(payload);

  const started = Date.now();
  try {
    const response = await axios.post(BACKEND_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "x-dummy-signature": signature,
        "x-webhook-signature": signature,
      },
      timeout: 10000,
      validateStatus: () => true,
    });

    const result = {
      ok: response.status >= 200 && response.status < 300,
      httpStatus: response.status,
      responseBody: response.data,
      latencyMs: Date.now() - started,
      signed: signature,
    };
    bankAccountService.logWebhook({ ...payload, result });
    return result;
  } catch (error) {
    const result = {
      ok: false,
      httpStatus: 0,
      responseBody: error.message,
      latencyMs: Date.now() - started,
      signed: signature,
    };
    bankAccountService.logWebhook({ ...payload, result });
    throw Object.assign(error, { result });
  }
}

/**
 * Fire webhook. Supports:
 *  - duplicate:      fires the same eventId twice (2s apart)
 *  - delaySeconds:   fires after N seconds (fire-and-forget)
 */
async function fire({
  merchantReference,
  transferId,
  status = "COMPLETED",
  utr,
  amount,
  failureReason,
  failureCode,
  delaySeconds = 0,
  duplicate = false,
}) {
  if (!merchantReference) {
    throw new Error("merchantReference is required");
  }

  const payload = buildPayload({
    merchantReference,
    transferId,
    status,
    utr:
      utr ||
      (String(status).toUpperCase() === "COMPLETED"
        ? `UTR${Date.now()}`
        : null),
    amount,
    failureReason,
    failureCode,
  });

  // Delayed fire-and-forget
  if (delaySeconds && Number(delaySeconds) > 0) {
    const ms = Number(delaySeconds) * 1000;
    setTimeout(() => {
      fireOnce(payload).catch((err) =>
        console.error("[PayoutMock] Delayed fire failed:", err.message),
      );
      if (duplicate) {
        setTimeout(() => {
          fireOnce(payload).catch((err) =>
            console.error(
              "[PayoutMock] Delayed duplicate fire failed:",
              err.message,
            ),
          );
        }, 2000);
      }
    }, ms);

    return {
      scheduled: true,
      delaySeconds: Number(delaySeconds),
      duplicate: Boolean(duplicate),
      payload,
    };
  }

  // Immediate
  const result = await fireOnce(payload);

  // Duplicate test
  let duplicateResult = null;
  if (duplicate) {
    await new Promise((r) => setTimeout(r, 2000));
    duplicateResult = await fireOnce(payload);
  }

  return {
    scheduled: false,
    payload,
    result,
    duplicate: duplicate ? duplicateResult : null,
  };
}

module.exports = { fire, buildPayload, sign };
