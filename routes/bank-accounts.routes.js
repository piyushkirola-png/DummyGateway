const express = require("express");
const service = require("../services/bank-account.service");

const router = express.Router();

// IMPORTANT: register fixed paths BEFORE ":account"
router.get("/", (req, res) => {
  res.json({
    success: true,
    count: service.listAccounts().length,
    data: service.listAccounts(),
  });
});

router.post("/", (req, res) => {
  try {
    const record = service.addAccount(req.body);
    res.status(201).json({ success: true, data: record });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post("/verify", (req, res) => {
  const { account, ifsc, name } = req.body || {};
  const record = service.getAccount(account);
  if (!record)
    return res.json({
      success: true,
      valid: false,
      reason: "ACCOUNT_NOT_FOUND",
    });
  if (ifsc && record.ifsc !== String(ifsc).toUpperCase())
    return res.json({
      success: true,
      valid: false,
      reason: "IFSC_MISMATCH",
      expected: record.ifsc,
    });
  if (name && record.name.toLowerCase() !== String(name).toLowerCase())
    return res.json({
      success: true,
      valid: false,
      reason: "NAME_MISMATCH",
      expected: record.name,
    });
  res.json({ success: true, valid: true, account: record });
});

router.get("/meta/behaviours", (req, res) => {
  res.json({ success: true, data: Array.from(service.VALID_BEHAVIOURS) });
});

router.get("/:account", (req, res) => {
  const record = service.getAccount(req.params.account);
  if (!record)
    return res
      .status(404)
      .json({ success: false, message: "Account not found" });
  res.json({ success: true, data: record });
});

router.delete("/:account", (req, res) => {
  const ok = service.deleteAccount(req.params.account);
  if (!ok)
    return res
      .status(404)
      .json({ success: false, message: "Account not found" });
  res.json({ success: true, message: "Deleted" });
});

module.exports = router;
