ALTER TABLE profiles ADD COLUMN planyx_account_id TEXT;
ALTER TABLE profiles ADD COLUMN universal_customer_number TEXT;
ALTER TABLE profiles ADD COLUMN customerops_sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE profiles ADD COLUMN customerops_synced_at TEXT;
ALTER TABLE profiles ADD COLUMN customerops_last_error TEXT;
ALTER TABLE profiles ADD COLUMN customerops_matched_by TEXT;
ALTER TABLE profiles ADD COLUMN customerops_enforcement_action TEXT;
ALTER TABLE profiles ADD COLUMN customerops_restrictions_json TEXT NOT NULL DEFAULT '[]';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_planyx_account_id
  ON profiles(planyx_account_id)
  WHERE planyx_account_id IS NOT NULL AND planyx_account_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_universal_customer_number
  ON profiles(universal_customer_number)
  WHERE universal_customer_number IS NOT NULL AND universal_customer_number <> '';
