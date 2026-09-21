-- Nexo Study · Migration 006
-- Promote the single beta owner account to administrator.
-- Username values are stored WITHOUT the @ prefix.

DO $$
DECLARE
  owner_count integer;
BEGIN
  SELECT count(*) INTO owner_count
  FROM public.profiles
  WHERE lower(username) = 'sebasshulla';

  IF owner_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one profile with username @sebasshulla, found %.', owner_count;
  END IF;

  -- During the private beta, keep exactly one administrator.
  UPDATE public.profiles
  SET is_admin = false
  WHERE is_admin = true
    AND lower(coalesce(username, '')) <> 'sebasshulla';

  UPDATE public.profiles
  SET is_admin = true
  WHERE lower(username) = 'sebasshulla';
END $$;
