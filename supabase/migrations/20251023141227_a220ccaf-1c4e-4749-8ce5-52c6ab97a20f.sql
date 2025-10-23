-- Corrigir search_path na função handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$function$;

-- Adicionar políticas RLS básicas para payments (somente admins podem ver)
CREATE POLICY "Admins can view all payments"
ON public.payments
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Adicionar políticas RLS básicas para webhook_events (somente admins)
CREATE POLICY "Admins can view webhook events"
ON public.webhook_events
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));