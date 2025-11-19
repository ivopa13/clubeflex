-- Adicionar coluna payment_type na tabela payments
ALTER TABLE payments 
ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'unknown';

COMMENT ON COLUMN payments.payment_type IS 
'Tipo de pagamento: credit (a prazo), cash (dinheiro), check (cheque), card (cartão), boleto, etc.';