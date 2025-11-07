-- Adicionar coluna order_number (NUMPED) na tabela invoices
ALTER TABLE public.invoices 
ADD COLUMN order_number TEXT;