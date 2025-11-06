-- Script para criar a tabela sync_log no Firebird
-- Execute este script usando FlameRobin, IBExpert ou outra ferramenta

CREATE TABLE sync_log (
    id INTEGER NOT NULL,
    event_id VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    payload BLOB SUB_TYPE TEXT,
    error_message BLOB SUB_TYPE TEXT,
    attempts INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT PK_sync_log PRIMARY KEY (id),
    CONSTRAINT UQ_sync_log_event UNIQUE (event_id, event_type)
);

CREATE GENERATOR GEN_sync_log_id;
SET GENERATOR GEN_sync_log_id TO 0;

CREATE TRIGGER sync_log_bi FOR sync_log
ACTIVE BEFORE INSERT POSITION 0
AS
BEGIN
    IF (NEW.id IS NULL) THEN
        NEW.id = GEN_ID(GEN_sync_log_id, 1);
END;

CREATE INDEX IDX_sync_log_status ON sync_log(status);
CREATE INDEX IDX_sync_log_event ON sync_log(event_id, event_type);
