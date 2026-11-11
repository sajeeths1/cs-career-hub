-- Add companies with active Greenhouse boards verified on 2026-11-05.
-- Adds catalog options only; the next scheduled pipeline collects their jobs.
-- Existing company rows, IDs, priority choices and custom ATS settings are preserved.
begin;
insert into public.companies (name, ats_type, ats_slug) values
  ('Affirm', 'greenhouse', 'affirm'),
  ('Airtable', 'greenhouse', 'airtable'),
  ('Asana', 'greenhouse', 'asana'),
  ('Brex', 'greenhouse', 'brex'),
  ('Chime', 'greenhouse', 'chime'),
  ('Cockroach Labs', 'greenhouse', 'cockroachlabs'),
  ('Duolingo', 'greenhouse', 'duolingo'),
  ('Elastic', 'greenhouse', 'elastic'),
  ('GitLab', 'greenhouse', 'gitlab'),
  ('HubSpot', 'greenhouse', 'hubspotjobs'),
  ('Klaviyo', 'greenhouse', 'klaviyo'),
  ('MongoDB', 'greenhouse', 'mongodb'),
  ('Okta', 'greenhouse', 'okta'),
  ('Roblox', 'greenhouse', 'roblox'),
  ('Rubrik', 'greenhouse', 'rubrik'),
  ('Samsara', 'greenhouse', 'samsara'),
  ('Scale AI', 'greenhouse', 'scaleai'),
  ('SoFi', 'greenhouse', 'sofi'),
  ('Squarespace', 'greenhouse', 'squarespace'),
  ('Toast', 'greenhouse', 'toast'),
  ('Twitch', 'greenhouse', 'twitch'),
  ('Verkada', 'greenhouse', 'verkada'),
  ('SingleStore', 'greenhouse', 'singlestore'),
  ('Vercel', 'greenhouse', 'vercel'),
  ('Gusto', 'greenhouse', 'gusto'),
  ('Ramp', 'greenhouse', 'ramp')
on conflict (name) do nothing;
commit;
