const axios = require("axios");
const crypto = require("crypto");
const payoutStore = require("./payout-store.service");

const BACKEND_URL =
  process.env.BACKEND_WEBHOOK_URL || "http://localhost:4000/api/webhooks/dummy";
const SECRET = process.env.DUMMY_WEBHOOK_SECRET || "dummy-webhook-secret";

function sign(payload) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function postWebhook(payload) {
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
    };
    payoutStore.logWebhook({ event: payload.event, payload, result });
    console.log(
      `[PayoutMock] Webhook ${payload.event} → ${BACKEND_URL} → HTTP ${response.status} (${result.latencyMs}ms)`,
    );
    return result;
  } catch (error) {
    const result = {
      ok: false,
      httpStatus: 0,
      responseBody: error.message,
      latencyMs: Date.now() - started,
    };
    payoutStore.logWebhook({
      event: payload.event,
      payload,
      result,
      error: true,
    });
    console.error(
      `[PayoutMock] Webhook ${payload.event} FAILED → ${BACKEND_URL}: ${error.message}`,
    );
    throw Object.assign(error, { result });
  }
}

// ==================== PAYIN ====================
async function dispatchPayinSuccess(referenceId, { utr, amount } = {}) {
  const payinStore = require("./payin-store.service");
  const payin = payinStore.getPayin(referenceId);
  const finalUtr = utr || `UTR${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const payload = {
    event: "PAYIN_SUCCESS",
    type: "PAYIN_SUCCESS",
    reference_id: referenceId,
    gateway_reference: payin?.transferId || `DUMMY_${Date.now()}`,
    status: "SUCCESS",
    amount: amount ?? payin?.amount ?? null,
    utr: finalUtr,
    fired_at: new Date().toISOString(),
  };
  payinStore.updatePayin(referenceId, { status: "COMPLETED", utr: finalUtr });
  return postWebhook(payload);
}

async function dispatchPayinFailed(referenceId, { reason, code, amount } = {}) {
  const payinStore = require("./payin-store.service");
  const payin = payinStore.getPayin(referenceId);
  const payload = {
    event: "PAYIN_FAILED",
    type: "PAYIN_FAILED",
    reference_id: referenceId,
    gateway_reference: payin?.transferId || `DUMMY_${Date.now()}`,
    status: "FAILED",
    amount: amount ?? payin?.amount ?? null,
    failure_reason: reason || "Payment failed at bank",
    failure_code: code || "PAYMENT_FAILED",
    fired_at: new Date().toISOString(),
  };
  payinStore.updatePayin(referenceId, {
    status: "FAILED",
    failureReason: payload.failure_reason,
    failureCode: payload.failure_code,
  });
  return postWebhook(payload);
}

// ==================== REFUND ====================
async function dispatchRefundSuccess(gatewayRefundId) {
  const refundStore = require("./refund-store.service");
  const refund = refundStore.getRefund(gatewayRefundId);
  if (!refund) throw new Error(`Refund not found: ${gatewayRefundId}`);

  const payload = {
    event: "REFUND_SUCCESS",
    type: "REFUND_SUCCESS",
    reference_id: refund.referenceId,
    gateway_refund_id: gatewayRefundId,
    refund_local_id: refund.localRefundId,
    refund_amount: refund.amount,
    status: "SUCCESS",
    fired_at: new Date().toISOString(),
  };
  refundStore.updateRefund(gatewayRefundId, { status: "COMPLETED" });
  return postWebhook(payload);
}

async function dispatchRefundFailed(gatewayRefundId, { reason, code } = {}) {
  const refundStore = require("./refund-store.service");
  const refund = refundStore.getRefund(gatewayRefundId);
  if (!refund) throw new Error(`Refund not found: ${gatewayRefundId}`);

  const payload = {
    event: "REFUND_FAILED",
    type: "REFUND_FAILED",
    reference_id: refund.referenceId,
    gateway_refund_id: gatewayRefundId,
    refund_local_id: refund.localRefundId,
    refund_amount: refund.amount,
    status: "FAILED",
    failure_reason: reason || "Refund failed at bank",
    failure_code: code || "REFUND_FAILED",
    fired_at: new Date().toISOString(),
  };
  refundStore.updateRefund(gatewayRefundId, {
    status: "FAILED",
    failureReason: payload.failure_reason,
    failureCode: payload.failure_code,
  });
  return postWebhook(payload);
}

// ==================== CHARGEBACK ====================
async function dispatchChargebackCreated(
  gatewayChargebackId,
  { reason, amount } = {},
) {
  const chargebackStore = require("./chargeback-store.service");
  const cb = chargebackStore.getChargeback(gatewayChargebackId);
  if (!cb) throw new Error(`Chargeback not found: ${gatewayChargebackId}`);

  const payload = {
    event: "CHARGEBACK_CREATED",
    type: "CHARGEBACK_CREATED",
    reference_id: cb.referenceId,
    chargeback_id: gatewayChargebackId,
    amount: amount ?? cb.amount,
    reason: reason || cb.reason,
    reason_description: cb.reasonDescription || null,
    status: "DISPUTED",
    fired_at: new Date().toISOString(),
  };
  return postWebhook(payload);
}

async function dispatchChargebackReversed(
  gatewayChargebackId,
  { reason } = {},
) {
  const chargebackStore = require("./chargeback-store.service");
  const cb = chargebackStore.getChargeback(gatewayChargebackId);
  if (!cb) throw new Error(`Chargeback not found: ${gatewayChargebackId}`);

  const payload = {
    event: "CHARGEBACK_REVERSED",
    type: "CHARGEBACK_REVERSED",
    reference_id: cb.referenceId,
    chargeback_id: gatewayChargebackId,
    amount: cb.amount,
    reason: reason || "Chargeback reversed by bank",
    status: "REVERSED",
    fired_at: new Date().toISOString(),
  };
  chargebackStore.updateChargeback(gatewayChargebackId, {
    status: "REVERSED",
    reversedAt: new Date().toISOString(),
  });
  return postWebhook(payload);
}

// ==================== PAYOUT ====================
async function dispatchPayoutSuccess(referenceId, { utr, amount } = {}) {
  const payout = payoutStore.getPayout(referenceId);
  const finalUtr = utr || `UTR${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const payload = {
    event: "PAYOUT_SUCCESS",
    type: "PAYOUT_SUCCESS",
    reference_id: referenceId,
    transfer_id: payout?.transferId || `DUMMY_${Date.now()}`,
    transfer_status: "SUCCESS",
    transfer_amount: amount ?? payout?.amount ?? null,
    bank_reference: finalUtr,
    failure_reason: null,
    failure_code: null,
    fired_at: new Date().toISOString(),
  };
  payoutStore.updatePayout(referenceId, { status: "COMPLETED", utr: finalUtr });
  return postWebhook(payload);
}

async function dispatchPayoutFailed(referenceId, { reason, code, amount } = {}) {
  const payout = payoutStore.getPayout(referenceId);
  const payload = {
    event: "PAYOUT_FAILED",
    type: "PAYOUT_FAILED",
    reference_id: referenceId,
    transfer_id: payout?.transferId || `DUMMY_${Date.now()}`,
    transfer_status: "FAILED",
    transfer_amount: amount ?? payout?.amount ?? null,
    bank_reference: null,
    failure_reason: reason || "Beneficiary account frozen",
    failure_code: code || "BENEFICIARY_INVALID",
    fired_at: new Date().toISOString(),
  };
  payoutStore.updatePayout(referenceId, {
    status: "FAILED",
    failureReason: payload.failure_reason,
    failureCode: payload.failure_code,
  });
  return postWebhook(payload);
}

async function dispatchPayoutPending(referenceId) {
  const payout = payoutStore.getPayout(referenceId);
  const payload = {
    event: "PAYOUT_PENDING",
    type: "PAYOUT_PENDING",
    reference_id: referenceId,
    transfer_id: payout?.transferId || `DUMMY_${Date.now()}`,
    transfer_status: "PENDING",
    transfer_amount: payout?.amount ?? null,
    bank_reference: null,
    fired_at: new Date().toISOString(),
  };
  payoutStore.updatePayout(referenceId, { status: "PENDING" });
  return postWebhook(payload);
}

module.exports = {
  postWebhook,
  dispatchPayoutSuccess,
  dispatchPayoutFailed,
  dispatchPayoutPending,
  dispatchPayinSuccess,
  dispatchPayinFailed,
  dispatchRefundSuccess,
  dispatchRefundFailed,
  dispatchChargebackCreated,
  dispatchChargebackReversed,
};