ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS created_at_ext timestamptz;

CREATE OR REPLACE FUNCTION public.notify_new_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff timestamptz := '2026-05-28 00:00:00-03'::timestamptz;
  v_ref timestamptz;
BEGIN
  -- Usa a data original do CPlus (DATCAD). Se não vier, não notifica (cliente antigo).
  v_ref := NEW.created_at_ext;
  IF v_ref IS NULL OR v_ref < v_cutoff THEN
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
      'created_at', COALESCE(NEW.created_at_ext, NEW.created_at)
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_new_customer failed for customer %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;