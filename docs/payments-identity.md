# Chaufr payments, payouts, refunds and driver verification

## Provider selected: Paystack South Africa

The first production adapter uses Paystack because its South African integration supports hosted card checkout, ZAR payment verification, refunds, South African bank-account resolution and bank transfers. Provider documentation:
- Payments and hosted checkout: https://paystack.com/docs/v2/za/payments/
- Verify a transaction: https://paystack.com/docs/v2/za/payments/online/verify-payments
- Refunds: https://paystack.com/docs/api/refund/
- South African transfer onboarding and recipient creation: https://paystack.com/docs/v2/za/disbursements/get-started and https://paystack.com/docs/v2/za/disbursements/transfers/recipients
- Transfers and transfer webhooks: https://paystack.com/docs/v2/za/disbursements/get-started

## Checkout and webhook

Authenticated users call `POST /v1/payments/checkout`:
- Passenger: `{"purpose":"passenger_trip","tripId":"<trip UUID>"}`
- Driver: `{"purpose":"driver_activation"}`

The API derives the amount from the stored trip fare or the R30 daily activation record. It never trusts a client-supplied amount. It creates a Paystack hosted checkout and returns `checkoutUrl`; the Android client must open this URL in a Custom Tab/browser. Payment is only fulfilled after Paystack's signed webhook is received and the transaction is verified server-to-server.

Set the Paystack dashboard webhook URL to `https://<API_HOST>/v1/webhooks/paystack`. The webhook validates the HMAC-SHA512 signature over the exact raw request body (using the API secret for the South African `x-paystack-signature` flow, or the dedicated secret for timestamped signatures), verifies the transaction reference, amount and ZAR currency, and processes duplicate events idempotently.

## Refunds

When a passenger cancels an unpaid/unaccepted trip, a full refund request is created if a settled payment exists (including a late webhook payment that settles after cancellation). A passenger can also request a refund review for a completed paid trip. Owners review `GET /v1/owner/refunds` and initiate the provider refund with `POST /v1/owner/refunds/:refundId/process`. Refund status and trip/payment status are changed only from Paystack refund webhooks. A processed refund can take several business days to reach the customer's account.

## Driver bank payouts

Drivers set a bank account with `PUT /v1/driver/payout-account` using `accountNumber`, `bankCode` and `bankName`. Paystack documentation for South Africa states that account resolution is not available for ZA bank accounts. Chaufr therefore creates a `basa` recipient using the driver-supplied account-holder name and bank details, then leaves the payout account pending until an owner approves an uploaded bank confirmation letter or statement. The account number is encrypted in PostgreSQL; only account-holder name and bank metadata are returned.

Owners first approve reward commission requests using the existing review endpoint, then initiate the actual 50% reward-ride payout with `POST /v1/owner/reward-commission-requests/:requestId/pay`. Standard completed, paid trip earnings can be paid using `POST /v1/owner/driver-earnings/:tripId/pay`. A payout remains processing until Paystack sends a signed `transfer.success`, `transfer.failed` or `transfer.reversed` event. The API no longer allows an owner to manually mark a payout paid.

## Driver identity and document verification

Drivers upload one document per request using `POST /v1/driver/verification-documents`:
`{"documentType":"south_african_id","fileName":"id-front.jpg","mimeType":"image/jpeg","base64":"..."}`

Allowed types: South African ID, passport, driver licence, proof of address, vehicle registration, roadworthy certificate and bank confirmation letter/statement. Allowed formats are JPEG, PNG and PDF; maximum 6 MB per file. Files are encrypted with AES-256-GCM before storage in PostgreSQL. Owners list the review queue at `GET /v1/owner/verification-documents`, view an individual document at `GET /v1/owner/verification-documents/:id/content`, and review it with `PATCH /v1/owner/verification-documents/:id` using `{"status":"approved"|"rejected"|"in_review","note":"..." }`.

A driver profile is automatically marked verified only after at least one identity document (South African ID or passport) and a driver's licence document are both approved. The existing vehicle approval remains a separate requirement. This is a manual review workflow, not automated identity proofing or a guarantee against forged documents.

## Required production secrets

- `PAYSTACK_SECRET_KEY`: Paystack secret API key (use test key in staging, live key only after merchant approval).
- `PAYSTACK_WEBHOOK_SECRET`: optional dedicated signing secret if the Paystack account is configured to send timestamped `Paystack-Signature` headers. The South Africa webhook flow also supports the documented `x-paystack-signature` HMAC using `PAYSTACK_SECRET_KEY`.
- `PAYOUT_DATA_ENCRYPTION_KEY`: base64-encoded 32-byte key for stored driver bank account numbers.
- `DOCUMENT_ENCRYPTION_KEY`: base64-encoded 32-byte key for identity/vehicle document contents.
- `PAYSTACK_CALLBACK_URL`: optional HTTPS return URL after hosted checkout.

Generate each encryption key separately using `openssl rand -base64 32`. Never commit these values. Do not reuse the vehicle-data encryption key for payout or document encryption.

## Important launch gates

The code is not live until the API is deployed, migrations 0018–0021 have run, Paystack has approved Chaufr as a registered business with transfer capability, test and live webhooks are configured, and the required secrets are installed in the host secret manager. Paystack transfers require sufficient available balance and may require OTP/approval. South African account details are not provider-resolved, so bank confirmation must be manually reviewed. Complete end-to-end sandbox testing before live mode.

Document uploads contain highly sensitive personal information. Restrict owner access, enable database encryption/backups, define a retention/deletion policy, secure the owner account and complete POPIA/legal review before collecting real identity documents. Do not use real identity documents in development or test environments.
