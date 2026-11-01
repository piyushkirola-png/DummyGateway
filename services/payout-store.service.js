const state = {
  payouts: new Map(),   // reference_id -> payout record
  webhookLog: [],
};

function createPayout({
  referenceId, transferId, amount, accountNumber, beneficiaryName,
  ifsc, bank, behaviour,
}) {
  const record = {
    referenceId,
    transferId,
    amount: Number(amount),
    accountNumber,
    beneficiaryName,
    ifsc,
    bank,
    behaviour,
    status: "PENDING",
    utr: null,
    failureReason: null,
    failureCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.payouts.set(referenceId, record);
  return record;
}

function updatePayout(referenceId, patch) {
  const existing = state.payouts.get(referenceId);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  state.payouts.set(referenceId, updated);
  return updated;
}

function getPayout(referenceId) {
  return state.payouts.get(referenceId) || null;
}

function listPayouts() {
  return Array.from(state.payouts.values());
}

function logWebhook(entry) {
  state.webhookLog.unshift({ ...entry, at: new Date().toISOString() });
  if (state.webhookLog.length > 200) state.webhookLog.pop();
}

function getWebhookLog(limit = 50) {
  return state.webhookLog.slice(0, limit);
}

module.exports = {
  createPayout, updatePayout, getPayout, listPayouts,
  logWebhook, getWebhookLog,
};