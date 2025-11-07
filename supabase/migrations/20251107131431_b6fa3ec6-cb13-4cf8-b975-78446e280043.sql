-- Tabela para armazenar erros de validação
CREATE TABLE IF NOT EXISTS public.validation_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL CHECK (event_type IN ('invoice_created', 'payment_confirmed')),
  error_type TEXT NOT NULL CHECK (error_type IN ('invalid_cpf_cnpj', 'empty_name')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('customer', 'specifier')),
  received_data JSONB NOT NULL,
  error_details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored')),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index para busca rápida por status
CREATE INDEX idx_validation_errors_status ON public.validation_errors(status);
CREATE INDEX idx_validation_errors_event_id ON public.validation_errors(event_id);

-- RLS Policies
ALTER TABLE public.validation_errors ENABLE ROW LEVEL SECURITY;

-- Admins podem visualizar todos os erros
CREATE POLICY "Admins can view all validation errors"
ON public.validation_errors
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Admins podem atualizar erros (resolver/ignorar)
CREATE POLICY "Admins can update validation errors"
ON public.validation_errors
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Trigger para atualizar updated_at
CREATE TRIGGER update_validation_errors_updated_at
BEFORE UPDATE ON public.validation_errors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();