const state = {
  chargebacks: new Map(), // gateway_chargeback_id -> chargeback record
};

function createChargeback({
  gatewayChargebackId,
  referenceId,
  amount,
  currency,
  reason,
  reasonDescription,
  behaviour,
}) {
  const record = {
    gatewayChargebackId,
    referenceId,
    amount: Number(amount),
    currency: currency || "INR",
    reason,
    reasonDescription,
    behaviour,
    status: "DISPUTED",
    acceptedAt: null,
    contestedAt: null,
    reversedAt: null,
    evidence: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.chargebacks.set(gatewayChargebackId, record);
  return record;
}

function updateChargeback(gatewayChargebackId, patch) {
  const existing = state.chargebacks.get(gatewayChargebackId);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  state.chargebacks.set(gatewayChargebackId, updated);
  return updated;
}

function getChargeback(gatewayChargebackId) {
  return state.chargebacks.get(gatewayChargebackId) || null;
}

function listChargebacks() {
  return Array.from(state.chargebacks.values());
}

module.exports = {
  createChargeback,
  updateChargeback,
  getChargeback,
  listChargebacks,
};