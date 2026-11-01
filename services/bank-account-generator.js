const bankAccountService = require("./bank-account.service");

// ---- data pools ----
const FIRST_NAMES = [
  "Emma",
  "Rahul",
  "Aarav",
  "Priya",
  "Arjun",
  "Sneha",
  "Vikram",
  "Ananya",
  "Rohan",
  "Neha",
  "Karan",
  "Pooja",
  "Aditya",
  "Isha",
  "Siddharth",
  "Divya",
  "Manish",
  "Kavya",
  "Nikhil",
  "Riya",
  "Amit",
  "Tara",
  "Varun",
  "Meera",
  "Sanjay",
  "Anjali",
  "Rajesh",
  "Kritika",
  "Deepak",
  "Shreya",
];
const LAST_NAMES = [
  "Wilson",
  "Sharma",
  "Patel",
  "Gupta",
  "Singh",
  "Kumar",
  "Verma",
  "Reddy",
  "Nair",
  "Iyer",
  "Joshi",
  "Mehta",
  "Desai",
  "Kapoor",
  "Malhotra",
  "Bhat",
  "Rao",
  "Chopra",
  "Saxena",
  "Agarwal",
  "Shah",
  "Pillai",
  "Kulkarni",
  "Mishra",
  "Yadav",
  "Trivedi",
  "Bansal",
  "Khanna",
  "Menon",
  "Das",
];

// Real-ish bank codes + a valid IFSC pattern: 4 letters + 0 + 6 alnum
const BANKS = [
  { code: "HDFC", name: "HDFC Bank" },
  { code: "ICIC", name: "ICICI Bank" },
  { code: "SBIN", name: "State Bank of India" },
  { code: "AXIS", name: "Axis Bank" },
  { code: "KKBK", name: "Kotak Mahindra Bank" },
  { code: "PUNB", name: "Punjab National Bank" },
  { code: "UTIB", name: "Axis Bank (UTIB)" },
  { code: "YESB", name: "Yes Bank" },
  { code: "IDFB", name: "IDFC First Bank" },
  { code: "BARB", name: "Bank of Baroda" },
];

const BEHAVIOURS = [
  "PENDING_THEN_SUCCESS",
  "PENDING_THEN_SUCCESS",
  "PENDING_THEN_SUCCESS", // weighted toward success
  "BUSINESS_FAIL",
  "PENDING_THEN_FAIL",
  "TIMEOUT",
  "RETRY_503",
  "NEVER_CALLBACK",
];

// ---- helpers ----
function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function randomAccountNumber(prefix = "") {
  // 10-digit account number. First digit optionally overrides behaviour.
  // Prefix "1" -> PENDING_THEN_SUCCESS, "2" -> BUSINESS_FAIL, etc. (see routes/payouts.routes.js)
  let num = "";
  for (let i = 0; i < 10; i++) num += randInt(0, 9);
  if (prefix) num = prefix + num.slice(1);
  return num;
}

function randomIfsc(bank) {
  // 4 letters + '0' + 6 alnum  (valid IFSC format)
  let suffix = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 6; i++) suffix += chars[randInt(0, chars.length - 1)];
  return `${bank.code}0${suffix}`;
}

function randomMaxReceivable() {
  // 0 = no limit; otherwise 50k–5L
  const useLimit = Math.random() < 0.5;
  if (!useLimit) return 0;
  return randInt(50, 500) * 1000; // 50000..500000, multiple of 1000
}

/**
 * Seed N random accounts into bankAccountService (in-memory).
 * Skips accounts that already exist (idempotent).
 */
function seedRandomAccounts(count = 50, options = {}) {
  const { prefixBehaviours = true, maxReceivable = true } = options;
  const created = [];

  for (let i = 0; i < count; i++) {
    const bank = pick(BANKS);
    const name = randomName();
    const ifsc = randomIfsc(bank);

    // If prefixBehaviours=true, first digit of account encodes behaviour
    // so the payout route picks it up from the account number itself.
    let prefix = "";
    if (prefixBehaviours) {
      // distribution: mostly "1" (success), some "2"/"4"/"5"/"6"/"7"
      const r = Math.random();
      prefix =
        r < 0.6
          ? "1"
          : r < 0.7
            ? "2"
            : r < 0.8
              ? "4"
              : r < 0.88
                ? "5"
                : r < 0.94
                  ? "6"
                  : "7";
    }

    const account = randomAccountNumber(prefix);
    if (bankAccountService.getAccount(account)) continue; // avoid dup

    const record = {
      account,
      name,
      ifsc,
      bank: bank.name,
      // Behaviour stored on the account also drives mock decisions
      behaviour: pick(BEHAVIOURS),
      maxReceivable: maxReceivable ? randomMaxReceivable() : 0,
    };

    try {
      bankAccountService.addAccount(record);
      created.push(record);
    } catch (err) {
      // silently skip invalid
    }
  }

  return created;
}

/**
 * Get a random *existing* account (useful for CSV generators).
 */
function pickRandomAccount() {
  const all = bankAccountService.listAccounts();
  return all.length ? pick(all) : null;
}

module.exports = { seedRandomAccounts, pickRandomAccount };
