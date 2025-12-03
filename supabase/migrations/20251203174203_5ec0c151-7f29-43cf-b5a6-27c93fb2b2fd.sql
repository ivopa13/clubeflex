-- Adicionar coluna movement_type na tabela invoices para categorizar vendas
-- 007/018 = produto (vendas de produtos)
-- 064 = servico (vendas de serviços)

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS movement_type text DEFAULT 'produto';

-- Criar índice para consultas por tipo de movimento
CREATE INDEX IF NOT EXISTS idx_invoices_movement_type ON public.invoices(movement_type);

-- Comentário na coluna
COMMENT ON COLUMN public.invoices.movement_type IS 'Tipo de movimento: produto (007/018) ou servico (064)';