
-- Função para vincular customer a usuário existente
CREATE OR REPLACE FUNCTION public.link_customer_to_existing_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  customer_doc text;
  user_record record;
BEGIN
  -- Pegar o documento do customer e remover caracteres especiais
  customer_doc := regexp_replace(NEW.doc, '[^0-9]', '', 'g');
  
  IF customer_doc IS NULL OR customer_doc = '' THEN
    RETURN NEW;
  END IF;

  -- Procurar usuário com o mesmo documento
  SELECT * INTO user_record
  FROM auth.users
  WHERE regexp_replace(raw_user_meta_data->>'doc', '[^0-9]', '', 'g') = customer_doc
  LIMIT 1;

  IF user_record.id IS NOT NULL THEN
    -- Vincular o customer ao usuário
    NEW.user_id := user_record.id;
    
    -- Garantir que existe a role de customer
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_record.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Criar trigger para vincular customer a usuário existente
DROP TRIGGER IF EXISTS on_customer_created_link_to_user ON public.customers;
CREATE TRIGGER on_customer_created_link_to_user
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.link_customer_to_existing_user();

-- Criar função similar para specifiers
CREATE OR REPLACE FUNCTION public.link_specifier_to_existing_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  specifier_doc text;
  user_record record;
BEGIN
  -- Pegar o documento do specifier e remover caracteres especiais
  specifier_doc := regexp_replace(NEW.doc, '[^0-9]', '', 'g');
  
  IF specifier_doc IS NULL OR specifier_doc = '' THEN
    RETURN NEW;
  END IF;

  -- Procurar usuário com o mesmo documento
  SELECT * INTO user_record
  FROM auth.users
  WHERE regexp_replace(raw_user_meta_data->>'doc', '[^0-9]', '', 'g') = specifier_doc
  LIMIT 1;

  IF user_record.id IS NOT NULL THEN
    -- Vincular o specifier ao usuário
    NEW.user_id := user_record.id;
    
    -- Garantir que existe a role de specifier
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_record.id, 'specifier')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Criar trigger para vincular specifier a usuário existente
DROP TRIGGER IF EXISTS on_specifier_created_link_to_user ON public.specifiers;
CREATE TRIGGER on_specifier_created_link_to_user
  BEFORE INSERT ON public.specifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.link_specifier_to_existing_user();
