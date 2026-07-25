CREATE TABLE IF NOT EXISTS customer_identity_verification_sessions (
  id TEXT PRIMARY KEY,
  customer_email TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  method TEXT NOT NULL,
  verified_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  assurance_level TEXT DEFAULT 'standard',
  reason_code TEXT,
  reason_detail TEXT,
  support_channel TEXT,
  case_reference TEXT,
  approved_by TEXT,
  source_request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_identity_sessions_scope
  ON customer_identity_verification_sessions(customer_email, admin_email, expires_at, ended_at);

CREATE TABLE IF NOT EXISTS customer_support_email_codes (
  id TEXT PRIMARY KEY,
  customer_email TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  code_salt TEXT NOT NULL,
  sent_to TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  revoked_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_support_email_codes_lookup
  ON customer_support_email_codes(customer_email, admin_email, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_identity_override_requests (
  id TEXT PRIMARY KEY,
  customer_email TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requester_role TEXT,
  reason_code TEXT NOT NULL,
  reason_detail TEXT NOT NULL,
  support_channel TEXT NOT NULL,
  case_reference TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  approved_until TEXT,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_identity_override_requests_customer
  ON customer_identity_override_requests(customer_email, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_identity_override_requests_requester
  ON customer_identity_override_requests(requested_by, status, requested_at DESC);
