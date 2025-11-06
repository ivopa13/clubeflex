-- Script para criar tabela de controle de sincronização
-- Execute este script no seu banco de dados SQL Server local

-- Verificar se a tabela já existe
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sync_log')
BEGIN
    CREATE TABLE sync_log (
        id INT IDENTITY(1,1) PRIMARY KEY,
        event_id VARCHAR(100) NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        payload NVARCHAR(MAX),
        error_message NVARCHAR(MAX),
        attempts INT DEFAULT 0,
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        CONSTRAINT UK_sync_log_event_id UNIQUE (event_id)
    );

    -- Criar índices para performance
    CREATE INDEX IX_sync_log_event_type_status 
    ON sync_log(event_type, status);

    CREATE INDEX IX_sync_log_created_at 
    ON sync_log(created_at);

    PRINT 'Tabela sync_log criada com sucesso!';
END
ELSE
BEGIN
    PRINT 'Tabela sync_log já existe';
END
GO

-- Comentários sobre os campos:
-- event_id: Identificador único do evento (usado para idempotência)
-- event_type: Tipo do evento ('fatura-criada' ou 'pagamento-confirmado')
-- status: Status da sincronização ('pending', 'success', 'error')
-- payload: JSON do payload enviado (para auditoria)
-- error_message: Mensagem de erro caso a sincronização falhe
-- attempts: Número de tentativas de envio
-- created_at: Data/hora da primeira tentativa
-- updated_at: Data/hora da última atualização
