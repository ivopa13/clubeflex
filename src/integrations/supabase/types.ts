export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      catalog_products: {
        Row: {
          cash_copay: number | null
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          image_urls: Json | null
          is_active: boolean
          name: string
          points_price: number
          sku: string
          stock_qty: number
          track_inventory: boolean
          updated_at: string | null
        }
        Insert: {
          cash_copay?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_urls?: Json | null
          is_active?: boolean
          name: string
          points_price: number
          sku: string
          stock_qty?: number
          track_inventory?: boolean
          updated_at?: string | null
        }
        Update: {
          cash_copay?: number | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          image_urls?: Json | null
          is_active?: boolean
          name?: string
          points_price?: number
          sku?: string
          stock_qty?: number
          track_inventory?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string | null
          customer_id_ext: string
          doc: string
          email: string | null
          external_ids: Json | null
          id: string
          name: string
          phone: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id_ext: string
          doc: string
          email?: string | null
          external_ids?: Json | null
          id?: string
          name: string
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id_ext?: string
          doc?: string
          email?: string | null
          external_ids?: Json | null
          id?: string
          name?: string
          phone?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      integrator_executions: {
        Row: {
          created_at: string
          error_count: number
          execution_id: string
          finished_at: string | null
          id: string
          invoice_count: number
          payment_count: number
          started_at: string
          status: string
          success_count: number
          total_events: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_count?: number
          execution_id: string
          finished_at?: string | null
          id?: string
          invoice_count?: number
          payment_count?: number
          started_at?: string
          status?: string
          success_count?: number
          total_events?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_count?: number
          execution_id?: string
          finished_at?: string | null
          id?: string
          invoice_count?: number
          payment_count?: number
          started_at?: string
          status?: string
          success_count?: number
          total_events?: number
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          invoice_id_ext: string
          movement_type: string | null
          order_number: string | null
          pending_points_customer: number
          pending_points_specifier: number
          released_points_customer: number
          released_points_specifier: number
          specifier_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          total_amount: number
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          invoice_id_ext: string
          movement_type?: string | null
          order_number?: string | null
          pending_points_customer?: number
          pending_points_specifier?: number
          released_points_customer?: number
          released_points_specifier?: number
          specifier_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total_amount: number
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          invoice_id_ext?: string
          movement_type?: string | null
          order_number?: string | null
          pending_points_customer?: number
          pending_points_specifier?: number
          released_points_customer?: number
          released_points_specifier?: number
          specifier_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_specifier_id_fkey"
            columns: ["specifier_id"]
            isOneToOne: false
            referencedRelation: "specifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          created_at: string | null
          id: string
          invoice_id: string
          paid_amount: number
          paid_at: string
          payment_event_id: string
          payment_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invoice_id: string
          paid_amount: number
          paid_at: string
          payment_event_id: string
          payment_type?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invoice_id?: string
          paid_amount?: number
          paid_at?: string
          payment_event_id?: string
          payment_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      points_ledger: {
        Row: {
          actor_id_customer: string | null
          actor_id_specifier: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          created_at: string | null
          id: string
          invoice_id: string | null
          points: number
          ref: string | null
          type: Database["public"]["Enums"]["ledger_type"]
        }
        Insert: {
          actor_id_customer?: string | null
          actor_id_specifier?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          points: number
          ref?: string | null
          type: Database["public"]["Enums"]["ledger_type"]
        }
        Update: {
          actor_id_customer?: string | null
          actor_id_specifier?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          points?: number
          ref?: string | null
          type?: Database["public"]["Enums"]["ledger_type"]
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_actor_id_customer_fkey"
            columns: ["actor_id_customer"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_actor_id_specifier_fkey"
            columns: ["actor_id_specifier"]
            isOneToOne: false
            referencedRelation: "specifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          doc: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          doc?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          doc?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      program_settings: {
        Row: {
          allow_copay: boolean
          earn_rate_customer: number
          earn_rate_specifier: number
          id: string
          point_monetary_value: number
          points_enabled_customer: boolean
          points_enabled_specifier: boolean
          points_expiration_days: number | null
          updated_at: string | null
        }
        Insert: {
          allow_copay?: boolean
          earn_rate_customer?: number
          earn_rate_specifier?: number
          id?: string
          point_monetary_value?: number
          points_enabled_customer?: boolean
          points_enabled_specifier?: boolean
          points_expiration_days?: number | null
          updated_at?: string | null
        }
        Update: {
          allow_copay?: boolean
          earn_rate_customer?: number
          earn_rate_specifier?: number
          id?: string
          point_monetary_value?: number
          points_enabled_customer?: boolean
          points_enabled_specifier?: boolean
          points_expiration_days?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      redemption_items: {
        Row: {
          copay_price: number
          created_at: string | null
          id: string
          points_price: number
          product_id: string
          qty: number
          redemption_id: string
          subtotal_points: number
        }
        Insert: {
          copay_price?: number
          created_at?: string | null
          id?: string
          points_price: number
          product_id: string
          qty?: number
          redemption_id: string
          subtotal_points: number
        }
        Update: {
          copay_price?: number
          created_at?: string | null
          id?: string
          points_price?: number
          product_id?: string
          qty?: number
          redemption_id?: string
          subtotal_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "redemption_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemption_items_redemption_id_fkey"
            columns: ["redemption_id"]
            isOneToOne: false
            referencedRelation: "redemptions"
            referencedColumns: ["id"]
          },
        ]
      }
      redemptions: {
        Row: {
          actor_id_customer: string | null
          actor_id_specifier: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          copay_total: number
          created_at: string | null
          id: string
          pickup_store: string | null
          shipping_info: Json | null
          status: Database["public"]["Enums"]["redemption_status"]
          total_points: number
          updated_at: string | null
        }
        Insert: {
          actor_id_customer?: string | null
          actor_id_specifier?: string | null
          actor_type: Database["public"]["Enums"]["actor_type"]
          copay_total?: number
          created_at?: string | null
          id?: string
          pickup_store?: string | null
          shipping_info?: Json | null
          status?: Database["public"]["Enums"]["redemption_status"]
          total_points?: number
          updated_at?: string | null
        }
        Update: {
          actor_id_customer?: string | null
          actor_id_specifier?: string | null
          actor_type?: Database["public"]["Enums"]["actor_type"]
          copay_total?: number
          created_at?: string | null
          id?: string
          pickup_store?: string | null
          shipping_info?: Json | null
          status?: Database["public"]["Enums"]["redemption_status"]
          total_points?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "redemptions_actor_id_customer_fkey"
            columns: ["actor_id_customer"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "redemptions_actor_id_specifier_fkey"
            columns: ["actor_id_specifier"]
            isOneToOne: false
            referencedRelation: "specifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      specifiers: {
        Row: {
          created_at: string | null
          doc: string
          email: string | null
          external_ids: Json | null
          id: string
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["specifier_role"]
          specifier_id_ext: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          doc: string
          email?: string | null
          external_ids?: Json | null
          id?: string
          name: string
          phone?: string | null
          role: Database["public"]["Enums"]["specifier_role"]
          specifier_id_ext: string
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          doc?: string
          email?: string | null
          external_ids?: Json | null
          id?: string
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["specifier_role"]
          specifier_id_ext?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          event_id: string
          event_type: string
          execution_id: string | null
          id: string
          payload: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          event_id: string
          event_type: string
          execution_id?: string | null
          id?: string
          payload?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          execution_id?: string | null
          id?: string
          payload?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      validation_errors: {
        Row: {
          created_at: string | null
          entity_type: string
          error_details: string
          error_type: string
          event_id: string
          event_type: string
          id: string
          received_data: Json
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          error_details: string
          error_type: string
          event_id: string
          event_type: string
          id?: string
          received_data: Json
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          error_details?: string
          error_type?: string
          event_id?: string
          event_type?: string
          id?: string
          received_data?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          event_id: string
          id: string
          payload: Json
          processed_at: string | null
          source: Database["public"]["Enums"]["webhook_source"]
        }
        Insert: {
          event_id: string
          id?: string
          payload: Json
          processed_at?: string | null
          source: Database["public"]["Enums"]["webhook_source"]
        }
        Update: {
          event_id?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          source?: Database["public"]["Enums"]["webhook_source"]
        }
        Relationships: []
      }
      whatsapp_notifications: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          invoice_id: string | null
          invoice_id_ext: string | null
          points: number | null
          recipient_id: string | null
          recipient_name: string
          recipient_phone: string
          recipient_type: string
          status: string
          template_name: string
          total_amount: number | null
          whatsapp_message_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          invoice_id_ext?: string | null
          points?: number | null
          recipient_id?: string | null
          recipient_name: string
          recipient_phone: string
          recipient_type: string
          status?: string
          template_name: string
          total_amount?: number | null
          whatsapp_message_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          invoice_id_ext?: string | null
          points?: number | null
          recipient_id?: string | null
          recipient_name?: string
          recipient_phone?: string
          recipient_type?: string
          status?: string
          template_name?: string
          total_amount?: number | null
          whatsapp_message_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clean_phone_number: { Args: { raw_phone: string }; Returns: string }
      get_customer_id: { Args: { _user_id: string }; Returns: string }
      get_invoices_total_amount: {
        Args: { from_date: string; to_date: string }
        Returns: number
      }
      get_sales_by_payment_type: {
        Args: { from_date: string; to_date: string }
        Returns: Json
      }
      get_sales_metrics: {
        Args: { from_date: string; to_date: string }
        Returns: Json
      }
      get_specifier_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      actor_type: "customer" | "specifier"
      app_role: "admin" | "specifier" | "customer"
      invoice_status: "created" | "partially_paid" | "paid" | "canceled"
      ledger_type:
        | "pending_add"
        | "pending_sub"
        | "released_add"
        | "released_sub"
        | "redeem"
        | "refund"
      redemption_status:
        | "requested"
        | "approved"
        | "rejected"
        | "fulfilled"
        | "canceled"
      specifier_role:
        | "pedreiro"
        | "pintor"
        | "eletricista"
        | "encanador"
        | "arquiteto"
        | "profissional"
      webhook_source:
        | "invoice_created"
        | "payment_confirmed"
        | "refund"
        | "cancel"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      actor_type: ["customer", "specifier"],
      app_role: ["admin", "specifier", "customer"],
      invoice_status: ["created", "partially_paid", "paid", "canceled"],
      ledger_type: [
        "pending_add",
        "pending_sub",
        "released_add",
        "released_sub",
        "redeem",
        "refund",
      ],
      redemption_status: [
        "requested",
        "approved",
        "rejected",
        "fulfilled",
        "canceled",
      ],
      specifier_role: [
        "pedreiro",
        "pintor",
        "eletricista",
        "encanador",
        "arquiteto",
        "profissional",
      ],
      webhook_source: [
        "invoice_created",
        "payment_confirmed",
        "refund",
        "cancel",
      ],
    },
  },
} as const
