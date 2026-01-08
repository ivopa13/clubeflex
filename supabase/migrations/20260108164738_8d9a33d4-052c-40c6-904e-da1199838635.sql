-- Create table for WhatsApp notification logs
CREATE TABLE public.whatsapp_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_type TEXT NOT NULL, -- 'customer' or 'specifier'
  recipient_id UUID, -- customer or specifier ID
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  template_name TEXT NOT NULL,
  invoice_id UUID,
  invoice_id_ext TEXT,
  total_amount NUMERIC,
  points NUMERIC,
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'delivered', 'failed'
  whatsapp_message_id TEXT, -- ID returned by WhatsApp API
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;

-- Admin can view all notifications
CREATE POLICY "Admins can view all whatsapp notifications"
ON public.whatsapp_notifications
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster queries
CREATE INDEX idx_whatsapp_notifications_created_at ON public.whatsapp_notifications(created_at DESC);
CREATE INDEX idx_whatsapp_notifications_recipient_type ON public.whatsapp_notifications(recipient_type);
CREATE INDEX idx_whatsapp_notifications_status ON public.whatsapp_notifications(status);