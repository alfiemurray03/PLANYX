/**
 * Runtime migrations — runs CREATE TABLE IF NOT EXISTS for any tables
 * not covered by the initial Drizzle migration. Safe to run on every startup.
 */
import { db } from './client.js';
import { sql } from 'drizzle-orm';

export async function runMigrations(): Promise<void> {
  // Password reset requests
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_password_reset_requests\` (
      \`id\`              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`            VARCHAR(36) NOT NULL UNIQUE,
      \`user_id\`         INT NOT NULL,
      \`email\`           VARCHAR(255) NOT NULL,
      \`status\`          ENUM('pending','approved','rejected','completed') NOT NULL DEFAULT 'pending',
      \`token\`           VARCHAR(128),
      \`pin\`             VARCHAR(10),
      \`delivery_method\` ENUM('link','pin'),
      \`used\`            TINYINT(1) NOT NULL DEFAULT 0,
      \`expires_at\`      TIMESTAMP NULL,
      \`admin_notes\`     TEXT,
      \`processed_by\`    VARCHAR(255),
      \`processed_at\`    TIMESTAMP NULL,
      \`created_at\`      TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Template favourites
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_favourites\` (
      \`id\`          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`user_id\`     INT NOT NULL,
      \`template_id\` VARCHAR(100) NOT NULL,
      \`created_at\`  TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE KEY \`uq_fav\` (\`user_id\`, \`template_id\`)
    )
  `);

  // Recently used templates
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_recently_used\` (
      \`id\`          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`user_id\`     INT NOT NULL,
      \`template_id\` VARCHAR(100) NOT NULL,
      \`used_at\`     TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      UNIQUE KEY \`uq_recent\` (\`user_id\`, \`template_id\`)
    )
  `);

  // User notifications
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_notifications\` (
      \`id\`         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`user_id\`    INT NOT NULL,
      \`type\`       VARCHAR(60) NOT NULL,
      \`title\`      VARCHAR(255) NOT NULL,
      \`message\`    TEXT NOT NULL,
      \`read\`       TINYINT(1) NOT NULL DEFAULT 0,
      \`link\`       VARCHAR(500),
      \`created_at\` TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX \`idx_notif_user\` (\`user_id\`, \`read\`)
    )
  `);

  // User preferences
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_user_preferences\` (
      \`id\`                   INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`user_id\`              INT NOT NULL UNIQUE,
      \`email_notifications\`  TINYINT(1) NOT NULL DEFAULT 1,
      \`marketing_emails\`     TINYINT(1) NOT NULL DEFAULT 0,
      \`updated_at\`           TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  // Stripe subscriptions
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_stripe_subscriptions\` (
      \`id\`                     INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`user_id\`                INT NOT NULL,
      \`stripe_customer_id\`     VARCHAR(255),
      \`stripe_subscription_id\` VARCHAR(255),
      \`stripe_price_id\`        VARCHAR(255),
      \`plan\`                   ENUM('free','standard','professional','organisation') NOT NULL DEFAULT 'free',
      \`status\`                 VARCHAR(60) NOT NULL DEFAULT 'inactive',
      \`trial_start\`            TIMESTAMP NULL,
      \`trial_end\`              TIMESTAMP NULL,
      \`current_period_start\`   TIMESTAMP NULL,
      \`current_period_end\`     TIMESTAMP NULL,
      \`cancel_at_period_end\`   TINYINT(1) NOT NULL DEFAULT 0,
      \`created_at\`             TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`             TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX \`idx_stripe_user\` (\`user_id\`),
      INDEX \`idx_stripe_customer\` (\`stripe_customer_id\`)
    )
  `);

  // Support tickets
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_support_tickets\` (
      \`id\`          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`        VARCHAR(36) NOT NULL UNIQUE,
      \`user_id\`     INT,
      \`name\`        VARCHAR(255) NOT NULL,
      \`email\`       VARCHAR(255) NOT NULL,
      \`subject\`     VARCHAR(500) NOT NULL,
      \`message\`     TEXT NOT NULL,
      \`category\`    VARCHAR(60) NOT NULL DEFAULT 'general',
      \`priority\`    ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
      \`status\`      ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
      \`admin_notes\` TEXT,
      \`resolved_by\` VARCHAR(255),
      \`resolved_at\` TIMESTAMP NULL,
      \`created_at\`  TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`  TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX \`idx_ticket_status\` (\`status\`),
      INDEX \`idx_ticket_email\`  (\`email\`)
    )
  `);

  // System config key-value store
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_system_config\` (
      \`id\`         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`config_key\` VARCHAR(100) NOT NULL UNIQUE,
      \`value\`      TEXT NOT NULL,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  // Lifetime plan columns on ja_users — add only if missing (MySQL 5.7 compatible)
  try {
    await db.execute(sql`ALTER TABLE \`ja_users\` ADD COLUMN \`plan_is_lifetime\` TINYINT(1) NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }
  try {
    await db.execute(sql`ALTER TABLE \`ja_users\` ADD COLUMN \`plan_expires_at\` TIMESTAMP NULL`);
  } catch { /* column already exists */ }
  try {
    await db.execute(sql`ALTER TABLE \`ja_users\` ADD COLUMN \`org_id\` INT NULL`);
  } catch { /* column already exists */ }

  // Document expiry column
  try {
    await db.execute(sql`ALTER TABLE \`ja_documents\` ADD COLUMN \`expires_at\` TIMESTAMP NULL`);
  } catch { /* column already exists */ }

  // Organisations table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_organisations\` (
      \`id\`            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`          VARCHAR(36) NOT NULL UNIQUE,
      \`name\`          VARCHAR(255) NOT NULL,
      \`plan\`          ENUM('org_starter','org_growth','org_professional') NOT NULL DEFAULT 'org_starter',
      \`owner_user_id\` INT NOT NULL,
      \`max_seats\`     INT NOT NULL DEFAULT 2,
      \`created_at\`    TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`    TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  // Organisation members
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_org_members\` (
      \`id\`         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`org_id\`     INT NOT NULL,
      \`user_id\`    INT NOT NULL,
      \`role\`       ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
      \`created_at\` TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE KEY \`uq_org_member\` (\`org_id\`, \`user_id\`)
    )
  `);

  // Additional seat purchases
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_seat_purchases\` (
      \`id\`                     INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`org_id\`                 INT NOT NULL,
      \`stripe_subscription_id\` VARCHAR(255),
      \`seat_type\`              ENUM('user','manager','admin') NOT NULL DEFAULT 'user',
      \`quantity\`               INT NOT NULL DEFAULT 1,
      \`status\`                 VARCHAR(60) NOT NULL DEFAULT 'active',
      \`created_at\`             TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX \`idx_seat_org\` (\`org_id\`)
    )
  `);

  // Lifetime grants audit table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_lifetime_grants\` (
      \`id\`          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`user_id\`     INT NOT NULL,
      \`granted_by\`  VARCHAR(255) NOT NULL,
      \`plan\`        VARCHAR(60) NOT NULL,
      \`action\`      ENUM('grant','revoke','change') NOT NULL DEFAULT 'grant',
      \`note\`        TEXT,
      \`created_at\`  TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX \`idx_lg_user\` (\`user_id\`)
    )
  `);

  // Migrate old 'organisation' plan value to 'org_starter' if needed
  try {
    await db.execute(sql`
      UPDATE \`ja_users\` SET \`plan\` = 'org_starter' WHERE \`plan\` = 'organisation'
    `);
  } catch { /* ignore */ }
  try {
    await db.execute(sql`
      UPDATE \`ja_stripe_subscriptions\` SET \`plan\` = 'org_starter' WHERE \`plan\` = 'organisation'
    `);
  } catch { /* ignore */ }

  // Add 'personal' to plan enum columns if not already present
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_users\`
        MODIFY COLUMN \`plan\`
          ENUM('free','personal','standard','professional','org_starter','org_growth','org_professional')
          NOT NULL DEFAULT 'free'
    `);
  } catch { /* already includes personal */ }
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_stripe_subscriptions\`
        MODIFY COLUMN \`plan\`
          ENUM('free','personal','standard','professional','org_starter','org_growth','org_professional')
          NOT NULL DEFAULT 'free'
    `);
  } catch { /* already includes personal */ }

  // Custom / admin-created templates (DB-driven, override or supplement code templates)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_custom_templates\` (
      \`id\`            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`          VARCHAR(36) NOT NULL UNIQUE,
      \`template_id\`   VARCHAR(120) NOT NULL UNIQUE COMMENT 'Matches DocumentTemplate.id — used to override code templates',
      \`name\`          VARCHAR(255) NOT NULL,
      \`category\`      VARCHAR(80) NOT NULL DEFAULT 'business',
      \`description\`   TEXT NOT NULL,
      \`icon\`          VARCHAR(60) NOT NULL DEFAULT 'FileText',
      \`plan_required\` ENUM('free','business','professional') NOT NULL DEFAULT 'free',
      \`tags\`          TEXT COMMENT 'JSON array of strings',
      \`sections\`      LONGTEXT NOT NULL COMMENT 'JSON array of TemplateSections',
      \`generate_fn\`   LONGTEXT NOT NULL COMMENT 'JS function body string for generateDocument(data)',
      \`is_active\`     TINYINT(1) NOT NULL DEFAULT 1,
      \`is_custom\`     TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = admin-created, 0 = code-template override',
      \`created_by\`    VARCHAR(255),
      \`created_at\`    TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`    TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  // Admin action audit log (separate from login-attempt log)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_admin_action_log\` (
      \`id\`           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`admin_id\`     INT NOT NULL,
      \`admin_email\`  VARCHAR(255) NOT NULL,
      \`action\`       VARCHAR(100) NOT NULL,
      \`detail\`       TEXT,
      \`ip\`           VARCHAR(60) NOT NULL DEFAULT '',
      \`created_at\`   TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX \`idx_aal_admin\` (\`admin_id\`),
      INDEX \`idx_aal_action\` (\`action\`),
      INDEX \`idx_aal_created\` (\`created_at\`)
    )
  `);

  // Support ticket messages (admin ↔ customer chat)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_ticket_messages\` (
      \`id\`               INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`ticket_id\`        INT NOT NULL,
      \`sender_type\`      ENUM('admin','customer') NOT NULL,
      \`sender_id\`        INT,
      \`sender_name\`      VARCHAR(255) NOT NULL,
      \`sender_email\`     VARCHAR(255) NOT NULL,
      \`message\`          TEXT NOT NULL,
      \`read_by_admin\`    TINYINT(1) NOT NULL DEFAULT 0,
      \`read_by_customer\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_at\`       TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX \`idx_tm_ticket\` (\`ticket_id\`),
      INDEX \`idx_tm_created\` (\`created_at\`)
    )
  `);

  // Seed default feature toggle values (only if not already set)
  const defaultToggles: Record<string, string> = {
    toggle_registration:    'true',
    toggle_free_plan:       'true',
    toggle_pdf_export:      'true',
    toggle_word_export:     'true',
    toggle_new_templates:   'true',
    toggle_usage_analytics: 'true',
    toggle_maintenance:     'false',
    toggle_debug_mode:      'false',
    toggle_payments:        'false',  // OFF by default — admin enables when ready
  };
  for (const [key, value] of Object.entries(defaultToggles)) {
    await db.execute(
      sql`INSERT IGNORE INTO ja_system_config (config_key, value) VALUES (${key}, ${value})`
    );
  }

  // Org members + organisations tables
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_organisations\` (
      \`id\`            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`          VARCHAR(36) NOT NULL UNIQUE,
      \`name\`          VARCHAR(255) NOT NULL,
      \`plan\`          ENUM('org_starter','org_growth','org_professional') NOT NULL DEFAULT 'org_starter',
      \`owner_user_id\` INT NOT NULL,
      \`max_seats\`     INT NOT NULL DEFAULT 2,
      \`created_at\`    TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`    TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_org_members\` (
      \`id\`         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`org_id\`     INT NOT NULL,
      \`user_id\`    INT NOT NULL,
      \`role\`       ENUM('owner','admin','member') NOT NULL DEFAULT 'member',
      \`created_at\` TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE KEY \`uq_org_member\` (\`org_id\`, \`user_id\`)
    )
  `);
  // Invoices
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_invoices\` (
      \`id\`         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`       VARCHAR(36) NOT NULL UNIQUE,
      \`user_id\`    INT NOT NULL,
      \`title\`      VARCHAR(255) NOT NULL,
      \`data\`       TEXT NOT NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);
  // Builder Documents
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_builder_docs\` (
      \`id\`          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`        VARCHAR(36) NOT NULL UNIQUE,
      \`user_id\`     INT NOT NULL,
      \`builder_id\`  VARCHAR(50) NOT NULL,
      \`template_id\` VARCHAR(100) NOT NULL,
      \`title\`       VARCHAR(255) NOT NULL,
      \`fields\`      TEXT NOT NULL,
      \`brand_color\` VARCHAR(20),
      \`logo_url\`    TEXT,
      \`status\`      VARCHAR(20) NOT NULL DEFAULT 'draft',
      \`created_at\`  TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`  TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX \`idx_builder_docs_user\` (\`user_id\`),
      INDEX \`idx_builder_docs_builder\` (\`builder_id\`)
    )
  `);

  // Builder template overrides (admin edits persisted to DB)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_builder_template_overrides\` (
      \`id\`             INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`builder_id\`     VARCHAR(50) NOT NULL,
      \`template_id\`    VARCHAR(120) NOT NULL,
      \`name\`           VARCHAR(255),
      \`description\`    TEXT,
      \`category\`       VARCHAR(100),
      \`status\`         VARCHAR(20),
      \`plan_required\`  VARCHAR(30),
      \`accent_color\`   VARCHAR(20),
      \`default_layout\` VARCHAR(60),
      \`body_template\`  LONGTEXT,
      \`popular\`        TINYINT(1),
      \`updated_by\`     VARCHAR(255),
      \`updated_at\`     TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      UNIQUE KEY \`uq_builder_template\` (\`builder_id\`, \`template_id\`),
      INDEX \`idx_bto_builder\` (\`builder_id\`)
    )
  `);

  // Add is_internal column to ja_ticket_messages (internal notes not emailed to customer)
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_ticket_messages\`
        ADD COLUMN \`is_internal\` TINYINT(1) NOT NULL DEFAULT 0
    `);
  } catch { /* column already exists */ }

  // Add oidc_sub column to ja_users (Microsoft Entra External ID object ID)
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_users\`
        ADD COLUMN \`oidc_sub\` VARCHAR(255) NULL DEFAULT NULL
    `);
  } catch { /* column already exists */ }

  // Index on oidc_sub for fast lookup during OIDC callback
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_users\`
        ADD UNIQUE INDEX \`uq_oidc_sub\` (\`oidc_sub\`)
    `);
  } catch { /* index already exists */ }

  // Add auth_method column
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_users\`
        ADD COLUMN \`auth_method\` ENUM('oidc','password','both') NOT NULL DEFAULT 'both'
    `);
  } catch { /* column already exists */ }

  // ── New OIDC identity + profile columns ─────────────────────────────────────

  // Microsoft Entra tenant ID (tid claim)
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_users\`
        ADD COLUMN \`tenant_id\` VARCHAR(255) NULL DEFAULT NULL
    `);
  } catch { /* column already exists */ }

  // Full display name from Entra (name claim)
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_users\`
        ADD COLUMN \`display_name\` VARCHAR(255) NULL DEFAULT NULL
    `);
  } catch { /* column already exists */ }

  // Profile photo URL from Entra (if available)
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_users\`
        ADD COLUMN \`photo_url\` TEXT NULL DEFAULT NULL
    `);
  } catch { /* column already exists */ }

  // App role: user | manager | admin
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_users\`
        ADD COLUMN \`role\` ENUM('user','manager','admin') NOT NULL DEFAULT 'user'
    `);
  } catch { /* column already exists */ }

  // Account status: active | suspended | pending
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_users\`
        ADD COLUMN \`account_status\` ENUM('active','suspended','pending') NOT NULL DEFAULT 'active'
    `);
  } catch { /* column already exists */ }

  // updated_at timestamp
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_users\`
        ADD COLUMN \`updated_at\` TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    `);
  } catch { /* column already exists */ }

  // password_hash default '' (allow empty for OIDC-only accounts)
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_users\`
        MODIFY COLUMN \`password_hash\` VARCHAR(255) NOT NULL DEFAULT ''
    `);
  } catch { /* ignore */ }

  // Back-fill: accounts with oidc_sub and no password are OIDC-only
  try {
    await db.execute(sql`
      UPDATE \`ja_users\`
        SET \`auth_method\` = 'oidc'
      WHERE \`oidc_sub\` IS NOT NULL
        AND (\`password_hash\` = '' OR \`password_hash\` IS NULL)
    `);
  } catch { /* best-effort */ }

  // ── Affiliates ────────────────────────────────────────────────────────────
  // Add layout_id to ja_builder_docs if missing
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_builder_docs\`
        ADD COLUMN \`layout_id\` VARCHAR(50) NULL
    `);
  } catch { /* column already exists */ }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_affiliates\` (
      \`id\`               INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`             VARCHAR(36) NOT NULL UNIQUE,
      \`user_id\`          INT,
      \`full_name\`        VARCHAR(255) NOT NULL,
      \`email\`            VARCHAR(255) NOT NULL UNIQUE,
      \`phone\`            VARCHAR(60),
      \`company\`          VARCHAR(255),
      \`website\`          VARCHAR(500),
      \`social_links\`     TEXT,
      \`referral_method\`  VARCHAR(255),
      \`expected_audience\` TEXT,
      \`referral_code\`    VARCHAR(30) UNIQUE,
      \`commission_rate\`  INT NOT NULL DEFAULT 10,
      \`status\`           ENUM('applied','approved','rejected','suspended') NOT NULL DEFAULT 'applied',
      \`agreed_to_terms\`  TINYINT(1) NOT NULL DEFAULT 0,
      \`payout_details\`   TEXT,
      \`admin_notes\`      TEXT,
      \`approved_by\`      VARCHAR(255),
      \`approved_at\`      TIMESTAMP NULL,
      \`created_at\`       TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`       TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_affiliate_clicks\` (
      \`id\`            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`affiliate_id\`  INT NOT NULL,
      \`ip_hash\`       VARCHAR(64),
      \`user_agent\`    VARCHAR(500),
      \`landing_page\`  VARCHAR(500),
      \`created_at\`    TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_affiliate_conversions\` (
      \`id\`               INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`affiliate_id\`     INT NOT NULL,
      \`user_id\`          INT,
      \`type\`             ENUM('signup','subscription') NOT NULL DEFAULT 'signup',
      \`plan\`             VARCHAR(60),
      \`amount_gbp\`       INT NOT NULL DEFAULT 0,
      \`commission_gbp\`   INT NOT NULL DEFAULT 0,
      \`status\`           ENUM('pending','approved','paid','rejected') NOT NULL DEFAULT 'pending',
      \`paid_at\`          TIMESTAMP NULL,
      \`paid_by\`          VARCHAR(255),
      \`stripe_session_id\` VARCHAR(255),
      \`created_at\`       TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`       TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  // ── Document Signing ──────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_signing_requests\` (
      \`id\`               INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`             VARCHAR(36) NOT NULL UNIQUE,
      \`user_id\`          INT NOT NULL,
      \`title\`            VARCHAR(255) NOT NULL,
      \`message\`          TEXT,
      \`document_path\`    TEXT,
      \`document_name\`    VARCHAR(255),
      \`document_hash\`    VARCHAR(64),
      \`status\`           ENUM('draft','sent','viewed','partially_signed','completed','declined','expired','cancelled') NOT NULL DEFAULT 'draft',
      \`signer_order\`     ENUM('any','sequential') NOT NULL DEFAULT 'any',
      \`expires_at\`       TIMESTAMP NULL,
      \`reminder_days\`    INT DEFAULT 3,
      \`completed_at\`     TIMESTAMP NULL,
      \`cancelled_at\`     TIMESTAMP NULL,
      \`cancelled_by\`     INT,
      \`certificate_path\` TEXT,
      \`created_at\`       TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`       TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_signing_signers\` (
      \`id\`               INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`             VARCHAR(36) NOT NULL UNIQUE,
      \`request_id\`       INT NOT NULL,
      \`email\`            VARCHAR(255) NOT NULL,
      \`name\`             VARCHAR(255) NOT NULL,
      \`role\`             VARCHAR(100),
      \`order\`            INT NOT NULL DEFAULT 1,
      \`status\`           ENUM('pending','sent','viewed','signed','declined') NOT NULL DEFAULT 'pending',
      \`token\`            VARCHAR(128) NOT NULL UNIQUE,
      \`token_expires_at\` TIMESTAMP NULL,
      \`signed_at\`        TIMESTAMP NULL,
      \`declined_at\`      TIMESTAMP NULL,
      \`decline_reason\`   TEXT,
      \`ip_address\`       VARCHAR(45),
      \`user_agent\`       TEXT,
      \`created_at\`       TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`       TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_signing_fields\` (
      \`id\`          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`        VARCHAR(36) NOT NULL UNIQUE,
      \`request_id\`  INT NOT NULL,
      \`signer_id\`   INT NOT NULL,
      \`field_type\`  ENUM('signature','initials','name','date','checkbox','text') NOT NULL,
      \`page\`        INT NOT NULL DEFAULT 1,
      \`x\`           INT NOT NULL DEFAULT 0,
      \`y\`           INT NOT NULL DEFAULT 0,
      \`width\`       INT NOT NULL DEFAULT 200,
      \`height\`      INT NOT NULL DEFAULT 60,
      \`required\`    TINYINT(1) NOT NULL DEFAULT 1,
      \`label\`       VARCHAR(100),
      \`value\`       TEXT,
      \`filled_at\`   TIMESTAMP NULL,
      \`created_at\`  TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_signing_audit\` (
      \`id\`           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`request_id\`   INT NOT NULL,
      \`signer_id\`    INT,
      \`user_id\`      INT,
      \`admin_id\`     INT,
      \`event\`        VARCHAR(100) NOT NULL,
      \`detail\`       TEXT,
      \`ip_address\`   VARCHAR(45),
      \`user_agent\`   TEXT,
      \`signer_email\` VARCHAR(255),
      \`auth_method\`  VARCHAR(50),
      \`created_at\`   TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Expand field_type enum to include new types
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_signing_fields\`
        MODIFY COLUMN \`field_type\`
          ENUM('signature','initials','name','date','checkbox','text','company_name','job_title','email_address','custom') NOT NULL
    `);
  } catch { /* already expanded */ }

  // Signing attachments
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_signing_attachments\` (
      \`id\`                   INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`                 VARCHAR(36) NOT NULL UNIQUE,
      \`request_id\`           INT NOT NULL,
      \`uploaded_by\`          INT NOT NULL,
      \`filename\`             VARCHAR(255) NOT NULL,
      \`original_name\`        VARCHAR(255) NOT NULL,
      \`mime_type\`            VARCHAR(100) NOT NULL,
      \`file_size\`            INT NOT NULL,
      \`file_path\`            TEXT NOT NULL,
      \`file_hash\`            VARCHAR(64),
      \`visible_to_signers\`   TINYINT(1) NOT NULL DEFAULT 1,
      \`append_to_final_pack\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_at\`           TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX \`idx_sa_request\` (\`request_id\`)
    )
  `);

  // Seed signing_enabled default
  await db.execute(sql`INSERT IGNORE INTO ja_system_config (config_key, value) VALUES ('signing_enabled', 'true')`);

  // ── Admin sessions — Microsoft identity columns ───────────────────────────
  // Added when migrating to Microsoft-only admin auth. adminId is now nullable.
  try {
    await db.execute(sql`ALTER TABLE \`ja_admin_sessions\` MODIFY COLUMN \`admin_id\` INT NULL`);
  } catch { /* already nullable */ }
  try {
    await db.execute(sql`ALTER TABLE \`ja_admin_sessions\` ADD COLUMN \`ms_email\` VARCHAR(255) NULL`);
  } catch { /* column already exists */ }
  try {
    await db.execute(sql`ALTER TABLE \`ja_admin_sessions\` ADD COLUMN \`ms_name\` VARCHAR(255) NULL`);
  } catch { /* column already exists */ }
  try {
    await db.execute(sql`ALTER TABLE \`ja_admin_sessions\` ADD COLUMN \`ms_roles\` VARCHAR(1000) NULL`);
  } catch { /* column already exists */ }
  try {
    await db.execute(sql`ALTER TABLE \`ja_admin_sessions\` ADD COLUMN \`ms_tid\` VARCHAR(64) NULL`);
  } catch { /* column already exists */ }

  // ── Admin audit log — add event_type column for richer logging ────────────
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_admin_audit_log\`
        ADD COLUMN \`event_type\` VARCHAR(60) NULL COMMENT 'ms_login_success | ms_login_failure | ms_wrong_tenant | ms_not_authorised | logout | api_blocked'
    `);
  } catch { /* column already exists */ }
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_admin_audit_log\`
        ADD COLUMN \`detail\` TEXT NULL
    `);
  } catch { /* column already exists */ }

  // ── CMS page content blocks ───────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_page_content\` (
      \`id\`          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`slug\`        VARCHAR(120) NOT NULL UNIQUE,
      \`title\`       VARCHAR(255) NOT NULL,
      \`type\`        VARCHAR(60) NOT NULL DEFAULT 'marketing',
      \`status\`      ENUM('published','draft','archived') NOT NULL DEFAULT 'draft',
      \`body_html\`   LONGTEXT,
      \`body_text\`   TEXT,
      \`meta_title\`  VARCHAR(255),
      \`meta_desc\`   VARCHAR(500),
      \`updated_by\`  VARCHAR(255) NOT NULL DEFAULT 'admin',
      \`version\`     INT NOT NULL DEFAULT 1,
      \`created_at\`  TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`  TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  // Seed default CMS content blocks
  const defaultContent: Array<{ slug: string; title: string; type: string; bodyHtml: string; bodyText: string }> = [
    {
      slug: 'homepage-hero',
      title: 'Homepage Hero',
      type: 'marketing',
      bodyHtml: '<h1>Build personalised plans step by step</h1><p>Sousa Murray Planeia provides guided builders for destinations, itineraries, experiences, budgets, accessibility and practical travel preparation.</p>',
      bodyText: 'Build personalised plans step by step with Sousa Murray Planeia guided planning tools.',
    },
    {
      slug: 'homepage-features',
      title: 'Homepage Features Section',
      type: 'marketing',
      bodyHtml: '<p>Guided planning builders, personalised outputs, secure saved plans, discovery tools and practical planning support.</p>',
      bodyText: 'Guided planning builders, personalised outputs and practical planning support.',
    },
    {
      slug: 'pricing-intro',
      title: 'Pricing Page Intro',
      type: 'marketing',
      bodyHtml: '<p>Choose the plan that works for you. Start free and upgrade when you need more. All plans include access to our core template library.</p>',
      bodyText: 'Choose the plan that works for you. Start free and upgrade when you need more.',
    },
    {
      slug: 'affiliate-hero',
      title: 'Affiliate Programme Hero',
      type: 'marketing',
      bodyHtml: '<h1>Earn with Sousa Murray Planeia</h1><p>Join our affiliate programme and earn commission on every customer you refer. Coming soon.</p>',
      bodyText: 'Join our affiliate programme and earn commission on every customer you refer.',
    },
  ];
  for (const item of defaultContent) {
    await db.execute(sql`
      INSERT IGNORE INTO \`ja_page_content\` (slug, title, type, status, body_html, body_text, updated_by, version)
      VALUES (${item.slug}, ${item.title}, ${item.type}, 'published', ${item.bodyHtml}, ${item.bodyText}, 'system', 1)
    `);
  }

  // ── Site settings ─────────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_site_settings\` (
      \`id\`           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`setting_key\`  VARCHAR(120) NOT NULL UNIQUE,
      \`value\`        TEXT NOT NULL,
      \`updated_by\`   VARCHAR(255) NOT NULL DEFAULT 'admin',
      \`updated_at\`   TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  // Seed default site settings
  const defaultSettings: Record<string, string> = {
    site_name: 'Sousa Murray Planeia',
    tagline: 'Personalised Plans, Generated in Minutes',
    support_email: 'contact@jagroupservices.co.uk',
    company_name: 'JA Group Services Ltd',
    primary_color: '#1B4F8A',
    accent_color: '#8a561b',
    logo_url: '',
    affiliate_coming_soon: 'true',
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db.execute(sql`INSERT IGNORE INTO \`ja_site_settings\` (setting_key, value) VALUES (${key}, ${value})`);
  }

  // GDPR requests table (legacy — kept for backward compat)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_gdpr_requests\` (
      \`id\`           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`user_id\`      INT NOT NULL,
      \`email\`        VARCHAR(255) NOT NULL,
      \`request_type\` ENUM('export','deletion') NOT NULL,
      \`reason\`       TEXT,
      \`status\`       ENUM('pending','processing','completed','rejected') NOT NULL DEFAULT 'pending',
      \`processed_by\` VARCHAR(255),
      \`processed_at\` TIMESTAMP NULL,
      \`admin_notes\`  TEXT,
      \`created_at\`   TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`   TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX \`idx_gdpr_user\` (\`user_id\`),
      INDEX \`idx_gdpr_status\` (\`status\`)
    )
  `);

  // Subject Access Requests (SAR) — full UK GDPR compliant table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_sar_requests\` (
      \`id\`                        INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`                      VARCHAR(36) NOT NULL UNIQUE,
      \`user_id\`                   INT NOT NULL,
      \`email\`                     VARCHAR(255) NOT NULL,
      \`full_name\`                 VARCHAR(255) NOT NULL,
      \`request_type\`              ENUM('sar','export','deletion','rectification','restriction','portability','objection') NOT NULL DEFAULT 'sar',
      \`notes\`                     TEXT,
      \`status\`                    ENUM('submitted','in_review','processing','ready','completed','rejected','unable_to_complete') NOT NULL DEFAULT 'submitted',
      \`deadline_at\`               TIMESTAMP NOT NULL,
      \`deadline_extended_at\`      TIMESTAMP NULL,
      \`deadline_extend_reason\`    TEXT,
      \`identity_verified\`         TINYINT(1) NOT NULL DEFAULT 0,
      \`identity_verified_by\`      VARCHAR(255),
      \`identity_verified_at\`      TIMESTAMP NULL,
      \`identity_notes\`            TEXT,
      \`assigned_to\`               VARCHAR(255),
      \`admin_notes\`               TEXT,
      \`rejection_reason\`          TEXT,
      \`processed_by\`              VARCHAR(255),
      \`processed_at\`              TIMESTAMP NULL,
      \`export_path\`               TEXT,
      \`export_generated_at\`       TIMESTAMP NULL,
      \`export_generated_by\`       VARCHAR(255),
      \`export_file_size_bytes\`    INT,
      \`download_token\`            VARCHAR(128),
      \`download_token_expires_at\` TIMESTAMP NULL,
      \`download_count\`            INT NOT NULL DEFAULT 0,
      \`last_download_at\`          TIMESTAMP NULL,
      \`ip_address\`                VARCHAR(45),
      \`user_agent\`                TEXT,
      \`created_at\`                TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`                TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX \`idx_sar_user\`        (\`user_id\`),
      INDEX \`idx_sar_status\`      (\`status\`),
      INDEX \`idx_sar_deadline\`    (\`deadline_at\`),
      INDEX \`idx_sar_token\`       (\`download_token\`)
    )
  `);

  // ── Resellers ────────────────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_resellers\` (
      \`id\`                    INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`                  VARCHAR(36) NOT NULL UNIQUE,
      \`user_id\`               INT,
      \`full_name\`             VARCHAR(255) NOT NULL,
      \`email\`                 VARCHAR(255) NOT NULL UNIQUE,
      \`phone\`                 VARCHAR(60),
      \`company\`               VARCHAR(255),
      \`website\`               VARCHAR(500),
      \`vat_number\`            VARCHAR(60),
      \`business_type\`         VARCHAR(100),
      \`expected_volume\`       VARCHAR(100),
      \`how_heard\`             VARCHAR(255),
      \`password_hash\`         VARCHAR(255) NOT NULL DEFAULT '',
      \`session_token\`         VARCHAR(128),
      \`session_expires_at\`    TIMESTAMP NULL,
      \`last_login\`            TIMESTAMP NULL,
      \`referral_code\`         VARCHAR(30) UNIQUE,
      \`referral_link\`         TEXT,
      \`commission_type\`       ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage',
      \`commission_rate\`       INT NOT NULL DEFAULT 15,
      \`commission_recurring\`  TINYINT(1) NOT NULL DEFAULT 0,
      \`min_payout_gbp\`        INT NOT NULL DEFAULT 5000,
      \`status\`                ENUM('applied','approved','rejected','suspended') NOT NULL DEFAULT 'applied',
      \`agreed_to_terms\`       TINYINT(1) NOT NULL DEFAULT 0,
      \`agreed_at\`             TIMESTAMP NULL,
      \`payout_method\`         VARCHAR(60),
      \`payout_details\`        TEXT,
      \`admin_notes\`           TEXT,
      \`approved_by\`           VARCHAR(255),
      \`approved_at\`           TIMESTAMP NULL,
      \`rejected_by\`           VARCHAR(255),
      \`rejected_at\`           TIMESTAMP NULL,
      \`rejection_reason\`      TEXT,
      \`notify_new_signup\`     TINYINT(1) NOT NULL DEFAULT 1,
      \`notify_commission\`     TINYINT(1) NOT NULL DEFAULT 1,
      \`notify_announcements\`  TINYINT(1) NOT NULL DEFAULT 1,
      \`created_at\`            TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`            TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX \`idx_reseller_status\` (\`status\`),
      INDEX \`idx_reseller_code\`   (\`referral_code\`)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_reseller_customers\` (
      \`id\`           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`reseller_id\`  INT NOT NULL,
      \`user_id\`      INT NOT NULL,
      \`assigned_by\`  VARCHAR(255),
      \`assigned_at\`  TIMESTAMP NOT NULL DEFAULT NOW(),
      \`notes\`        TEXT,
      UNIQUE KEY \`uq_reseller_user\` (\`reseller_id\`, \`user_id\`),
      INDEX \`idx_rc_reseller\` (\`reseller_id\`),
      INDEX \`idx_rc_user\`     (\`user_id\`)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_reseller_clicks\` (
      \`id\`           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`reseller_id\`  INT NOT NULL,
      \`ip_hash\`      VARCHAR(64),
      \`user_agent\`   VARCHAR(500),
      \`landing_page\` VARCHAR(500),
      \`created_at\`   TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX \`idx_rclk_reseller\` (\`reseller_id\`)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_reseller_commissions\` (
      \`id\`               INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`             VARCHAR(36) NOT NULL UNIQUE,
      \`reseller_id\`      INT NOT NULL,
      \`user_id\`          INT,
      \`type\`             ENUM('signup','subscription','renewal') NOT NULL DEFAULT 'signup',
      \`plan\`             VARCHAR(60),
      \`amount_gbp\`       INT NOT NULL DEFAULT 0,
      \`commission_gbp\`   INT NOT NULL DEFAULT 0,
      \`status\`           ENUM('pending','approved','paid','rejected','on_hold') NOT NULL DEFAULT 'pending',
      \`stripe_session_id\` VARCHAR(255),
      \`payment_ref\`      VARCHAR(255),
      \`paid_at\`          TIMESTAMP NULL,
      \`paid_by\`          VARCHAR(255),
      \`approved_by\`      VARCHAR(255),
      \`approved_at\`      TIMESTAMP NULL,
      \`rejected_by\`      VARCHAR(255),
      \`rejection_reason\` TEXT,
      \`admin_notes\`      TEXT,
      \`created_at\`       TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`       TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX \`idx_rcom_reseller\` (\`reseller_id\`),
      INDEX \`idx_rcom_status\`   (\`status\`)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_reseller_resources\` (
      \`id\`           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`         VARCHAR(36) NOT NULL UNIQUE,
      \`title\`        VARCHAR(255) NOT NULL,
      \`description\`  TEXT,
      \`category\`     VARCHAR(80) NOT NULL DEFAULT 'general',
      \`file_url\`     TEXT,
      \`external_url\` TEXT,
      \`file_type\`    VARCHAR(30),
      \`is_active\`    TINYINT(1) NOT NULL DEFAULT 1,
      \`sort_order\`   INT NOT NULL DEFAULT 0,
      \`created_by\`   VARCHAR(255),
      \`created_at\`   TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`   TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_reseller_announcements\` (
      \`id\`         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`       VARCHAR(36) NOT NULL UNIQUE,
      \`title\`      VARCHAR(255) NOT NULL,
      \`body\`       TEXT NOT NULL,
      \`priority\`   ENUM('normal','high','urgent') NOT NULL DEFAULT 'normal',
      \`is_active\`  TINYINT(1) NOT NULL DEFAULT 1,
      \`created_by\` VARCHAR(255),
      \`created_at\` TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_reseller_tickets\` (
      \`id\`          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`uuid\`        VARCHAR(36) NOT NULL UNIQUE,
      \`reseller_id\` INT NOT NULL,
      \`subject\`     VARCHAR(255) NOT NULL,
      \`status\`      ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
      \`priority\`    ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
      \`created_at\`  TIMESTAMP NOT NULL DEFAULT NOW(),
      \`updated_at\`  TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW(),
      INDEX \`idx_rt_reseller\` (\`reseller_id\`)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_reseller_ticket_messages\` (
      \`id\`           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`ticket_id\`    INT NOT NULL,
      \`sender_type\`  ENUM('reseller','admin') NOT NULL,
      \`sender_id\`    INT NOT NULL,
      \`sender_name\`  VARCHAR(255),
      \`body\`         TEXT NOT NULL,
      \`created_at\`   TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX \`idx_rtm_ticket\` (\`ticket_id\`)
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_reseller_audit\` (
      \`id\`           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`reseller_id\`  INT,
      \`admin_email\`  VARCHAR(255),
      \`action\`       VARCHAR(100) NOT NULL,
      \`detail\`       TEXT,
      \`ip_address\`   VARCHAR(45),
      \`created_at\`   TIMESTAMP NOT NULL DEFAULT NOW(),
      INDEX \`idx_raud_reseller\` (\`reseller_id\`)
    )
  `);

  // Add fields_override column to ja_builder_template_overrides (stores JSON array of BuilderField)
  try {
    await db.execute(sql`
      ALTER TABLE \`ja_builder_template_overrides\`
        ADD COLUMN \`fields_override\` LONGTEXT NULL
    `);
  } catch { /* column already exists */ }

  // Create ja_builder_meta_overrides table (builder-level name/description/colour overrides)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS \`ja_builder_meta_overrides\` (
      \`id\`           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`builder_id\`   VARCHAR(50) NOT NULL UNIQUE,
      \`label\`        VARCHAR(255),
      \`description\`  TEXT,
      \`accent_color\` VARCHAR(20),
      \`updated_by\`   VARCHAR(255),
      \`updated_at\`   TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE NOW()
    )
  `);
}
