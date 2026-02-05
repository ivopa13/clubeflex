

## Notificação Automática de Erros de Validação por Email

### Objetivo
Criar um sistema que envia emails automáticos para **financeiro@flexrep.com.br** (com cópia para **contato@patrezi.com.br**) sempre que novos erros de validação pendentes forem detectados.

---

### Arquitetura da Solução

```text
Novo Erro de Validação (INSERT)
           |
           v
  Trigger no Banco de Dados
           |
           v
  pg_net HTTP Request
           |
           v
  Edge Function: notify-validation-errors
           |
           v
  Resend API (Email)
           |
           v
  Emails enviados para:
  - financeiro@flexrep.com.br (TO)
  - contato@patrezi.com.br (CC)
```

---

### Etapas de Implementacao

#### 1. Criar Edge Function `notify-validation-errors`

Nova edge function que:
- Recebe dados do erro de validacao (nome do cadastro, tipo de erro, detalhes)
- Monta um email formatado em HTML com as informacoes
- Envia via Resend para os destinatarios configurados

**Dados do email:**
- **Para:** financeiro@flexrep.com.br
- **Copia (CC):** contato@patrezi.com.br
- **Assunto:** "[FLEX Clube] Erro de Validacao - {Nome do Cadastro}"
- **Conteudo:**
  - Nome do cadastro (customer ou specifier)
  - Tipo de erro (CPF/CNPJ invalido, nome vazio)
  - Detalhes do erro
  - Data/hora do registro
  - Link para o painel de erros

#### 2. Criar Trigger no Banco de Dados

Trigger que dispara automaticamente quando um novo erro de validacao e inserido na tabela `validation_errors` com status `pending`.

Usara `pg_net` para fazer uma chamada HTTP para a edge function.

#### 3. Atualizar Configuracao

- Adicionar a nova edge function no `supabase/config.toml`
- Configurar `verify_jwt = false` (chamada interna via trigger)

---

### Estrutura do Email

```text
+------------------------------------------+
|  [Logo FLEX Clube]                       |
+------------------------------------------+
|                                          |
|  ⚠️ Alerta de Erro de Validacao          |
|                                          |
|  Um novo erro foi detectado durante      |
|  a sincronizacao de dados.               |
|                                          |
+------------------------------------------+
|  DADOS DO CADASTRO                       |
|  Nome: FERNANDO TADEU MARTINS            |
|  Tipo: Cliente                           |
|  Codigo: 00000862                        |
+------------------------------------------+
|  ERRO IDENTIFICADO                       |
|  Tipo: CPF/CNPJ Invalido                 |
|  Detalhes: CPF invalido: 00000000000     |
+------------------------------------------+
|  DATA DO REGISTRO                        |
|  27/01/2026 as 14:47                     |
+------------------------------------------+
|                                          |
|  [Acessar Painel de Erros]               |
|                                          |
+------------------------------------------+
```

---

### Arquivos a Serem Criados/Modificados

| Arquivo | Acao |
|---------|------|
| `supabase/functions/notify-validation-errors/index.ts` | Criar |
| `supabase/config.toml` | Modificar (adicionar funcao) |
| Migration SQL | Criar (trigger + funcao) |

---

### Secao Tecnica

#### Edge Function (notify-validation-errors/index.ts)

```typescript
// Estrutura principal
- Recebe POST com dados do erro
- Extrai nome, tipo e detalhes do received_data
- Usa Resend SDK para enviar email
- Retorna status de sucesso/erro
```

#### Migration SQL

```sql
-- Funcao que chama a edge function via pg_net
CREATE OR REPLACE FUNCTION notify_validation_error()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://skhljdaqfzweshjrlcnn.supabase.co/functions/v1/notify-validation-errors',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que dispara no INSERT
CREATE TRIGGER on_validation_error_insert
AFTER INSERT ON validation_errors
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION notify_validation_error();
```

---

### Beneficios

- Notificacao imediata quando erros de cadastro sao detectados
- Equipe do financeiro pode corrigir dados no CPLus rapidamente
- Historico de notificacoes no log da edge function
- Sem necessidade de verificar o painel manualmente

