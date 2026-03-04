ALTER TABLE public.program_settings
  ADD COLUMN points_enabled_customer boolean NOT NULL DEFAULT true,
  ADD COLUMN points_enabled_specifier boolean NOT NULL DEFAULT true;