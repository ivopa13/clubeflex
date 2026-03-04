# Prompt para o projeto Flex Ambiental

Copie e cole este prompt como primeira mensagem no novo projeto Lovable.

---

## 🎨 Identidade Visual (OBRIGATÓRIO — copiar exatamente)

**Paleta de cores (HSL):**
- **Primary (Laranja Construção):** `hsl(16, 100%, 60%)` → hex `#ff914d`
- **Primary Glow:** `hsl(16, 100%, 70%)`
- **Secondary (Azul Profissional):** `hsl(221, 83%, 25%)` → hex `#18375d`
- **Accent (Verde Sucesso):** `hsl(142, 76%, 36%)`
- **Destructive:** `hsl(0, 84%, 60%)`
- **Background:** `hsl(0, 0%, 100%)`
- **Foreground:** `hsl(222, 47%, 11%)`
- **Muted:** `hsl(210, 40%, 96%)`
- **Muted Foreground:** `hsl(215, 16%, 47%)`
- **Border/Input:** `hsl(214, 32%, 91%)`
- **Ring:** same as primary

**Gradientes:**
- `--gradient-primary`: `linear-gradient(135deg, hsl(16 100% 60%), hsl(16 100% 70%))`
- `--gradient-secondary`: `linear-gradient(135deg, hsl(221 83% 25%), hsl(221 83% 35%))`
- `--gradient-hero`: `linear-gradient(135deg, hsl(16 100% 60%) 0%, hsl(221 83% 25%) 100%)`

**Sombras:**
- `--shadow-glow`: `0 0 40px hsl(16 100% 60% / 0.3)`
- `--shadow-card`: `0 4px 20px hsl(222 47% 11% / 0.08)`

**Tipografia:** Montserrat (Google Fonts)

**Espaçamentos:** Múltiplos de 4px/8px

**Border radius:** `0.75rem`

**Logo:** Use o mesmo logo da Flex (será fornecido como imagem).

---

## 🔐 Tela de Login (copiar layout e comportamento)

A tela de login deve ser **idêntica** ao projeto ClubeFlex:

### Layout
- Tela cheia com fundo gradiente hero (`--gradient-hero`: laranja → azul, 135deg)
- Card centralizado (`max-w-md`), shadow `--shadow-card`
- Logo Flex no topo do card (`h-24`, centralizado, `object-contain`)
- Título: "FLEX Ambiental", `text-3xl font-bold`
- Subtítulo: "Sistema de Gestão Ambiental" em `CardDescription`

### Abas (Tabs)
- 2 abas: "Entrar" e "Cadastrar" (`grid-cols-2`)

### Formulário de Login (aba "Entrar")
- Campo: Email (`type="email"`, placeholder "seu@email.com")
- Campo: Senha (`type="password"`, placeholder "••••••")
- Link "Esqueci minha senha" (alinhado à direita do label Senha, `text-xs text-primary hover:underline`)
- Checkbox "Lembrar meu email" (salva em localStorage)
- Cloudflare Turnstile widget (verificação de segurança)
- Botão "Entrar" (`w-full`, cor primary)

### Formulário de Cadastro (aba "Cadastrar")
- Campo: Nome Completo
- Campo: CPF ou CNPJ (com máscara automática `000.000.000-00` ou `00.000.000/0000-00`)
- Texto auxiliar: "Se você já foi cadastrado pela loja, será vinculado automaticamente"
- Campo: Email
- Campo: Senha (mín. 6 caracteres)
- Cloudflare Turnstile widget
- Botão "Criar Conta" (`w-full`, cor primary)

### Validações
- CPF: validação com dígitos verificadores (algoritmo completo)
- CNPJ: validação com dígitos verificadores (algoritmo completo)
- Email: validação com Zod
- Senha: mínimo 6 caracteres com Zod

### Comportamento pós-login
- Busca roles do usuário na tabela `user_roles`
- Admin → `/admin`
- Customer → `/portal`
- Sem role → mensagem de erro "Usuário sem permissões configuradas"

---

## 🗄️ Backend: Recepção de Clientes via Integrador

### Tabela `customers`

```sql
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id_ext text NOT NULL UNIQUE,
  name text NOT NULL,
  doc text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'active',
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage customers" ON public.customers FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Customers can view their own data" ON public.customers FOR SELECT
  USING (auth.uid() = user_id);
```

### Edge Function `/cliente-sync`

Endpoint POST que recebe o payload do integrador C#:

```json
{
  "event_id": "CLI_12345",
  "source": "erp_windows",
  "customer_id_ext": "12345",
  "name": "João da Silva",
  "cpf": "12345678901",
  "cnpj": null,
  "email": "joao@email.com",
  "phone": "(19) 99999-9999",
  "status": "active",
  "checksum": "abc123def456"
}
```

**Lógica:**
- UPSERT por `customer_id_ext`
- O campo `doc` deve receber o CPF ou CNPJ (o que não for nulo/vazio)
- Se ambos forem nulos, usar string vazia
- Retorna `{ success: true }` em caso de sucesso
- Retorna `{ error: "mensagem", validation_error: true }` com status 400 para erros de dados

### Tabela `sync_logs`

```sql
CREATE TABLE public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  execution_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
```

### Edge Function `/sync-log`

Recebe e grava logs de sincronização do integrador.

### Edge Function `/integrator-execution`

Registra início (`action: "start"`) e fim (`action: "finish"`) de execuções do integrador.

### Tabela `integrator_executions`

```sql
CREATE TABLE public.integrator_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  total_events integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  invoice_count integer NOT NULL DEFAULT 0,
  payment_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integrator_executions ENABLE ROW LEVEL SECURITY;
```

---

## 🔑 Autenticação e Roles

### Tabela `user_roles`

```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'customer');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
```

### Função `has_role`

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;
```

### Tabela `profiles`

```sql
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  doc text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
```

### Trigger: vincular customer ao user pelo CPF/CNPJ

Ao criar/atualizar um customer, buscar se existe um user com o mesmo documento e vincular automaticamente (`user_id`).

---

## 📋 Custom Knowledge (adicionar nas configurações do projeto)

```
Paleta de cores: Cor principal: #ff914d, Cor secundária: #18375d
Tipografia: Montserrat
Espaçamentos: Múltiplos de 4px/8px
Tom de voz: próximo, claro e valorizador
Estilo de comunicação: humano, direto e positivo
Nomeação: inglês, camelCase para variáveis, kebab-case para arquivos
Edge Functions: obrigatoriamente kebab-case nos nomes (ex: cliente-sync, sync-log)
```

---

## ⚙️ Configuração do Integrador (no projeto ClubeFlex)

Quando o projeto Flex Ambiental estiver criado, adicionar ao `appsettings.json` do integrador:

```json
{
  "Name": "FlexAmbiental",
  "BaseUrl": "https://<PROJECT_ID>.supabase.co/functions/v1",
  "ApiKey": "<ANON_KEY>",
  "SyncInvoices": false,
  "SyncPayments": false,
  "SyncReceivables": false,
  "SyncCustomers": true
}
```
