CREATE OR REPLACE FUNCTION public.notify_new_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
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

DROP TRIGGER IF EXISTS trg_notify_new_customer ON public.customers;
CREATE TRIGGER trg_notify_new_customer
AFTER INSERT ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.notify_new_customer();