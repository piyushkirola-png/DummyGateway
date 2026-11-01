const fs = require("fs");
const path = require("path");

const COUNTER_FILE = path.join(__dirname, "payout.txt");
const PREFIX = "PAYOUT-CSV-";
const PAD = 3;
const PAYMENT_MODES = ["BANK"];
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 1000;
const STEP = 100;
const BATCH = 501;

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// random multiple of STEP between min and max
function randomAmountMultiple(min, max, step) {
  const minSteps = Math.ceil(min / step);
  const maxSteps = Math.floor(max / step);
  const steps = Math.floor(Math.random() * (maxSteps - minSteps + 1)) + minSteps;
  return steps * step;
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

const rows = [
  "amount,merchantReference,paymentMode,beneficiaryName,beneficiaryAccount,beneficiaryIfsc,beneficiaryBank,email,mobile",
];

for (let i = start; i <= end; i++) {
  const ref = `${PREFIX}${String(i).padStart(PAD, "0")}`;
  const mode = pick(PAYMENT_MODES);
  const amount = randomAmountMultiple(MIN_AMOUNT, MAX_AMOUNT, STEP);

  rows.push(
    `${amount},${ref},${mode},Roop Singh,1098289282,KKBK0009821,Kotak Bank,roop@example.com,9876543210`,
  );
}

const outFile = `payouts-${start}-${end}.csv`;
fs.writeFileSync(outFile, rows.join("\n"));
fs.writeFileSync(COUNTER_FILE, String(end));

console.log(
  `Generated ${BATCH} rows: ${PREFIX}${String(start).padStart(PAD, "0")} → ${PREFIX}${String(end).padStart(PAD, "0")}`,
);
console.log(`CSV  : ${outFile}`);
console.log(`Next : ${PREFIX}${String(end + 1).padStart(PAD, "0")}`);