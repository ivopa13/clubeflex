
CREATE OR REPLACE FUNCTION public.get_invoices_total_amount(
  from_date timestamptz,
  to_date timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(total_amount), 0)
  FROM public.invoices
  WHERE created_at >= from_date
    AND created_at <= to_date
$$;
