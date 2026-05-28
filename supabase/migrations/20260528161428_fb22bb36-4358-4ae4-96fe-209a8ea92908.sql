
GRANT EXECUTE ON FUNCTION public.get_invoices_total_amount(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_by_payment_type(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_metrics(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_redemption_ledger_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_specifier_id(uuid) TO authenticated;
