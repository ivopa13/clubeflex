-- ============================================
-- VINCULAÇÃO AUTOMÁTICA BIDIRECIONAL CPF/CNPJ
-- ============================================

-- 1. Atualizar trigger: Customer → User (verifica profiles.doc também)
CREATE OR REPLACE FUNCTION public.link_customer_to_existing_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  customer_doc text;
  user_record record;
BEGIN
  -- Pegar o documento do customer e remover caracteres especiais
  customer_doc := regexp_replace(NEW.doc, '[^0-9]', '', 'g');
  
  IF customer_doc IS NULL OR customer_doc = '' THEN
    RETURN NEW;
  END IF;

  -- Procurar usuário com o mesmo documento (verifica metadata OU profiles)
  SELECT u.* INTO user_record
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE regexp_replace(u.raw_user_meta_data->>'doc', '[^0-9]', '', 'g') = customer_doc
     OR regexp_replace(p.doc, '[^0-9]', '', 'g') = customer_doc
  LIMIT 1;

  IF user_record.id IS NOT NULL THEN
    -- Vincular o customer ao usuário
    NEW.user_id := user_record.id;
    
    -- Garantir que existe a role de customer
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_record.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE LOG 'Customer % vinculado ao user % via CPF/CNPJ %', NEW.id, user_record.id, customer_doc;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Atualizar trigger: Specifier → User (verifica profiles.doc também)
CREATE OR REPLACE FUNCTION public.link_specifier_to_existing_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  specifier_doc text;
  user_record record;
BEGIN
  -- Pegar o documento do specifier e remover caracteres especiais
  specifier_doc := regexp_replace(NEW.doc, '[^0-9]', '', 'g');
  
  IF specifier_doc IS NULL OR specifier_doc = '' THEN
    RETURN NEW;
  END IF;

  -- Procurar usuário com o mesmo documento (verifica metadata OU profiles)
  SELECT u.* INTO user_record
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE regexp_replace(u.raw_user_meta_data->>'doc', '[^0-9]', '', 'g') = specifier_doc
     OR regexp_replace(p.doc, '[^0-9]', '', 'g') = specifier_doc
  LIMIT 1;

  IF user_record.id IS NOT NULL THEN
    -- Vincular o specifier ao usuário
    NEW.user_id := user_record.id;
    
    -- Garantir que existe a role de specifier
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_record.id, 'specifier')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE LOG 'Specifier % vinculado ao user % via CPF/CNPJ %', NEW.id, user_record.id, specifier_doc;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3. Atualizar trigger: User → Customer/Specifier (verifica profiles.doc também)
CREATE OR REPLACE FUNCTION public.link_user_to_customer_or_specifier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  WHERE regexp_replace(doc, '[^0-9]', '', 'g') = user_doc
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
    
    RAISE LOG 'User % vinculado ao customer % via CPF/CNPJ %', NEW.id, customer_record.id, user_doc;
    
    RETURN NEW;
  END IF;

  -- Tentar vincular a um specifier
  SELECT * INTO specifier_record 
  FROM public.specifiers 
  WHERE regexp_replace(doc, '[^0-9]', '', 'g') = user_doc
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
    
    RAISE LOG 'User % vinculado ao specifier % via CPF/CNPJ %', NEW.id, specifier_record.id, user_doc;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. NOVO: Trigger para revinculação quando profiles.doc é atualizado
CREATE OR REPLACE FUNCTION public.link_on_profile_doc_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  clean_new_doc text;
  clean_old_doc text;
  customer_record record;
  specifier_record record;
BEGIN
  -- Limpar documentos
  clean_new_doc := regexp_replace(COALESCE(NEW.doc, ''), '[^0-9]', '', 'g');
  clean_old_doc := regexp_replace(COALESCE(OLD.doc, ''), '[^0-9]', '', 'g');
  
  -- Se o doc mudou e não está vazio
  IF clean_new_doc IS DISTINCT FROM clean_old_doc AND clean_new_doc != '' THEN
    RAISE LOG 'Profile doc atualizado para user %: % -> %', NEW.id, clean_old_doc, clean_new_doc;
    
    -- Tentar vincular a um customer
    SELECT * INTO customer_record 
    FROM public.customers 
    WHERE regexp_replace(doc, '[^0-9]', '', 'g') = clean_new_doc
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
      
      RAISE LOG 'Profile update: User % vinculado ao customer % via CPF/CNPJ %', NEW.id, customer_record.id, clean_new_doc;
      
      RETURN NEW;
    END IF;

    -- Tentar vincular a um specifier
    SELECT * INTO specifier_record 
    FROM public.specifiers 
    WHERE regexp_replace(doc, '[^0-9]', '', 'g') = clean_new_doc
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
      
      RAISE LOG 'Profile update: User % vinculado ao specifier % via CPF/CNPJ %', NEW.id, specifier_record.id, clean_new_doc;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Criar trigger na tabela profiles
DROP TRIGGER IF EXISTS on_profile_doc_update ON public.profiles;
CREATE TRIGGER on_profile_doc_update
  AFTER UPDATE OF doc ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.link_on_profile_doc_update();

-- 5. Corrigir caso específico do usuário Ivo
DO $$
DECLARE
  user_ivo_id uuid := '9b442b0e-ebb4-4470-877d-748f225112b2';
  customer_ivo record;
BEGIN
  -- Buscar customer com CPF 29405412809
  SELECT * INTO customer_ivo
  FROM public.customers
  WHERE regexp_replace(doc, '[^0-9]', '', 'g') = '29405412809'
  LIMIT 1;
  
  IF customer_ivo.id IS NOT NULL THEN
    -- Vincular customer ao user
    UPDATE public.customers 
    SET user_id = user_ivo_id
    WHERE id = customer_ivo.id;
    
    -- Criar role de customer
    INSERT INTO public.user_roles (user_id, role)
    VALUES (user_ivo_id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'Usuário Ivo vinculado ao customer % com sucesso', customer_ivo.id;
  ELSE
    RAISE NOTICE 'Customer com CPF 29405412809 não encontrado';
  END IF;
END $$;