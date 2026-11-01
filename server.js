require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const bankAccountService = require("./services/bank-account.service");
const payinStore = require("./services/payin-store.service");
const bankAccountsRoutes = require("./routes/bank-accounts.routes");
const payoutsRoutes = require("./routes/payouts.routes");
const payinRoutes = require("./routes/payin.routes");
const refundRoutes = require("./routes/refund.routes");
const chargebackRoutes = require("./routes/chargeback.routes");
const webhookTriggerRoutes = require("./routes/webhook-trigger.routes");
const bankAccountGenerator = require("./services/bank-account-generator");
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "payout-mock",
    port: process.env.PAYOUT_MOCK_PORT || 4100,
    backendWebhookUrl: process.env.BACKEND_WEBHOOK_URL,
    accounts: bankAccountService.listAccounts().length,
    autoCallbacks: process.env.AUTO_CALLBACK_ENABLED === "true",
    autoCallbackDelayMs: Number(process.env.AUTO_CALLBACK_DELAY_MS || 0),
    uptime: process.uptime(),
  });
});

// Dummy hosted checkout page
app.get("/pay/:reference", (req, res) => {
  const ref = req.params.reference;
  const payin = payinStore.getPayin(ref);
  if (!payin) {
    return res.status(404).send(
      `<html><body style="font-family:sans-serif;text-align:center;padding:50px">
        <h1>Payment reference not found</h1>
        <p>Reference: <code>${ref}</code></p>
      </body></html>`,
    );
  }
  return res.send(
    `<html><body style="font-family:sans-serif;text-align:center;padding:50px">
      <h1>Dummy Payment Checkout</h1>
      <p><strong>Reference:</strong> ${payin.referenceId}</p>
      <p><strong>Amount:</strong> INR ${payin.amount} ${payin.currency}</p>
      <p><strong>Status:</strong> ${payin.status}</p>
      <p>The mock will fire a webhook in a few seconds.</p>
      <p>This page is just a placeholder - no action needed.</p>
    </body></html>`,
  );
});

app.use("/bank-accounts", bankAccountsRoutes);
app.use("/payouts", payoutsRoutes);
app.use("/payin", payinRoutes);
app.use("/refund", refundRoutes);
app.use("/chargeback", chargebackRoutes);
app.use("/webhook", webhookTriggerRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error("[PayoutMock] Error:", err.message);
  res.status(err.status || 500).json({ success: false, message: err.message });
});

const PORT = Number(process.env.PAYOUT_MOCK_PORT || 4100);
bankAccountService.seedFromEnv();

const RANDOM_ACCOUNTS = Number(process.env.RANDOM_ACCOUNT_COUNT || 50);
if (RANDOM_ACCOUNTS > 0) {
  const created = bankAccountGenerator.seedRandomAccounts(RANDOM_ACCOUNTS, {
    prefixBehaviours: true,
    maxReceivable: true,
  });
  console.log(`[PayoutMock] Generated ${created.length} random bank accounts`);
}

app.listen(PORT, () => {
  console.log("=================================================");
  console.log(`  PayoutMock (dummy gateway) on :${PORT}`);
  console.log(`  Backend webhook target: ${process.env.BACKEND_WEBHOOK_URL}`);
  console.log(`  Auto callbacks: ${process.env.AUTO_CALLBACK_ENABLED}`);
  console.log(
    `  Auto callback delay: ${process.env.AUTO_CALLBACK_DELAY_MS} ms`,
  );
  console.log(`  Seeded accounts: ${bankAccountService.listAccounts().length}`);
  console.log("=================================================");
  console.log("  Bank lookup     : GET  /bank-accounts/:account");
  console.log(
    "  Initiate payout : POST /payouts           <- called by backend",
  );
  console.log("  Payout status   : GET  /payouts/:reference");
  console.log(
    "  Initiate payin  : POST /payin/create      <- called by backend",
  );
  console.log("  Checkout page   : GET  /pay/:reference");
  console.log(
    "  Create refund   : POST /refund/create     <- called by backend",
  );
  console.log("  Refund status   : GET  /refund/:gatewayRefundId");
  console.log("  Create CB       : POST /chargeback/create");
  console.log("  CB accept       : POST /chargeback/:id/accept");
  console.log("  CB contest      : POST /chargeback/:id/contest");
  console.log("  CB reverse      : POST /chargeback/:id/reverse");
  console.log("  CB status       : GET  /chargeback/:id");
  console.log("  Manual webhook  : POST /webhook/fire      <- testing only");
  console.log("  Webhook log     : GET  /webhook/log");
  console.log("=================================================");
});
