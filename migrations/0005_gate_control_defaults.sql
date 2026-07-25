-- Existing installations may already have a complete sentence in coming_soon_headline.
-- Store an invisible explicit highlight value so the new split headline renderer does
-- not append its fresh-installation default highlighted words until an administrator
-- chooses them in Gate Control Centre.
INSERT INTO site_settings (key, value)
SELECT 'coming_soon_highlight', '​'
WHERE EXISTS (SELECT 1 FROM site_settings WHERE key = 'coming_soon_headline' AND trim(value) <> '')
  AND NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'coming_soon_highlight');

INSERT INTO site_settings (key, value)
SELECT 'coming_soon_owner_enabled', 'true'
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'coming_soon_owner_enabled');

INSERT INTO site_settings (key, value)
SELECT 'coming_soon_owner_prompt', 'Owner of this website?'
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'coming_soon_owner_prompt');

INSERT INTO site_settings (key, value)
SELECT 'coming_soon_owner_button_label', 'SIGN IN HERE'
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'coming_soon_owner_button_label');

INSERT INTO site_settings (key, value)
SELECT 'coming_soon_owner_url', '/admin'
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'coming_soon_owner_url');
