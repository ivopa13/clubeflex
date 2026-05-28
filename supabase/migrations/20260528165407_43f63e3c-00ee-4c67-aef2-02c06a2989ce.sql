CREATE OR REPLACE FUNCTION public.notify_new_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := '2026-05-28 00:00:00-03'::timestamptz;
BEGIN
  -- Só notifica clientes criados a partir do cutoff (evita flood no primeiro sync)
  IF NEW.created_at < v_cutoff THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://skhljdaqfzweshjrlcnn.supabase.co/functions/v1/notify-new-customer',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'id', NEW.id,
      'customer_id_ext', NEW.customer_id_ext,
      'name', NEW.name,
      'doc', NEW.doc,
      'email', NEW.email,
      'phone', NEW.phone,
      'address_city', NEW.address_city,
      'address_state', NEW.address_state,
      'status', NEW.status,
      'created_at', NEW.created_at
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_new_customer failed for customer %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;