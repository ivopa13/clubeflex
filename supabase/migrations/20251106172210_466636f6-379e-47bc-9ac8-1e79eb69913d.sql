-- Criar tabela para logs de sincronização do integrador
CREATE TABLE public.sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('fatura', 'pagamento')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'error')),
  payload JSONB,
  error_message TEXT,
  attempts INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT uq_sync_logs_event UNIQUE (event_id, event_type)
);

-- Índices para performance
CREATE INDEX idx_sync_logs_status ON public.sync_logs(status);
CREATE INDEX idx_sync_logs_event ON public.sync_logs(event_id, event_type);
CREATE INDEX idx_sync_logs_created_at ON public.sync_logs(created_at DESC);

-- RLS policies
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Admins podem ver todos os logs
CREATE POLICY "Admins can view all sync logs"
ON public.sync_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_sync_logs_updated_at
BEFORE UPDATE ON public.sync_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();