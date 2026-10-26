-- New enum values must be committed before any statement can use them, so this runs on its own.
alter type public.membership_status add value if not exists 'cancelled';
