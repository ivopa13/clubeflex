## Reenviar notificações dos 5 novos clientes de hoje

### Objetivo
Disparar manualmente a edge function `notify-new-customer` para os 5 clientes inseridos hoje (27/03/2026) que não tiveram o email entregue por causa do problema anterior (Resend 403 antes da verificação do domínio).

### Clientes alvo (mais recentes de hoje)
1. `0407931f-abaa-4099-9421-bd0614b6b728` — FAZENDA PRIMAVERA (já validado no teste anterior, vai duplicar)
2. `222231cd-b09f-4d1f-a080-b92b0b5c8996` — TITAN TAMBAU
3. `e1c7ffc1-ed16-4702-bd8d-3943206e8a5e` — LUIZ DONIZETE DE ABREU
4. `004ad3b8-8d6e-4f2d-83f9-c28cb4ee41b6` — Hsampaio
5. `3e16ae25-43fe-4a08-b0eb-caea94e2c8f6` — PAULO RUGINSK BRASILEIRO NATO

> Obs: o cliente `0407931f` já recebeu o email no teste de validação que fizemos. Se você não quiser que ele receba novamente, eu disparo só os 4 restantes.

### Passos
1. Para cada cliente, fazer `curl` na edge function `notify-new-customer` com o payload completo (`id`, `customer_id_ext`, `name`, `doc`, `email`, `phone`, `address_city`, `address_state`, `status`, `created_at`).
2. Verificar a resposta (`success: true` + `emailResponse.id` do Resend) para confirmar entrega.
3. Reportar quais foram entregues e quais falharam.

### Não está no escopo (fica para depois)
- Investigar/consertar a confiabilidade do `pg_net` (o motivo de só 1 resposta no `_http_response`). Posso fazer isso em seguida se quiser, mas é um trabalho separado.

### Pergunta
- Reenvio para os **5** clientes ou pulo o `FAZENDA PRIMAVERA` (que já recebeu no teste)?
