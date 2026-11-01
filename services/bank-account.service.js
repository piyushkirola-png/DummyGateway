const state = {
  accounts: new Map(),
};

const VALID_BEHAVIOURS = new Set([
  "SUCCESS",
  "BUSINESS_FAIL",
  "TIMEOUT",
  "RETRY_503",
  "PENDING_THEN_SUCCESS",
  "PENDING_THEN_FAIL",
  "NEVER_CALLBACK",
]);

function parseSeedLine(line) {
  if (!line) return null;
  const parts = String(line).split("|").map((p) => p.trim());
  if (parts.length < 4) return null;
  const [account, name, ifsc, bank, behaviour, maxReceivable] = parts;
  if (!account || !name || !ifsc || !bank) return null;
  return {
    account: String(account),
    name: String(name),
    ifsc: String(ifsc).toUpperCase(),
    bank: String(bank),
    behaviour: behaviour ? String(behaviour).toUpperCase() : "PENDING_THEN_SUCCESS",
    maxReceivable: maxReceivable ? Number(maxReceivable) : 0,
    createdAt: new Date().toISOString(),
  };
}

function seedFromEnv() {
  const record = parseSeedLine(process.env.SEED_ACCOUNT);
  if (record) {
    state.accounts.set(record.account, record);
    console.log(`[PayoutMock] Seeded account ${record.account} (${record.behaviour})`);
  }
}

function listAccounts() {
  return Array.from(state.accounts.values());
}

function getAccount(account) {
  if (!account) return null;
  return state.accounts.get(String(account)) || null;
}

function addAccount(input) {
  if (!input || !input.account) throw new Error("account is required");
  const account = String(input.account);
  const name = String(input.name || "").trim();
  const ifsc = String(input.ifsc || "").toUpperCase().trim();
  const bank = String(input.bank || "").trim();
  const behaviour = String(input.behaviour || "PENDING_THEN_SUCCESS").toUpperCase();
  const maxReceivable = Number(input.maxReceivable || 0);

  if (!name) throw new Error("name is required");
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new Error("invalid ifsc");
  if (!bank) throw new Error("bank is required");
  if (!VALID_BEHAVIOURS.has(behaviour)) throw new Error("invalid behaviour");

  const record = {
    account, name, ifsc, bank, behaviour,
    maxReceivable: Number.isFinite(maxReceivable) ? maxReceivable : 0,
    createdAt: new Date().toISOString(),
  };
  state.accounts.set(account, record);
  return record;
}

function deleteAccount(account) {
  return state.accounts.delete(String(account));
}

module.exports = {
  seedFromEnv, listAccounts, getAccount, addAccount, deleteAccount,
  VALID_BEHAVIOURS,
};