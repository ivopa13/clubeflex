-- Atualizar função para adicionar DDD 19 quando não houver
CREATE OR REPLACE FUNCTION public.clean_phone_number(raw_phone text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  cleaned text;
  phones text[];
  phone text;
  best_phone text := null;
  best_is_mobile boolean := false;
  normalized text;
  ddd text;
  number_part text;
  is_mobile boolean;
BEGIN
  -- Return null if input is null or empty
  IF raw_phone IS NULL OR trim(raw_phone) = '' THEN
    RETURN NULL;
  END IF;

  -- Remove all non-numeric characters except separators that might indicate multiple phones
  cleaned := raw_phone;
  
  -- Split by common separators (/, |, ;, or, e, ,) to get individual phones
  phones := regexp_split_to_array(cleaned, '[/|;,]|\s+(?:ou|e|and|or)\s+', 'i');
  
  -- Process each potential phone number
  FOREACH phone IN ARRAY phones LOOP
    -- Extract only digits
    normalized := regexp_replace(phone, '[^0-9]', '', 'g');
    
    -- Skip if too short
    IF length(normalized) < 8 THEN
      CONTINUE;
    END IF;
    
    -- Remove country code (55) if present at the start
    IF length(normalized) >= 12 AND substring(normalized, 1, 2) = '55' THEN
      normalized := substring(normalized, 3);
    END IF;
    
    -- Handle different formats
    IF length(normalized) = 11 THEN
      -- Format: DDD + 9 digits (mobile)
      ddd := substring(normalized, 1, 2);
      number_part := substring(normalized, 3);
      is_mobile := substring(number_part, 1, 1) = '9';
    ELSIF length(normalized) = 10 THEN
      -- Format: DDD + 8 digits (landline)
      ddd := substring(normalized, 1, 2);
      number_part := substring(normalized, 3);
      is_mobile := false;
    ELSIF length(normalized) = 9 THEN
      -- Format: 9 digits without DDD (assume mobile, add DDD 19)
      ddd := '19';
      number_part := normalized;
      is_mobile := substring(number_part, 1, 1) = '9';
      normalized := '19' || normalized;
    ELSIF length(normalized) = 8 THEN
      -- Format: 8 digits without DDD (landline, add DDD 19)
      ddd := '19';
      number_part := normalized;
      is_mobile := false;
      normalized := '19' || normalized;
    ELSE
      CONTINUE;
    END IF;
    
    -- Validate DDD if present (Brazilian DDDs are 11-99)
    IF ddd IS NOT NULL AND (ddd::int < 11 OR ddd::int > 99) THEN
      CONTINUE;
    END IF;
    
    -- Pick this phone if:
    -- 1. We don't have one yet
    -- 2. This is mobile and current best is not
    IF best_phone IS NULL OR (is_mobile AND NOT best_is_mobile) THEN
      best_phone := normalized;
      best_is_mobile := is_mobile;
    END IF;
  END LOOP;
  
  -- Return null if no valid phone found
  IF best_phone IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Format the phone number (now all phones have DDD)
  IF length(best_phone) = 11 THEN
    -- (XX) 9XXXX-XXXX
    RETURN '(' || substring(best_phone, 1, 2) || ') ' || 
           substring(best_phone, 3, 5) || '-' || 
           substring(best_phone, 8, 4);
  ELSIF length(best_phone) = 10 THEN
    -- (XX) XXXX-XXXX
    RETURN '(' || substring(best_phone, 1, 2) || ') ' || 
           substring(best_phone, 3, 4) || '-' || 
           substring(best_phone, 7, 4);
  END IF;
  
  RETURN best_phone;
END;
$function$;

-- Re-aplicar nos registros existentes para adicionar DDD 19 onde falta
UPDATE public.customers SET phone = public.clean_phone_number(phone) WHERE phone IS NOT NULL;
UPDATE public.specifiers SET phone = public.clean_phone_number(phone) WHERE phone IS NOT NULL;