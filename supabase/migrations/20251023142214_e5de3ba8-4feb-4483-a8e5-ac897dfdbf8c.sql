-- Garantir que documento seja obrigatório e único em customers
ALTER TABLE public.customers
  ALTER COLUMN doc SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_doc_unique ON public.customers(doc);

-- Garantir que documento seja obrigatório e único em specifiers  
ALTER TABLE public.specifiers
  ALTER COLUMN doc SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS specifiers_doc_unique ON public.specifiers(doc);

-- Adicionar trigger para atualizar user_id quando usuário se cadastra
CREATE OR REPLACE FUNCTION public.link_user_to_customer_or_specifier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_doc text;
  customer_record record;
  specifier_record record;
BEGIN
  -- Pegar o documento do user_metadata
  user_doc := NEW.raw_user_meta_data->>'doc';
  
  IF user_doc IS NULL OR user_doc = '' THEN
    RETURN NEW;
  END IF;

  -- Remover caracteres especiais do documento
  user_doc := regexp_replace(user_doc, '[^0-9]', '', 'g');

  -- Tentar vincular a um customer
  SELECT * INTO customer_record 
  FROM public.customers 
  WHERE doc = user_doc 
  LIMIT 1;

  IF customer_record.id IS NOT NULL THEN
    -- Atualizar o customer com o user_id
    UPDATE public.customers 
    SET user_id = NEW.id 
    WHERE id = customer_record.id;
    
    -- Criar role de customer
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RETURN NEW;
  END IF;

  -- Tentar vincular a um specifier
  SELECT * INTO specifier_record 
  FROM public.specifiers 
  WHERE doc = user_doc 
  LIMIT 1;

  IF specifier_record.id IS NOT NULL THEN
    -- Atualizar o specifier com o user_id
    UPDATE public.specifiers 
    SET user_id = NEW.id 
    WHERE id = specifier_record.id;
    
    -- Criar role de specifier
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'specifier')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  -- Se não encontrou nem customer nem specifier, apenas cria o profile (sem role)
  RETURN NEW;
END;
$$;

-- Atualizar o trigger para incluir a nova lógica
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.link_user_to_customer_or_specifier();