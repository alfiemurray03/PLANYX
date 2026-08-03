# Authentication incident reference

Reference: `PLX-AUTH-CALLBACK-EA3F4D47605C`

Observed on 3 August 2026 after Microsoft returned the customer to `/account/auth/callback`.

The absence of a named `authStage` showed that the failure occurred before token exchange, ID-token validation and customer-session creation. The live callback depended solely on the encrypted `ja_customer_oidc_tx` browser cookie to recover OAuth state, nonce and the PKCE verifier.

The corrective change adds a hashed, encrypted, one-time, ten-minute D1 backup of the same browser transaction. The callback consumes that backup only when normal authentication-state validation fails. Microsoft validation, state comparison, nonce validation, PKCE, token validation, session creation and Head Office enforcement remain mandatory.
