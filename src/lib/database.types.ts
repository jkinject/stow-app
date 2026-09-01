export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          created_by: string
          household_id: string
          id: string
          name: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          household_id: string
          id?: string
          name: string
          updated_at?: string
          updated_by?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          household_id?: string
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      containers: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          household_id: string
          id: string
          location_id: string
          name: string
          note: string | null
          photo_path: string | null
          qr_token: string
          thumb_path: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          household_id: string
          id?: string
          location_id: string
          name: string
          note?: string | null
          photo_path?: string | null
          qr_token?: string
          thumb_path?: string | null
          updated_at?: string
          updated_by?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          household_id?: string
          id?: string
          location_id?: string
          name?: string
          note?: string | null
          photo_path?: string | null
          qr_token?: string
          thumb_path?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "containers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      device_push_tokens: {
        Row: {
          expo_token: string
          id: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          expo_token: string
          id?: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          expo_token?: string
          id?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          notify_threshold: boolean
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          notify_threshold?: boolean
          role?: string
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          notify_threshold?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string
          dormant_since: string | null
          id: string
          last_seen_at: string
          name: string
          warned_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          dormant_since?: string | null
          id?: string
          last_seen_at?: string
          name: string
          warned_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          dormant_since?: string | null
          id?: string
          last_seen_at?: string
          name?: string
          warned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "households_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          household_id: string
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string
          household_id: string
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          household_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      item_events: {
        Row: {
          actor_id: string | null
          created_at: string
          household_id: string
          id: number
          item_id: string
          payload: Json
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          household_id: string
          id?: number
          item_id: string
          payload?: Json
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          household_id?: string
          id?: number
          item_id?: string
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          category: string | null
          category_id: string | null
          container_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          household_id: string
          id: string
          location_id: string
          name: string
          note: string | null
          photo_path: string | null
          purchase_url: string | null
          quantity: number
          threshold: number | null
          thumb_path: string | null
          unit: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          container_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          household_id: string
          id: string
          location_id: string
          name: string
          note?: string | null
          photo_path?: string | null
          purchase_url?: string | null
          quantity?: number
          threshold?: number | null
          thumb_path?: string | null
          unit?: string | null
          updated_at?: string
          updated_by?: string
        }
        Update: {
          category?: string | null
          category_id?: string | null
          container_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          household_id?: string
          id?: string
          location_id?: string
          name?: string
          note?: string | null
          photo_path?: string | null
          purchase_url?: string | null
          quantity?: number
          threshold?: number | null
          thumb_path?: string | null
          unit?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "container_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          household_id: string
          id: string
          name: string
          note: string | null
          sort_order: number
          updated_at: string
          updated_by: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          household_id: string
          id?: string
          name: string
          note?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          household_id?: string
          id?: string
          name?: string
          note?: string | null
          sort_order?: number
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_log: {
        Row: {
          aborted_reason: string | null
          candidate_count: number
          deleted_count: number | null
          id: number
          job: string
          ran_at: string
        }
        Insert: {
          aborted_reason?: string | null
          candidate_count: number
          deleted_count?: number | null
          id?: number
          job: string
          ran_at?: string
        }
        Update: {
          aborted_reason?: string | null
          candidate_count?: number
          deleted_count?: number | null
          id?: number
          job?: string
          ran_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      shopping_list: {
        Row: {
          added_at: string
          added_reason: string
          household_id: string
          id: string
          item_id: string
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          added_at?: string
          added_reason: string
          household_id: string
          id?: string
          item_id: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          added_at?: string
          added_reason?: string
          household_id?: string
          id?: string
          item_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_gc: {
        Row: {
          household_id: string
          path: string
          queued_at: string
        }
        Insert: {
          household_id: string
          path: string
          queued_at?: string
        }
        Update: {
          household_id?: string
          path?: string
          queued_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      container_summary: {
        Row: {
          household_id: string | null
          id: string | null
          item_count: number | null
          location_id: string | null
          name: string | null
          note: string | null
          photo_path: string | null
          qr_token: string | null
          thumb_path: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          household_id?: string | null
          id?: string | null
          item_count?: never
          location_id?: string | null
          name?: string | null
          note?: string | null
          photo_path?: string | null
          qr_token?: string | null
          thumb_path?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          household_id?: string | null
          id?: string | null
          item_count?: never
          location_id?: string | null
          name?: string | null
          note?: string | null
          photo_path?: string | null
          qr_token?: string | null
          thumb_path?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "containers_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "location_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "containers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      location_summary: {
        Row: {
          container_count: number | null
          household_id: string | null
          id: string | null
          item_count: number | null
          name: string | null
          note: string | null
          sort_order: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          container_count?: never
          household_id?: string | null
          id?: string | null
          item_count?: never
          name?: string | null
          note?: string | null
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          container_count?: never
          household_id?: string | null
          id?: string | null
          item_count?: never
          name?: string | null
          note?: string | null
          sort_order?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invite: {
        Args: { p_code: string }
        Returns: {
          created_at: string
          created_by: string
          dormant_since: string | null
          id: string
          last_seen_at: string
          name: string
          warned_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      account_deletion_blockers: {
        Args: { p_user: string }
        Returns: {
          cnt: number
          col: string
          tbl: string
        }[]
      }
      account_deletion_preview: { Args: never; Returns: Json }
      adjust_item_quantity: {
        Args: { p_delta: number; p_item_id: string }
        Returns: {
          category: string | null
          category_id: string | null
          container_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          household_id: string
          id: string
          location_id: string
          name: string
          note: string | null
          photo_path: string | null
          purchase_url: string | null
          quantity: number
          threshold: number | null
          thumb_path: string | null
          unit: string | null
          updated_at: string
          updated_by: string
        }
        SetofOptions: {
          from: "*"
          to: "items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_maintenance_caller: { Args: never; Returns: undefined }
      create_household: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          created_by: string
          dormant_since: string | null
          id: string
          last_seen_at: string
          name: string
          warned_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_account: { Args: never; Returns: Json }
      delete_dormant_households: { Args: { p_ids: string[] }; Returns: number }
      dormant_households_to_delete: {
        Args: never
        Returns: {
          household_id: string
          paths: string[]
        }[]
      }
      dormant_households_to_warn: {
        Args: never
        Returns: {
          emails: string[]
          household_id: string
          household_name: string
        }[]
      }
      gen_invite_code: { Args: never; Returns: string }
      is_household_member: { Args: { hid: string }; Returns: boolean }
      is_household_owner: { Args: { hid: string }; Returns: boolean }
      mark_dormant_households: { Args: never; Returns: number }
      mark_household_warned: { Args: { p_ids: string[] }; Returns: number }
      purge_expired_soft_deletes: { Args: never; Returns: undefined }
      resolve_shopping_item: {
        Args: { p_id: string; p_new_quantity: number }
        Returns: {
          added_at: string
          added_reason: string
          household_id: string
          id: string
          item_id: string
          resolved_at: string | null
          resolved_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "shopping_list"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rotate_invite: {
        Args: { p_household_id: string }
        Returns: {
          code: string
          created_at: string
          created_by: string
          household_id: string
          id: string
        }
        SetofOptions: {
          from: "*"
          to: "invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_household_lifecycle: { Args: never; Returns: undefined }
      setting_int: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      shares_household_with: { Args: { uid: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sign_item_photos: { Args: { p_paths: string[] }; Returns: string[] }
      touch_household: { Args: { p_household: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

