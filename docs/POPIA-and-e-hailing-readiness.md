# Chaufr POPIA and South African e-hailing readiness register

**Status: preparation checklist only — not a legal opinion, compliance certificate, or launch approval.** Chaufr must not accept public rides or collect real identity documents until the owner has completed the items marked OWNER / LEGAL and signed off the release gate.

## 1. Data protection governance (owner / legal)

- [ ] Identify the legal entity operating Chaufr and confirm whether it is the responsible party, an operator, or both for each processing activity.
- [ ] Register the Information Officer and any Deputy Information Officers with the Information Regulator; maintain current contact details.
- [ ] Prepare and publish a PAIA manual where applicable.
- [ ] Complete a data inventory and processing register: passenger account details, driver profile, licence and selfie images, vehicle records, GPS/location history, trusted contacts, support tickets, safety reports, payment/payout records and audit logs.
- [ ] Record a lawful basis and defined purpose for each data field; document necessity and proportionality. Do not collect an ID number, address, criminal-history data, or other additional information until the precise legal requirement, purpose, lawful basis and retention are confirmed.
- [ ] Publish clear passenger and driver privacy notices before collection: responsible-party identity/contact, purpose, recipients/operators, cross-border processing, retention, rights, complaints route and consequences of not supplying mandatory information.
- [ ] Obtain and record appropriate notices/consents where consent is the correct basis; do not treat consent as a substitute for another lawful basis.
- [ ] Provide secure procedures for access, correction, objection, deletion/destruction, complaints and identity verification.
- [ ] Approve a retention schedule and deletion process for rejected applications, licence/selfie images, GPS traces, support records, payment records and backups. Set no indefinite retention by default.
- [ ] Complete a privacy impact/risk assessment before launch, especially for location tracking, identity-document images, trusted-contact information and automated matching.
- [ ] Assess whether any processing triggers POPIA section 57 prior authorisation (including specified unique-identifier linking, criminal-behaviour processing on behalf of third parties, or qualifying foreign transfers of special/children's information). Obtain legal advice and regulator authorisation where required.
- [ ] Confirm whether any special personal information or children's information is processed. Keep the service adult-only unless a separate lawful design and review is approved.

## 2. Operators and cross-border services

- [ ] List each cloud host, database, Firebase/Google, Twilio, Paystack, mapping, analytics, email and support provider that can access personal information.
- [ ] Sign written operator agreements under POPIA section 21 requiring appropriate safeguards, confidentiality, access restrictions, subcontractor disclosure, prompt breach notification, deletion/return and audit cooperation.
- [ ] Determine each provider's processing/storage countries and assess POPIA section 72 before any cross-border transfer. Confirm an applicable statutory condition or other lawful basis; document the assessment.
- [ ] Confirm provider security terms, breach-notification timelines, retention/deletion, backup location and support access.
- [ ] Restrict production access to named roles; enforce MFA for owner and hosting accounts; use individual accounts, least privilege and access reviews.

## 3. Technical safeguards to verify before real data

- [ ] Keep driver licence/selfie and payout-account encryption keys separate, generated randomly, stored only in a secret manager, backed up securely and rotated under a written procedure.
- [ ] Confirm TLS for all public app/API traffic and database connections; disable insecure HTTP production endpoints.
- [ ] Verify database encryption at rest, private networking, backups, restore drills, point-in-time recovery and retention.
- [ ] Test role-based access to documents; only authorised owners may view them. Log every view, approval, rejection and download.
- [ ] Ensure logs, crash reports, analytics and support tooling never capture document bytes, tokens, full account numbers or unnecessary location history.
- [ ] Add production-grade distributed rate limiting, abuse detection, monitoring, alerting, vulnerability scanning and independent penetration testing.
- [ ] Confirm mobile release signing, protected build secrets, dependency scanning and a documented lost-device/session-revocation process.
- [ ] Test data export, correction and deletion requests end-to-end, including backups and third-party operators.
- [ ] Test incident response. Under POPIA section 22, security compromises must be notified to the Information Regulator and affected data subjects as soon as reasonably possible; the Information Regulator currently directs responsible parties to use its eServices portal.

## 4. South African e-hailing regulatory gates (owner / legal / PRE / NTPR)

Based on the National Land Transport Amendment Act 23 of 2023 and the Second National Land Transport Regulations, 2025, obtain current written advice from the relevant Provincial Regulatory Entity and National Public Transport Regulator before launch.

- [ ] Confirm Chaufr's legal entity, CIPC status, SARS obligations and South African physical premises/online presence requirements.
- [ ] Confirm and complete e-hailing platform/app provider registration with the National Public Transport Regulator (including Form 9A, required supporting evidence, type approval and fees).
- [ ] Confirm the exact operating-licence application and conversion process with the relevant PRE for each operator and vehicle, operating area and service.
- [ ] Configure the platform to block a vehicle/operator without a valid e-hailing operating licence; retain expiry/renewal and verification records. A driver's licence alone does not authorise an e-hailing vehicle to operate.
- [ ] Have a written e-hailing service agreement with each operator/driver meeting the 2025 Regulations; record required driver/device declarations.
- [ ] Confirm prescribed driver and vehicle details that must be shown to passengers before and during trips.
- [ ] Confirm vehicle markings/signage, panic-button hardware and any vehicle equipment type-approval requirements. App SOS alone is not proof of an installed vehicle panic button or emergency response arrangement.
- [ ] Confirm the app provides advance fare/distance estimates and communicates the final fare electronically at trip completion.
- [ ] Confirm passenger registration information and driver/operator registration information required by regulation 20; the regulations include passenger identity/passport and residential-address information. Do not switch on these fields until privacy notice, lawful basis, security and retention are approved.
- [ ] Confirm device and communications compliance requirements (including RICA/ECA references) with legal counsel and relevant authorities.
- [ ] Confirm any applicable insurance, tax, consumer-protection, electronic-communications, payment-services and employment/contractor requirements.
- [ ] Obtain written PRE/NTPR confirmation of the requirements for the initial Cape Town operating area.

## 5. Current Chaufr implementation boundary

- The initial driver app checklist is a valid South African driver's licence plus a recent selfie for manual visual comparison. No paid third-party identity vendor or PrDP is part of that initial app checklist.
- This app checklist does not replace an operator's legally required e-hailing operating licence, vehicle requirements, driver/device declarations or platform registration.
- Existing SOS functionality records an SOS and can send app push alerts; it does not dispatch emergency services or replace a vehicle panic button.
- GPS, trip sharing, push, SMS and payments require real provider/device testing. Never describe an untested feature as live or guaranteed.
- The owner dashboard and encrypted document workflow are code features, not proof of POPIA compliance.

## 6. Incident response minimum

1. Contain the incident and preserve relevant evidence.
2. Notify the Information Officer immediately; operators notify Chaufr immediately under contract.
3. Assess affected systems, people, information categories and likely consequences.
4. Notify the Information Regulator and affected data subjects as soon as reasonably possible in accordance with section 22; do not wait for a completed forensic investigation where the reporting duty has arisen.
5. Tell affected people what happened, likely consequences, mitigation and practical protective steps.
6. Record decisions, notifications, remediation and lessons learned.

## Primary official sources

- POPIA Act 4 of 2013, especially sections 19–22, 57 and 72: https://inforegulator.org.za/wp-content/uploads/2025/08/PROTECTION-OF-PERSONAL-INFORMATION-ACT-4-OF-2013.pdf
- Information Regulator POPIA and security-compromise guidance: https://inforegulator.org.za/popia/
- Information Regulator eServices: https://eservices.inforegulator.org.za/
- Second National Land Transport Regulations, 2025, Government Gazette 53335 (12 September 2025): https://www.gov.za/sites/default/files/gcis_document/202509/53335gen3487.pdf
- National Land Transport Amendment Act 23 of 2023: https://www.gov.za/sites/default/files/gcis_document/202406/50800nationallandtransportamendmentact232023.pdf
- Department of Transport announcement on e-hailing implementation: https://www.gov.za/news/media-statements/transport-gazettes-national-land-transport-amendment-act-and-regulations-e
