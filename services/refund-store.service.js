const state = {
  refunds: new Map(), // gateway_refund_id -> refund record
};

function createRefund({
  gatewayRefundId,
  localRefundId,
  referenceId,
  amount,
  currency,
  note,
  behaviour,
}) {
  const record = {
    gatewayRefundId,
    localRefundId,
    referenceId,
    amount: Number(amount),
    currency: currency || "INR",
    note,
    behaviour,
    status: "PENDING",
    failureReason: null,
    failureCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.refunds.set(gatewayRefundId, record);
  return record;
}

function updateRefund(gatewayRefundId, patch) {
  const existing = state.refunds.get(gatewayRefundId);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  state.refunds.set(gatewayRefundId, updated);
  return updated;
}

function getRefund(gatewayRefundId) {
  return state.refunds.get(gatewayRefundId) || null;
}

function listRefunds() {
  return Array.from(state.refunds.values());
}

module.exports = {
  createRefund,
  updateRefund,
  getRefund,
  listRefunds,
};