-- Create table to track integrator executions
CREATE TABLE public.integrator_executions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  execution_id text NOT NULL UNIQUE,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  status text NOT NULL DEFAULT 'running',
  total_events integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  invoice_count integer NOT NULL DEFAULT 0,
  payment_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add execution_id column to sync_logs to link to executions
ALTER TABLE public.sync_logs 
ADD COLUMN execution_id text;

-- Enable RLS
ALTER TABLE public.integrator_executions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for admins
CREATE POLICY "Admins can view all integrator executions" 
ON public.integrator_executions 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_integrator_executions_execution_id ON public.integrator_executions(execution_id);
CREATE INDEX idx_integrator_executions_started_at ON public.integrator_executions(started_at DESC);
CREATE INDEX idx_sync_logs_execution_id ON public.sync_logs(execution_id);

-- Create trigger for updated_at
CREATE TRIGGER update_integrator_executions_updated_at
BEFORE UPDATE ON public.integrator_executions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();