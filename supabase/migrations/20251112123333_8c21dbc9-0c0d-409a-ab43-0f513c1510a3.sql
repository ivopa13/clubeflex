-- Adicionar campo para armazenar múltiplos códigos externos em customers
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS external_ids JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.customers.external_ids IS 'Array de objetos {id_ext, name} para todos os CODCLI que compartilham o mesmo CNPJ/CPF';

-- Adicionar campo para armazenar múltiplos códigos externos em specifiers
ALTER TABLE public.specifiers 
ADD COLUMN IF NOT EXISTS external_ids JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.specifiers.external_ids IS 'Array de objetos {id_ext, name} para todos os códigos que compartilham o mesmo CNPJ/CPF';

-- Migrar dados existentes para o novo formato
UPDATE public.customers 
SET external_ids = jsonb_build_array(
  jsonb_build_object('id_ext', customer_id_ext, 'name', name)
)
WHERE external_ids = '[]'::jsonb;

UPDATE public.specifiers 
SET external_ids = jsonb_build_array(
  jsonb_build_object('id_ext', specifier_id_ext, 'name', name)
)
WHERE external_ids = '[]'::jsonb;