
-- 1) Remove anon access to internal admin tables
DROP POLICY IF EXISTS "Allow anon to read integrator executions" ON public.integrator_executions;
DROP POLICY IF EXISTS "Allow anon to read sync logs" ON public.sync_logs;

-- 2) Restrict whatsapp_notifications policy to authenticated only
DROP POLICY IF EXISTS "Admins can view all whatsapp notifications" ON public.whatsapp_notifications;
CREATE POLICY "Admins can view all whatsapp notifications"
ON public.whatsapp_notifications
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 3) Explicit restrictive DELETE policy on redemptions (no one can delete via API)
CREATE POLICY "No deletes on redemptions"
ON public.redemptions
AS RESTRICTIVE
FOR DELETE
TO public
USING (false);

-- 4) Stop letting customers/specifiers freely INSERT into points_ledger
DROP POLICY IF EXISTS "Customers can insert their own ledger entries" ON public.points_ledger;
DROP POLICY IF EXISTS "Specifiers can insert their own ledger entries" ON public.points_ledger;
REVOKE INSERT ON public.points_ledger FROM authenticated, anon;

-- Helper RPC: insert the negative redeem ledger entry server-side, validated against the redemption
CREATE OR REPLACE FUNCTION public.create_redemption_ledger_entry(p_redemption_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_redemption public.redemptions%ROWTYPE;
  v_customer_id uuid;
  v_specifier_id uuid;
  v_total numeric;
  v_ledger_id uuid;
  v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_redemption FROM public.redemptions WHERE id = p_redemption_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption not found';
  END IF;

  v_customer_id := public.get_customer_id(v_uid);
  v_specifier_id := public.get_specifier_id(v_uid);

  IF v_redemption.actor_type = 'customer' AND v_redemption.actor_id_customer IS DISTINCT FROM v_customer_id THEN
    RAISE EXCEPTION 'Not authorized for this redemption';
  END IF;
  IF v_redemption.actor_type = 'specifier' AND v_redemption.actor_id_specifier IS DISTINCT FROM v_specifier_id THEN
    RAISE EXCEPTION 'Not authorized for this redemption';
  END IF;

  -- Idempotency: don't create twice for the same redemption
  SELECT id INTO v_existing FROM public.points_ledger
  WHERE ref = 'Resgate #' || substr(p_redemption_id::text, 1, 8)
    AND type = 'redeem'
    AND (
      (v_redemption.actor_type = 'customer' AND actor_id_customer = v_redemption.actor_id_customer)
      OR
      (v_redemption.actor_type = 'specifier' AND actor_id_specifier = v_redemption.actor_id_specifier)
    )
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  SELECT COALESCE(SUM(subtotal_points), 0) INTO v_total
  FROM public.redemption_items WHERE redemption_id = p_redemption_id;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Redemption has no items';
  END IF;

  INSERT INTO public.points_ledger (actor_type, actor_id_customer, actor_id_specifier, type, points, ref)
  VALUES (
    v_redemption.actor_type,
    CASE WHEN v_redemption.actor_type = 'customer' THEN v_redemption.actor_id_customer END,
    CASE WHEN v_redemption.actor_type = 'specifier' THEN v_redemption.actor_id_specifier END,
    'redeem',
    -v_total,
    'Resgate #' || substr(p_redemption_id::text, 1, 8)
  )
  RETURNING id INTO v_ledger_id;

  RETURN v_ledger_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_redemption_ledger_entry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_redemption_ledger_entry(uuid) TO authenticated;

-- 5) Lock down sensitive admin RPC SECURITY DEFINER functions: revoke from anon and enforce admin check inside
REVOKE ALL ON FUNCTION public.get_invoices_total_amount(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_sales_by_payment_type(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_sales_metrics(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invoices_total_amount(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_by_payment_type(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_metrics(timestamptz, timestamptz) TO authenticated;

-- Wrap aggregate functions with admin check (internally)
CREATE OR REPLACE FUNCTION public.get_invoices_total_amount(from_date timestamptz, to_date timestamptz)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN (SELECT COALESCE(SUM(total_amount), 0)
          FROM public.invoices
          WHERE created_at >= from_date AND created_at <= to_date);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_by_payment_type(from_date timestamptz, to_date timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN (
    WITH invoice_payment_type AS (
      SELECT
        i.id,
        i.total_amount,
        COALESCE(
          (SELECT p.payment_type FROM public.payments p WHERE p.invoice_id = i.id ORDER BY p.created_at LIMIT 1),
          'pending'
        ) AS payment_type
      FROM public.invoices i
      WHERE i.created_at >= from_date AND i.created_at <= to_date
    ),
    grouped AS (
      SELECT payment_type, COUNT(*) AS cnt, SUM(total_amount) AS total
      FROM invoice_payment_type GROUP BY payment_type
    )
    SELECT jsonb_object_agg(payment_type, jsonb_build_object('count', cnt, 'total', total))
    FROM grouped
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_sales_metrics(from_date timestamptz, to_date timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'total_revenue',   COALESCE(SUM(total_amount), 0),
      'ticket_count',    COUNT(*),
      'avg_ticket',      COALESCE(AVG(total_amount), 0),
      'product_revenue', COALESCE(SUM(CASE WHEN COALESCE(movement_type, 'produto') = 'produto' THEN total_amount ELSE 0 END), 0),
      'product_count',   COUNT(CASE WHEN COALESCE(movement_type, 'produto') = 'produto' THEN 1 END),
      'service_revenue', COALESCE(SUM(CASE WHEN movement_type = 'servico' THEN total_amount ELSE 0 END), 0),
      'service_count',   COUNT(CASE WHEN movement_type = 'servico' THEN 1 END)
    )
    FROM public.invoices
    WHERE created_at >= from_date AND created_at <= to_date
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoices_total_amount(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_sales_by_payment_type(timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_sales_metrics(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invoices_total_amount(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_by_payment_type(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_metrics(timestamptz, timestamptz) TO authenticated;

-- 6) Restrict listing on product-images bucket (block .list, only allow reading objects by exact path)
-- The bucket stays public for direct asset URLs (rendered images keep working) but anonymous .list() is denied.
UPDATE storage.buckets SET public = false WHERE id = 'product-images';

DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
CREATE POLICY "Public can read product images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-images');
