const fs = require("fs");
const path = require("path");

// ---- config ----
const COUNTER_FILE = path.join(__dirname, "payin.txt");
const PREFIX = "PAYIN-CSV-";
const PAD = 3;
const BATCH = 1000;

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
const PAYMENT_MODES = ["UPI", "CARD"];

// all 16-digit, Luhn-valid test cards (no Amex — 15 digits breaks length check)
const TEST_CARDS = [
  "4111111111111111",
  "4012888888881881",
  "4242424242424242",
  "5555555555554444",
  "5105105105105100",
  "2223003122003222",
  "6011111111111117",
  "3530111333300000",
  "3566002020360505",
];

// ---- helpers ----
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
function pad(n, len = 2) {
  return String(n).padStart(len, "0");
}
function randomName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}
function randomEmailFromName(name) {
  const [first, last] = name.toLowerCase().split(" ");
  const suffix = Math.random() < 0.5 ? "" : randInt(1, 99);
  return `${first}.${last}${suffix}@example.com`;
}
function randomPhone() {
  const first = randInt(6, 9);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += randInt(0, 9);
  return `${first}${rest}`;
}
function randomAmount() {
  return randInt(10, 50) * 100;
}

// CVV: always 3 digits, first digit 1-9 (avoid leading zero so it survives
// even if the parser later coerces to number). 3 digits is universally valid.
function randomCvv() {
  const first = randInt(1, 9);
  let rest = "";
  for (let i = 0; i < 2; i++) rest += randInt(0, 9);
  return `${first}${rest}`;
}

function randomCard() {
  const year = new Date().getFullYear() + randInt(1, 5);
  const month = randInt(1, 12);
  return {
    cardNumber: pick(TEST_CARDS),
    expiryMonth: pad(month, 2),
    expiryYear: String(year),
    cvv: randomCvv(),
  };
}

// ---- read last used counter ----
let last = 0;
if (fs.existsSync(COUNTER_FILE)) {
  const raw = fs.readFileSync(COUNTER_FILE, "utf8").trim();
  const parsed = parseInt(raw.replace(/\D/g, ""), 10);
  if (Number.isFinite(parsed)) last = parsed;
}

const start = last + 1;
const end = last + BATCH;

// ---- header: 12 columns ----
const header = [
  "amount",
  "currency",
  "merchantReference",
  "paymentMode",
  "customerName",
  "customerEmail",
  "customerPhone",
  "cardHolderName",
  "cardNumber",
  "expiryMonth",
  "expiryYear",
  "cvv",
];

const rows = [header.join(",")];

for (let i = start; i <= end; i++) {
  const ref = `${PREFIX}${String(i).padStart(PAD, "0")}`;
  const name = randomName();
  const email = randomEmailFromName(name);
  const phone = randomPhone();
  const amount = randomAmount();
  const mode = pick(PAYMENT_MODES);

  let cardHolderName = "";
  let cardNumber = "";
  let expiryMonth = "";
  let expiryYear = "";
  let cvv = "";

  if (mode === "CARD") {
    const card = randomCard();
    cardHolderName = name;
    cardNumber = card.cardNumber;
    expiryMonth = card.expiryMonth;
    expiryYear = card.expiryYear;
    cvv = card.cvv;
  }

  // Quote ONLY string-critical fields so leading zeros survive and
  // `.length` checks work. Leave plain text/number fields unquoted.
  rows.push(
    [
      amount, // number, no quotes
      "INR", // text, no quotes
      ref, // text, no quotes (has no comma)
      mode, // text, no quotes
      name, // text, no quotes (no comma)
      email, // text, no quotes (no comma)
      phone ? `"${phone}"` : "", // quoted: string
      cardHolderName ? `"${cardHolderName}"` : "", // quoted: string
      cardNumber ? `"${cardNumber}"` : "", // quoted: string, .length check
      expiryMonth ? `"${expiryMonth}"` : "", // quoted: string ("05")
      expiryYear ? `"${expiryYear}"` : "", // quoted: string
      cvv ? `"${cvv}"` : "", // quoted: string, .length check
    ].join(","),
  );
}

const outFile = `payins-${start}-${end}.csv`;
fs.writeFileSync(outFile, rows.join("\n"));
fs.writeFileSync(COUNTER_FILE, String(end));

console.log(
  `Generated ${BATCH} rows: ${PREFIX}${String(start).padStart(PAD, "0")} → ${PREFIX}${String(end).padStart(PAD, "0")}`,
);
console.log(`CSV  : ${outFile}`);
console.log(`Next : ${PREFIX}${String(end + 1).padStart(PAD, "0")}`);
