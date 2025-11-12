
-- Adicionar coluna doc na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS doc TEXT;

-- Criar política para admins poderem atualizar profiles
CREATE POLICY "Admins can update all profiles"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Criar política para admins poderem visualizar todos os profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));
