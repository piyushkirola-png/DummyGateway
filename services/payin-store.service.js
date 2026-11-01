const state = {
  payins: new Map(), // reference_id -> payin record
};

function createPayin({
  referenceId,
  transferId,
  amount,
  currency,
  paymentMode,
  customerName,
  customerEmail,
  customerPhone,
  behaviour,
}) {
  const record = {
    referenceId,
    transferId,
    amount: Number(amount),
    currency: currency || "INR",
    paymentMode: paymentMode || "PG",
    customerName,
    customerEmail,
    customerPhone,
    behaviour,
    status: "PENDING",
    utr: null,
    failureReason: null,
    failureCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  state.payins.set(referenceId, record);
  return record;
}

function updatePayin(referenceId, patch) {
  const existing = state.payins.get(referenceId);
  if (!existing) return null;
  const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  state.payins.set(referenceId, updated);
  return updated;
}

function getPayin(referenceId) {
  return state.payins.get(referenceId) || null;
}

function listPayins() {
  return Array.from(state.payins.values());
}

module.exports = {
  createPayin,
  updatePayin,
  getPayin,
  listPayins,
};