-- =============================================================================
-- DEV ONLY — creates a test user directly in auth.users so that the
-- daily_logs foreign key constraint is satisfied without a real login flow.
--
-- Run this ONCE in Supabase SQL Editor after running schema.sql.
-- Copy the UUID below and paste it into Dashboard.tsx as DEV_USER_ID.
-- =============================================================================

-- Use a fixed, known UUID so it's stable across resets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = 'a0000000-0000-0000-0000-000000000001'
  ) THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      'a0000000-0000-0000-0000-000000000001',  -- fixed dev UUID
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'dev@kinetic.local',
      '',   -- no password needed — we won't actually sign in
      now(),
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

-- Confirm the user was created
SELECT id, email FROM auth.users WHERE id = 'a0000000-0000-0000-0000-000000000001';
