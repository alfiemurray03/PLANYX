# Customer CRM identity verification protocol

**Service:** Planyx  
**Operator:** JA Group Services Ltd  
**Applies to:** Customer CRM access by authorised administrators  
**Status:** Operational security procedure

## 1. Purpose

Protected customer information must not be discussed, amended, exported or otherwise processed during a support interaction until the customer has been verified using an approved method or a governed exceptional override has been authorised.

Verification is scoped to:

- one signed-in administrator;
- one customer account;
- one time-limited CRM session; and
- one recorded verification method or override decision.

Verification of one customer never verifies another customer. Verification by one administrator never grants access to another administrator.

## 2. Approved verification order

Administrators should use the least exceptional available method in this order:

1. **Customer Support PIN** — the customer supplies the current single-use six-digit Support PIN.
2. **Registered-email support code** — during an expected support interaction, a six-digit one-time code is sent to the email address registered on the Planyx account.
3. **Governed administrator override** — used only when ordinary verification cannot reasonably be completed and protected CRM access is necessary.

The registered-email code confirms control of the registered email during the support interaction. It is not Microsoft MFA and must not be described as high-assurance identity proof.

## 3. Support PIN controls

- Six digits.
- Single-use.
- Must be unexpired and not revoked.
- Three failed attempts trigger a 15-minute Support PIN lock.
- The lock applies to the customer verification route and does not unlock another customer.
- During a lock, administrators may use the registered-email code or the governed override route where appropriate.
- Every failed and successful attempt is audited.

## 4. Registered-email code controls

- Generated using a cryptographically secure random value.
- Stored only as a keyed hash; the plaintext code is never stored in D1 or written to the audit log.
- Expires after ten minutes.
- Single-use.
- Maximum five verification attempts.
- Minimum one minute between sends by the same administrator for the same customer.
- Maximum three sends within 30 minutes by the same administrator for the same customer.
- Previous active codes are revoked when a new code is sent.
- Delivery failures are recorded and the failed code is revoked.

The production environment should configure a dedicated encrypted secret named `CUSTOMER_VERIFICATION_CODE_PEPPER`. Where this is not configured, the application uses the existing Admin PIN or OIDC secret as a controlled fallback.

## 5. Administrator override controls

An override is an exception, not an alternative convenience method.

The administrator must record:

- a structured override reason;
- the support or investigation channel;
- a case, incident or enquiry reference where required; and
- a professional justification explaining why normal verification cannot be completed, what checks have already been performed, and why access is necessary.

The administrator must re-enter their own four-digit administrator PIN for each customer-specific override. An existing Admin Portal PIN session does not authorise CRM override by itself.

## 6. Approval levels

Platform Owner, System Administrator, Supervisor, Senior Administrator, or an administrator with the explicit `approve_crm_identity_override` permission may authorise a direct override after re-entering their own PIN.

Other authorised CRM administrators must:

1. submit an override request;
2. wait for an independent authorised reviewer;
3. receive approval within the request lifetime;
4. return to the same customer record; and
5. re-enter their own administrator PIN to consume the approval.

An administrator cannot approve their own request. Approval alone does not open the record. Approved requests expire and can be consumed only once.

## 7. Session controls

- CRM verification sessions last 15 minutes.
- Sessions are stored against the exact customer email and administrator email.
- Starting a new session for the same administrator and customer ends the previous session.
- Administrators should use **End access** when the support interaction finishes.
- Opening another customer requires a fresh verification or governed override.

## 8. Audit requirements

The audit log records, as applicable:

- administrator identity and role;
- customer account;
- verification or override method;
- structured reason and detailed justification;
- support channel and case reference;
- request, review and consumption identifiers;
- supervisor identity and review note;
- timestamps and expiry times;
- failed attempts, lockouts, delivery failures and outcomes.

Plaintext Support PINs, email codes and administrator PINs must never be written to logs.

## 9. Telephone support procedure

1. Confirm the customer account email verbally without revealing protected CRM information.
2. Ask for the current Support PIN where available.
3. Where the PIN cannot be used, select **Send code to customer email**.
4. Tell the customer the code will be sent only to the email registered on the account.
5. Ask the customer to read the six-digit code back.
6. Never ask for their Microsoft password, Microsoft MFA approval, payment-card PIN or full payment-card details.
7. Explain that verification is for the current support interaction only.
8. End CRM access when the interaction is complete.

## 10. Incident response

Where suspicious behaviour is identified:

- stop the verification attempt;
- do not use an override merely to continue the interaction;
- record the event in the relevant support or incident case;
- escalate to a supervisor, platform administrator or security lead;
- preserve the audit reference and Cloudflare request reference; and
- consider suspending the affected support route while the incident is reviewed.
