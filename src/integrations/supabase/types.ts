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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      active_sessions: {
        Row: {
          ip: string | null
          session_id: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          ip?: string | null
          session_id: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          ip?: string | null
          session_id?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ad_spots: {
        Row: {
          buttons: Json
          created_at: string
          front_image: string | null
          id: string
          images: Json
          is_active: boolean
          is_for_sale: boolean
          long_description: string
          owner_user_id: string | null
          short_description: string
          slot_number: number
          title: string
          updated_at: string
        }
        Insert: {
          buttons?: Json
          created_at?: string
          front_image?: string | null
          id?: string
          images?: Json
          is_active?: boolean
          is_for_sale?: boolean
          long_description?: string
          owner_user_id?: string | null
          short_description?: string
          slot_number: number
          title?: string
          updated_at?: string
        }
        Update: {
          buttons?: Json
          created_at?: string
          front_image?: string | null
          id?: string
          images?: Json
          is_active?: boolean
          is_for_sale?: boolean
          long_description?: string
          owner_user_id?: string | null
          short_description?: string
          slot_number?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          device_id: string | null
          id: string
          ip: string | null
          metadata: Json
          operator_id: string | null
          session_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          device_id?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          operator_id?: string | null
          session_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          device_id?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          operator_id?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bio_links: {
        Row: {
          clicks: number
          created_at: string
          icon: string | null
          id: string
          position: number
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          icon?: string | null
          id?: string
          position?: number
          title: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          clicks?: number
          created_at?: string
          icon?: string | null
          id?: string
          position?: number
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      build_server_config: {
        Row: {
          buildserver_url: string | null
          created_at: string
          id: string
          key: string
          label: string
          last_seen_at: string | null
        }
        Insert: {
          buildserver_url?: string | null
          created_at?: string
          id?: string
          key: string
          label?: string
          last_seen_at?: string | null
        }
        Update: {
          buildserver_url?: string | null
          created_at?: string
          id?: string
          key?: string
          label?: string
          last_seen_at?: string | null
        }
        Relationships: []
      }
      builds: {
        Row: {
          antikill: boolean
          completed_at: string | null
          created_at: string
          debug: boolean
          download_url: string | null
          error: string | null
          features: Json | null
          fun_features: boolean
          icon_url: string | null
          id: string
          name: string
          output_kind: string
          platform: string
          progress: number
          relay_url: string | null
          require_admin: boolean
          startup: boolean
          startup_name: string | null
          status: string
          tag: string | null
          target_server_url: string | null
          user_id: string
          wd_exclusion: boolean
        }
        Insert: {
          antikill?: boolean
          completed_at?: string | null
          created_at?: string
          debug?: boolean
          download_url?: string | null
          error?: string | null
          features?: Json | null
          fun_features?: boolean
          icon_url?: string | null
          id?: string
          name: string
          output_kind?: string
          platform?: string
          progress?: number
          relay_url?: string | null
          require_admin?: boolean
          startup?: boolean
          startup_name?: string | null
          status?: string
          tag?: string | null
          target_server_url?: string | null
          user_id: string
          wd_exclusion?: boolean
        }
        Update: {
          antikill?: boolean
          completed_at?: string | null
          created_at?: string
          debug?: boolean
          download_url?: string | null
          error?: string | null
          features?: Json | null
          fun_features?: boolean
          icon_url?: string | null
          id?: string
          name?: string
          output_kind?: string
          platform?: string
          progress?: number
          relay_url?: string | null
          require_admin?: boolean
          startup?: boolean
          startup_name?: string | null
          status?: string
          tag?: string | null
          target_server_url?: string | null
          user_id?: string
          wd_exclusion?: boolean
        }
        Relationships: []
      }
      client_shares: {
        Row: {
          created_at: string
          device_id: string
          dm_id: string | null
          flow: string
          host_user_id: string
          id: string
          initiator_id: string
          responded_at: string | null
          shared_with_user_id: string
          status: string
        }
        Insert: {
          created_at?: string
          device_id: string
          dm_id?: string | null
          flow: string
          host_user_id: string
          id?: string
          initiator_id: string
          responded_at?: string | null
          shared_with_user_id: string
          status?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          dm_id?: string | null
          flow?: string
          host_user_id?: string
          id?: string
          initiator_id?: string
          responded_at?: string | null
          shared_with_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_shares_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      code_redemptions: {
        Row: {
          code: string
          days_awarded: number
          id: string
          redeemed_at: string
          user_id: string
        }
        Insert: {
          code: string
          days_awarded: number
          id?: string
          redeemed_at?: string
          user_id: string
        }
        Update: {
          code?: string
          days_awarded?: number
          id?: string
          redeemed_at?: string
          user_id?: string
        }
        Relationships: []
      }
      command_results: {
        Row: {
          command_id: string
          created_at: string
          device_id: string
          id: string
          result: Json | null
        }
        Insert: {
          command_id: string
          created_at?: string
          device_id: string
          id?: string
          result?: Json | null
        }
        Update: {
          command_id?: string
          created_at?: string
          device_id?: string
          id?: string
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "command_results_command_id_fkey"
            columns: ["command_id"]
            isOneToOne: false
            referencedRelation: "commands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "command_results_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      commands: {
        Row: {
          action: string
          completed_at: string | null
          created_at: string
          device_id: string
          error: string | null
          id: string
          payload: Json
          result: Json | null
          started_at: string | null
          status: string
        }
        Insert: {
          action: string
          completed_at?: string | null
          created_at?: string
          device_id: string
          error?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          started_at?: string | null
          status?: string
        }
        Update: {
          action?: string
          completed_at?: string | null
          created_at?: string
          device_id?: string
          error?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          body: string | null
          channel: string
          created_at: string
          id: string
          image_url: string | null
          kind: string | null
        }
        Insert: {
          author_id: string
          body?: string | null
          channel: string
          created_at?: string
          id?: string
          image_url?: string | null
          kind?: string | null
        }
        Update: {
          author_id?: string
          body?: string | null
          channel?: string
          created_at?: string
          id?: string
          image_url?: string | null
          kind?: string | null
        }
        Relationships: []
      }
      device_access: {
        Row: {
          created_at: string
          device_id: string
          granted_by: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          granted_by?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          granted_by?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_access_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_metrics: {
        Row: {
          cpu_percent: number | null
          device_id: string
          gpu_info: string | null
          gpu_percent: number | null
          id: string
          network_rx_kbps: number | null
          network_tx_kbps: number | null
          ram_percent: number | null
          ram_total_mb: number | null
          ram_used_mb: number | null
          recorded_at: string
          uptime_seconds: number | null
        }
        Insert: {
          cpu_percent?: number | null
          device_id: string
          gpu_info?: string | null
          gpu_percent?: number | null
          id?: string
          network_rx_kbps?: number | null
          network_tx_kbps?: number | null
          ram_percent?: number | null
          ram_total_mb?: number | null
          ram_used_mb?: number | null
          recorded_at?: string
          uptime_seconds?: number | null
        }
        Update: {
          cpu_percent?: number | null
          device_id?: string
          gpu_info?: string | null
          gpu_percent?: number | null
          id?: string
          network_rx_kbps?: number | null
          network_tx_kbps?: number | null
          ram_percent?: number | null
          ram_total_mb?: number | null
          ram_used_mb?: number | null
          recorded_at?: string
          uptime_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "device_metrics_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_permissions: {
        Row: {
          camera: boolean
          device_id: string
          file_access: boolean
          remote_shell: boolean
          screen_view: boolean
          updated_at: string
        }
        Insert: {
          camera?: boolean
          device_id: string
          file_access?: boolean
          remote_shell?: boolean
          screen_view?: boolean
          updated_at?: string
        }
        Update: {
          camera?: boolean
          device_id?: string
          file_access?: boolean
          remote_shell?: boolean
          screen_view?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_permissions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: true
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          capabilities: Json | null
          created_at: string
          device_name: string
          device_token_hash: string | null
          enrollment_code: string | null
          id: string
          ip_address: string
          is_online: boolean
          last_camera_at: string | null
          last_camera_b64: string | null
          last_screen_at: string | null
          last_screen_b64: string | null
          last_seen: string
          last_seen_ip: string | null
          os: string | null
          owner_user_id: string | null
          pc_name: string
          pending_commands: Json
          platform: string
          tag: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          capabilities?: Json | null
          created_at?: string
          device_name: string
          device_token_hash?: string | null
          enrollment_code?: string | null
          id?: string
          ip_address?: string
          is_online?: boolean
          last_camera_at?: string | null
          last_camera_b64?: string | null
          last_screen_at?: string | null
          last_screen_b64?: string | null
          last_seen?: string
          last_seen_ip?: string | null
          os?: string | null
          owner_user_id?: string | null
          pc_name: string
          pending_commands?: Json
          platform?: string
          tag?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          capabilities?: Json | null
          created_at?: string
          device_name?: string
          device_token_hash?: string | null
          enrollment_code?: string | null
          id?: string
          ip_address?: string
          is_online?: boolean
          last_camera_at?: string | null
          last_camera_b64?: string | null
          last_screen_at?: string | null
          last_screen_b64?: string | null
          last_seen?: string
          last_seen_ip?: string | null
          os?: string | null
          owner_user_id?: string | null
          pc_name?: string
          pending_commands?: Json
          platform?: string
          tag?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          body: string | null
          conversation_key: string
          created_at: string
          id: string
          image_url: string | null
          kind: string
          payload: Json
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          body?: string | null
          conversation_key: string
          created_at?: string
          id?: string
          image_url?: string | null
          kind?: string
          payload?: Json
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          body?: string | null
          conversation_key?: string
          created_at?: string
          id?: string
          image_url?: string | null
          kind?: string
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      free_claims: {
        Row: {
          claimed_at: string
          id: string
          user_id: string
        }
        Insert: {
          claimed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          claimed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          title: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          ban_reason: string | null
          bio: string | null
          bio_public: boolean
          bio_theme: string
          created_at: string
          discord_id: string | null
          discord_rpc_enabled: boolean
          discord_status_enabled: boolean
          discord_username: string | null
          display_name: string | null
          email: string | null
          full_name: string | null
          id: string
          is_banned: boolean
          is_removed: boolean
          language: string
          profile_completed: boolean
          public_key: string | null
          recovery_token_hash: string | null
          recovery_token_set_at: string | null
          referral_code: string | null
          referred_by: string | null
          socials: Json
          theme: string
          totp_enabled: boolean
          totp_secret: string | null
          updated_at: string
          user_number: number | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          ban_reason?: string | null
          bio?: string | null
          bio_public?: boolean
          bio_theme?: string
          created_at?: string
          discord_id?: string | null
          discord_rpc_enabled?: boolean
          discord_status_enabled?: boolean
          discord_username?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_banned?: boolean
          is_removed?: boolean
          language?: string
          profile_completed?: boolean
          public_key?: string | null
          recovery_token_hash?: string | null
          recovery_token_set_at?: string | null
          referral_code?: string | null
          referred_by?: string | null
          socials?: Json
          theme?: string
          totp_enabled?: boolean
          totp_secret?: string | null
          updated_at?: string
          user_number?: number | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          ban_reason?: string | null
          bio?: string | null
          bio_public?: boolean
          bio_theme?: string
          created_at?: string
          discord_id?: string | null
          discord_rpc_enabled?: boolean
          discord_status_enabled?: boolean
          discord_username?: string | null
          display_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_banned?: boolean
          is_removed?: boolean
          language?: string
          profile_completed?: boolean
          public_key?: string | null
          recovery_token_hash?: string | null
          recovery_token_set_at?: string | null
          referral_code?: string | null
          referred_by?: string | null
          socials?: Json
          theme?: string
          totp_enabled?: boolean
          totp_secret?: string | null
          updated_at?: string
          user_number?: number | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          activated_at: string | null
          bonus_days_awarded: number
          created_at: string
          id: string
          milestone_awarded: boolean
          referee_id: string
          referrer_id: string
        }
        Insert: {
          activated_at?: string | null
          bonus_days_awarded?: number
          created_at?: string
          id?: string
          milestone_awarded?: boolean
          referee_id: string
          referrer_id: string
        }
        Update: {
          activated_at?: string | null
          bonus_days_awarded?: number
          created_at?: string
          id?: string
          milestone_awarded?: boolean
          referee_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      server_endpoints: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          kind: string
          label: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind: string
          label?: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          kind?: string
          label?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          client_ip: string | null
          device_id: string
          end_reason: string | null
          ended_at: string | null
          id: string
          operator_id: string
          permissions: Json
          started_at: string
        }
        Insert: {
          client_ip?: string | null
          device_id: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          operator_id: string
          permissions?: Json
          started_at?: string
        }
        Update: {
          client_ip?: string | null
          device_id?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          operator_id?: string
          permissions?: Json
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_usd: number | null
          created_at: string
          currency: string | null
          eth_amount: number | null
          expires_at: string | null
          id: string
          plan: string
          provider: string
          provider_payment_id: string | null
          sender_address: string | null
          started_at: string | null
          status: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          amount_usd?: number | null
          created_at?: string
          currency?: string | null
          eth_amount?: number | null
          expires_at?: string | null
          id?: string
          plan: string
          provider?: string
          provider_payment_id?: string | null
          sender_address?: string | null
          started_at?: string | null
          status?: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          amount_usd?: number | null
          created_at?: string
          currency?: string | null
          eth_amount?: number | null
          expires_at?: string | null
          id?: string
          plan?: string
          provider?: string
          provider_payment_id?: string | null
          sender_address?: string | null
          started_at?: string | null
          status?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          body: string | null
          created_at: string
          id: string
          image_url: string | null
          sender_id: string
          ticket_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          sender_id: string
          ticket_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          claimed_by: string | null
          closed_at: string | null
          created_at: string
          id: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          claimed_by?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          claimed_by?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      turn_servers: {
        Row: {
          created_at: string
          credential: string | null
          enabled: boolean
          id: string
          label: string
          updated_at: string
          url: string
          username: string | null
        }
        Insert: {
          created_at?: string
          credential?: string | null
          enabled?: boolean
          id?: string
          label?: string
          updated_at?: string
          url: string
          username?: string | null
        }
        Update: {
          created_at?: string
          credential?: string | null
          enabled?: boolean
          id?: string
          label?: string
          updated_at?: string
          url?: string
          username?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_subscription: {
        Args: { _days: number; _target_user: string }
        Returns: undefined
      }
      admin_ban_user: { Args: { _target_user: string }; Returns: undefined }
      claim_secret_pumpkin: { Args: never; Returns: Json }
      claim_veltrix_code: { Args: { _code: string }; Returns: Json }
      consume_recovery_code: {
        Args: { _code_hash: string; _user_id: string }
        Returns: boolean
      }
      device_is_live: { Args: { _last_seen: string }; Returns: boolean }
      extend_subscription: {
        Args: { _days: number; _user_id: string }
        Returns: undefined
      }
      has_device_access: {
        Args: { _device_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_device_owner: {
        Args: { _device_id: string; _user_id: string }
        Returns: boolean
      }
      is_user_banned: { Args: { _user_id: string }; Returns: boolean }
      respond_to_share: {
        Args: { _accept: boolean; _share_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "operator" | "viewer" | "helper"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "operator", "viewer", "helper"],
    },
  },
} as const
