-- Add INSERT policies for points_ledger to allow redemption transactions

-- Customers can insert their own ledger entries
CREATE POLICY "Customers can insert their own ledger entries"
ON public.points_ledger
FOR INSERT
TO authenticated
WITH CHECK (
  (actor_type = 'customer'::actor_type) 
  AND (actor_id_customer = get_customer_id(auth.uid()))
);

-- Specifiers can insert their own ledger entries
CREATE POLICY "Specifiers can insert their own ledger entries"
ON public.points_ledger
FOR INSERT
TO authenticated
WITH CHECK (
  (actor_type = 'specifier'::actor_type) 
  AND (actor_id_specifier = get_specifier_id(auth.uid()))
);