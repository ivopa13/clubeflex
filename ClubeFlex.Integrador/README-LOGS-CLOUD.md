# 📊 Logs de Sincronização na Nuvem

## ✅ O que mudou?

Os logs de sincronização agora são enviados automaticamente para o **Lovable Cloud** ao invés de serem salvos no banco Firebird local.

### Vantagens:
- ✅ **Não precisa criar tabela `sync_log` no Firebird**
- ✅ **Banco do CPlus permanece intacto** - sem risco de interferência
- ✅ **Logs centralizados e acessíveis via web**
- ✅ **Histórico completo de todas sincronizações**
- ✅ **Consulta e análise facilitada**

## 🔧 Como funciona?

1. O integrador executa normalmente
2. Ao sincronizar cada fatura ou pagamento, envia o log via API para o Lovable Cloud
3. Os logs ficam disponíveis no backend do sistema

## 📝 O que é registrado?

Cada log contém:
- **event_id**: ID único do evento (invoice_id_ext ou payment_event_id)
- **event_type**: Tipo do evento (`fatura` ou `pagamento`)
- **status**: Status da sincronização (`success` ou `error`)
- **payload**: Dados completos do evento (JSON)
- **error_message**: Mensagem de erro (quando houver falha)
- **attempts**: Número de tentativas realizadas
- **timestamps**: Data/hora de criação e última atualização

## 🚀 Não precisa fazer nada!

A mudança é **totalmente transparente**:
- Mesmo `appsettings.json`
- Mesma configuração
- Mesma forma de executar

A única diferença é que os logs agora são enviados para a nuvem automaticamente!

## 🔍 Como ver os logs?

Os logs podem ser consultados no backend do Lovable Cloud pelos administradores do sistema.
