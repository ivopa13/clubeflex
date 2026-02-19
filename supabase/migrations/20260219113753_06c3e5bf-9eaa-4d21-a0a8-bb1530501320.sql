
-- Função para métricas gerais de vendas (faturamento, tickets, ticket médio)
CREATE OR REPLACE FUNCTION public.get_sales_metrics(
  from_date timestamptz,
  to_date timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  WHERE created_at >= from_date
    AND created_at <= to_date
$$;

-- Função para breakdown de vendas por tipo de pagamento
CREATE OR REPLACE FUNCTION public.get_sales_by_payment_type(
  from_date timestamptz,
  to_date timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH invoice_payment_type AS (
    -- Faturas com pagamento: usa o tipo do primeiro pagamento
    SELECT
      i.id,
      i.total_amount,
      COALESCE(
        (SELECT p.payment_type FROM public.payments p WHERE p.invoice_id = i.id ORDER BY p.created_at LIMIT 1),
        'pending'
      ) AS payment_type
    FROM public.invoices i
    WHERE i.created_at >= from_date
      AND i.created_at <= to_date
  ),
  grouped AS (
    SELECT
      payment_type,
      COUNT(*)           AS cnt,
      SUM(total_amount)  AS total
    FROM invoice_payment_type
    GROUP BY payment_type
  )
  SELECT jsonb_object_agg(
    payment_type,
    jsonb_build_object('count', cnt, 'total', total)
  )
  FROM grouped
$$;
