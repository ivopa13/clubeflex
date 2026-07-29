ALTER TABLE public.sync_logs DROP CONSTRAINT IF EXISTS sync_logs_event_type_check;
ALTER TABLE public.customers ALTER COLUMN doc DROP NOT NULL;
UPDATE public.customers SET doc = NULL WHERE doc = '';