# PayoutMock

Standalone mock server for testing the fintech payout flow against the
dummy gateway (gatewayId = 19).

Runs on **:4100**. Listens for:
- bank account lookups (called by your fintech backend)
- manual webhook triggers (called by you from Postman)

---

## Setup

```bash
cd C:\Users\DELL\Documents\PayoutMock
npm install