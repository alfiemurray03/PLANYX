# Age-verification implementation notes

## Architecture

- The public date-of-birth field posts to a same-origin server-side Cloudflare Pages Function.
- Eligibility is calculated on the server; the browser cannot approve or override the result.
- Successful results use a signed age-assurance token.
- The restricted verification record is encrypted and separate from the ordinary customer profile.
- The ordinary profile receives only eligibility, age band and safeguarding status.
- The customer AI guide operates as an explanation layer only and is prohibited from making age decisions.

## Independent-provider target design

A future provider adapter should return a minimal response such as:

```json
{
  "eligible": true,
  "age_band": "18+",
  "provider_reference": "opaque-reference",
  "expires_at": "2027-07-25T00:00:00Z"
}
```

The application should not receive or retain source identity documents, selfies, bank transactions or unrelated provider data unless a separately documented necessity and lawful basis require it.

## Anti-circumvention controls

- Keep all eligibility decisions server-side.
- Sign short-lived age-assurance tokens.
- Reject altered or expired tokens.
- Clear customer authentication and assurance cookies following an under-16 result.
- Record non-sensitive operational outcomes and correlation references.
- Do not allow administrators or the AI guide to override the minimum age.
- Require a fresh or stronger check where submitted information is inconsistent.

## Provider governance

Before enabling an independent provider, complete technical validation, security due diligence, contractual and processor-role review, data-protection assessment, retention review, accessibility testing, fairness testing, failure-mode testing and documented approval.
