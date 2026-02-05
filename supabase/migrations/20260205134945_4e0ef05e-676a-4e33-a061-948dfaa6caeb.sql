-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to notify validation errors via edge function
CREATE OR REPLACE FUNCTION public.notify_validation_error()
RETURNS TRIGGER AS $$
DECLARE
  supabase_url text;
  service_role_key text;
BEGIN
  -- Get the Supabase URL and service role key from vault or environment
  supabase_url := 'https://skhljdaqfzweshjrlcnn.supabase.co';
  
  -- Make HTTP request to edge function using pg_net
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/notify-validation-errors',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'id', NEW.id,
      'event_id', NEW.event_id,
      'event_type', NEW.event_type,
      'error_type', NEW.error_type,
      'entity_type', NEW.entity_type,
      'received_data', NEW.received_data,
      'error_details', NEW.error_details,
      'status', NEW.status,
      'created_at', NEW.created_at
    )
  );
  
  RAISE LOG 'Notification sent for validation error: %', NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS on_validation_error_insert ON public.validation_errors;

-- Create trigger that fires on new validation errors with status 'pending'
CREATE TRIGGER on_validation_error_insert
AFTER INSERT ON public.validation_errors
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION public.notify_validation_error();

-- Add comment for documentation
COMMENT ON FUNCTION public.notify_validation_error() IS 'Sends email notification via edge function when a new validation error is inserted with pending status';