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
      appointment_external_links: {
        Row: {
          appointment_id: string
          connection_id: string
          created_at: string
          external_event_id: string
          id: string
          last_error: string | null
          last_pushed_at: string | null
          meet_url: string | null
          owner_id: string
          sync_status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          connection_id: string
          created_at?: string
          external_event_id: string
          id?: string
          last_error?: string | null
          last_pushed_at?: string | null
          meet_url?: string | null
          owner_id: string
          sync_status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          connection_id?: string
          created_at?: string
          external_event_id?: string
          id?: string
          last_error?: string | null
          last_pushed_at?: string | null
          meet_url?: string | null
          owner_id?: string
          sync_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_external_links_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_external_links_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "calendar_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_type: string
          attendance_status: string | null
          block_role: string
          client_id: string | null
          clinician_id: string
          created_at: string
          encrypted_payload: Json | null
          ends_at: string
          episode_id: string | null
          id: string
          organization_id: string | null
          owner_id: string
          parent_appointment_id: string | null
          series_id: string | null
          service_id: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          appointment_type?: string
          attendance_status?: string | null
          block_role?: string
          client_id?: string | null
          clinician_id: string
          created_at?: string
          encrypted_payload?: Json | null
          ends_at: string
          episode_id?: string | null
          id?: string
          organization_id?: string | null
          owner_id: string
          parent_appointment_id?: string | null
          series_id?: string | null
          service_id?: string | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          appointment_type?: string
          attendance_status?: string | null
          block_role?: string
          client_id?: string | null
          clinician_id?: string
          created_at?: string
          encrypted_payload?: Json | null
          ends_at?: string
          episode_id?: string | null
          id?: string
          organization_id?: string | null
          owner_id?: string
          parent_appointment_id?: string | null
          series_id?: string | null
          service_id?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_parent_appointment_id_fkey"
            columns: ["parent_appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string
          client_id: string | null
          created_at: string
          encrypted_detail: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string | null
          owner_id: string
          request_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          client_id?: string | null
          created_at?: string
          encrypted_detail?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          owner_id: string
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          client_id?: string | null
          created_at?: string
          encrypted_detail?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          owner_id?: string
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_exceptions: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          kind: string
          organization_id: string | null
          owner_id: string
          reason: string | null
          service_ids: string[] | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          kind: string
          organization_id?: string | null
          owner_id: string
          reason?: string | null
          service_ids?: string[] | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          kind?: string
          organization_id?: string | null
          owner_id?: string
          reason?: string | null
          service_ids?: string[] | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      availability_rules: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          owner_id: string
          service_ids: string[]
          timezone: string
          updated_at: string
          weekly_hours: Json
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          owner_id: string
          service_ids?: string[]
          timezone?: string
          updated_at?: string
          weekly_hours?: Json
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          owner_id?: string
          service_ids?: string[]
          timezone?: string
          updated_at?: string
          weekly_hours?: Json
        }
        Relationships: []
      }
      calendar_connections: {
        Row: {
          account_email: string | null
          create_meet_links: boolean
          created_at: string
          encrypted_credentials: Json | null
          google_calendar_id: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          organization_id: string | null
          owner_id: string
          provider: string
          pull_external_busy: boolean
          pull_external_details: boolean
          push_appointments: boolean
          push_privacy: string
          scopes: string[]
          status: string
          updated_at: string
        }
        Insert: {
          account_email?: string | null
          create_meet_links?: boolean
          created_at?: string
          encrypted_credentials?: Json | null
          google_calendar_id?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          organization_id?: string | null
          owner_id: string
          provider?: string
          pull_external_busy?: boolean
          pull_external_details?: boolean
          push_appointments?: boolean
          push_privacy?: string
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          account_email?: string | null
          create_meet_links?: boolean
          created_at?: string
          encrypted_credentials?: Json | null
          google_calendar_id?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          organization_id?: string | null
          owner_id?: string
          provider?: string
          pull_external_busy?: boolean
          pull_external_details?: boolean
          push_appointments?: boolean
          push_privacy?: string
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      calendar_feed_tokens: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          last_accessed_at: string | null
          organization_id: string | null
          owner_id: string
          privacy_mode: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_accessed_at?: string | null
          organization_id?: string | null
          owner_id: string
          privacy_mode?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_accessed_at?: string | null
          organization_id?: string | null
          owner_id?: string
          privacy_mode?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: []
      }
      client_clinical_profiles: {
        Row: {
          client_id: string
          created_at: string
          encrypted_payload: Json
          organization_id: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          encrypted_payload: Json
          organization_id?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          encrypted_payload?: Json
          organization_id?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_clinical_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_identities: {
        Row: {
          client_id: string
          created_at: string
          encrypted_payload: Json
          organization_id: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          encrypted_payload: Json
          organization_id?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          encrypted_payload?: Json
          organization_id?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_identities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          encrypted_pseudonym: Json | null
          id: string
          organization_id: string | null
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_pseudonym?: Json | null
          id?: string
          organization_id?: string | null
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_pseudonym?: Json | null
          id?: string
          organization_id?: string | null
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          client_id: string
          created_at: string
          encrypted_payload: Json
          id: string
          is_billing_contact: boolean
          is_primary: boolean
          organization_id: string | null
          owner_id: string
          role: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          encrypted_payload: Json
          id?: string
          is_billing_contact?: boolean
          is_primary?: boolean
          organization_id?: string | null
          owner_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          encrypted_payload?: Json
          id?: string
          is_billing_contact?: boolean
          is_primary?: boolean
          organization_id?: string | null
          owner_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      cpd_entries: {
        Row: {
          created_at: string
          encrypted_payload: Json
          id: string
          label: string
          minutes: number
          occurred_on: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_payload: Json
          id?: string
          label: string
          minutes: number
          occurred_on: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_payload?: Json
          id?: string
          label?: string
          minutes?: number
          occurred_on?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      episodes: {
        Row: {
          client_id: string
          created_at: string
          encrypted_payload: Json | null
          end_date: string | null
          episode_number: number
          id: string
          organization_id: string | null
          owner_id: string
          referral_date: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          encrypted_payload?: Json | null
          end_date?: string | null
          episode_number: number
          id?: string
          organization_id?: string | null
          owner_id: string
          referral_date?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          encrypted_payload?: Json | null
          end_date?: string | null
          episode_number?: number
          id?: string
          organization_id?: string | null
          owner_id?: string
          referral_date?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      external_calendar_blocks: {
        Row: {
          busy_status: string
          connection_id: string
          created_at: string
          encrypted_title: Json | null
          ends_at: string
          etag: string | null
          external_event_id: string
          id: string
          is_all_day: boolean
          organization_id: string | null
          owner_id: string
          starts_at: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          busy_status?: string
          connection_id: string
          created_at?: string
          encrypted_title?: Json | null
          ends_at: string
          etag?: string | null
          external_event_id: string
          id?: string
          is_all_day?: boolean
          organization_id?: string | null
          owner_id: string
          starts_at: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          busy_status?: string
          connection_id?: string
          created_at?: string
          encrypted_title?: Json | null
          ends_at?: string
          etag?: string | null
          external_event_id?: string
          id?: string
          is_all_day?: boolean
          organization_id?: string | null
          owner_id?: string
          starts_at?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_calendar_blocks_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "calendar_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      form_definitions: {
        Row: {
          audience: string
          created_at: string
          description: string | null
          id: string
          is_onboarding: boolean
          letterhead_id: string | null
          name: string
          organization_id: string | null
          owner_id: string
          place_on_screener: boolean
          schema: Json
          slug: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          audience?: string
          created_at?: string
          description?: string | null
          id?: string
          is_onboarding?: boolean
          letterhead_id?: string | null
          name: string
          organization_id?: string | null
          owner_id: string
          place_on_screener?: boolean
          schema?: Json
          slug: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          audience?: string
          created_at?: string
          description?: string | null
          id?: string
          is_onboarding?: boolean
          letterhead_id?: string | null
          name?: string
          organization_id?: string | null
          owner_id?: string
          place_on_screener?: boolean
          schema?: Json
          slug?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          access_token: string
          client_id: string | null
          created_at: string
          encrypted_payload: Json
          episode_id: string | null
          form_definition_id: string
          form_version: number
          id: string
          organization_id: string | null
          owner_id: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string
          client_id?: string | null
          created_at?: string
          encrypted_payload: Json
          episode_id?: string | null
          form_definition_id: string
          form_version: number
          id?: string
          organization_id?: string | null
          owner_id: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          client_id?: string | null
          created_at?: string
          encrypted_payload?: Json
          episode_id?: string | null
          form_definition_id?: string
          form_version?: number
          id?: string
          organization_id?: string | null
          owner_id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "form_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          author_id: string
          created_at: string
          encrypted_payload: Json
          entry_date: string
          id: string
          organization_id: string | null
          owner_id: string
          somatic_state: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          created_at?: string
          encrypted_payload: Json
          entry_date: string
          id?: string
          organization_id?: string | null
          owner_id: string
          somatic_state?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          encrypted_payload?: Json
          entry_date?: string
          id?: string
          organization_id?: string | null
          owner_id?: string
          somatic_state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      letters: {
        Row: {
          author_id: string
          client_id: string
          created_at: string
          encrypted_payload: Json
          episode_id: string | null
          id: string
          letter_date: string | null
          organization_id: string | null
          owner_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          client_id: string
          created_at?: string
          encrypted_payload: Json
          episode_id?: string | null
          id?: string
          letter_date?: string | null
          organization_id?: string | null
          owner_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          client_id?: string
          created_at?: string
          encrypted_payload?: Json
          episode_id?: string | null
          id?: string
          letter_date?: string | null
          organization_id?: string | null
          owner_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "letters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      outcome_entries: {
        Row: {
          appointment_id: string | null
          client_id: string
          completion_status: string
          created_at: string
          encrypted_payload: Json
          episode_id: string | null
          id: string
          measure_id: string
          organization_id: string | null
          owner_id: string
          recorded_on: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          client_id: string
          completion_status?: string
          created_at?: string
          encrypted_payload: Json
          episode_id?: string | null
          id?: string
          measure_id: string
          organization_id?: string | null
          owner_id: string
          recorded_on: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          client_id?: string
          completion_status?: string
          created_at?: string
          encrypted_payload?: Json
          episode_id?: string | null
          id?: string
          measure_id?: string
          organization_id?: string | null
          owner_id?: string
          recorded_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcome_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcome_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcome_entries_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcome_entries_measure_id_fkey"
            columns: ["measure_id"]
            isOneToOne: false
            referencedRelation: "outcome_measure_defs"
            referencedColumns: ["id"]
          },
        ]
      }
      outcome_measure_defs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string | null
          owner_id: string
          schema: Json
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string | null
          owner_id: string
          schema?: Json
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string | null
          owner_id?: string
          schema?: Json
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      practice_items: {
        Row: {
          created_at: string
          encrypted_payload: Json | null
          id: string
          kind: string
          name: string
          owner_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_payload?: Json | null
          id?: string
          kind: string
          name: string
          owner_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_payload?: Json | null
          id?: string
          kind?: string
          name?: string
          owner_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "practice_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string | null
          email: string | null
          encrypted_private_key: Json | null
          encrypted_private_key_recovery: Json | null
          id: string
          job_title: string | null
          phone: string | null
          photo_url: string | null
          practice_address_line1: string | null
          practice_address_line2: string | null
          practice_address_line3: string | null
          practice_country: string | null
          practice_logo_url: string | null
          practice_name: string | null
          practice_postcode: string | null
          professional_title: string | null
          public_key: string | null
          registration_number: string | null
          registration_numbers: Json
          timezone: string
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          encrypted_private_key?: Json | null
          encrypted_private_key_recovery?: Json | null
          id: string
          job_title?: string | null
          phone?: string | null
          photo_url?: string | null
          practice_address_line1?: string | null
          practice_address_line2?: string | null
          practice_address_line3?: string | null
          practice_country?: string | null
          practice_logo_url?: string | null
          practice_name?: string | null
          practice_postcode?: string | null
          professional_title?: string | null
          public_key?: string | null
          registration_number?: string | null
          registration_numbers?: Json
          timezone?: string
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          encrypted_private_key?: Json | null
          encrypted_private_key_recovery?: Json | null
          id?: string
          job_title?: string | null
          phone?: string | null
          photo_url?: string | null
          practice_address_line1?: string | null
          practice_address_line2?: string | null
          practice_address_line3?: string | null
          practice_country?: string | null
          practice_logo_url?: string | null
          practice_name?: string | null
          practice_postcode?: string | null
          professional_title?: string | null
          public_key?: string | null
          registration_number?: string | null
          registration_numbers?: Json
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      progress_notes: {
        Row: {
          appointment_id: string | null
          author_id: string
          client_id: string
          created_at: string
          encrypted_payload: Json
          episode_id: string
          id: string
          lock_until: string | null
          note_number: number
          noted_at: string
          organization_id: string | null
          owner_id: string
          session_date: string
          signed_off_at: string | null
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          author_id: string
          client_id: string
          created_at?: string
          encrypted_payload: Json
          episode_id: string
          id?: string
          lock_until?: string | null
          note_number: number
          noted_at?: string
          organization_id?: string | null
          owner_id: string
          session_date: string
          signed_off_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          author_id?: string
          client_id?: string
          created_at?: string
          encrypted_payload?: Json
          episode_id?: string
          id?: string
          lock_until?: string | null
          note_number?: number
          noted_at?: string
          organization_id?: string | null
          owner_id?: string
          session_date?: string
          signed_off_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_notes_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_notes_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_notes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      record_access_keys: {
        Row: {
          created_at: string
          id: string
          record_id: string
          record_table: string
          user_id: string
          wrapped_dek: Json
        }
        Insert: {
          created_at?: string
          id?: string
          record_id: string
          record_table: string
          user_id: string
          wrapped_dek: Json
        }
        Update: {
          created_at?: string
          id?: string
          record_id?: string
          record_table?: string
          user_id?: string
          wrapped_dek?: Json
        }
        Relationships: []
      }
      report_definitions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          key: string
          name: string
          organization_id: string | null
          owner_id: string
          params: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name: string
          organization_id?: string | null
          owner_id: string
          params?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name?: string
          organization_id?: string | null
          owner_id?: string
          params?: Json
          updated_at?: string
        }
        Relationships: []
      }
      report_exports: {
        Row: {
          completed_at: string | null
          created_at: string
          definition_id: string | null
          error_message: string | null
          format: string
          id: string
          organization_id: string | null
          owner_id: string
          params: Json
          report_key: string
          row_count: number | null
          status: string
          storage_path: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          definition_id?: string | null
          error_message?: string | null
          format: string
          id?: string
          organization_id?: string | null
          owner_id: string
          params?: Json
          report_key: string
          row_count?: number | null
          status?: string
          storage_path?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          definition_id?: string | null
          error_message?: string | null
          format?: string
          id?: string
          organization_id?: string | null
          owner_id?: string
          params?: Json
          report_key?: string
          row_count?: number | null
          status?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_exports_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "report_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          author_id: string
          client_id: string
          created_at: string
          encrypted_payload: Json
          episode_id: string | null
          id: string
          organization_id: string | null
          owner_id: string
          report_date: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          client_id: string
          created_at?: string
          encrypted_payload: Json
          episode_id?: string | null
          id?: string
          organization_id?: string | null
          owner_id: string
          report_date?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          client_id?: string
          created_at?: string
          encrypted_payload?: Json
          episode_id?: string | null
          id?: string
          organization_id?: string | null
          owner_id?: string
          report_date?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          buffer_minutes: number
          color: string | null
          create_meet_link: boolean
          created_at: string
          default_duration_minutes: number
          description: string | null
          follow_on_duration_minutes: number | null
          follow_on_service_id: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string | null
          owner_id: string
          service_type: string
          slug: string
          updated_at: string
        }
        Insert: {
          buffer_minutes?: number
          color?: string | null
          create_meet_link?: boolean
          created_at?: string
          default_duration_minutes?: number
          description?: string | null
          follow_on_duration_minutes?: number | null
          follow_on_service_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string | null
          owner_id: string
          service_type?: string
          slug: string
          updated_at?: string
        }
        Update: {
          buffer_minutes?: number
          color?: string | null
          create_meet_link?: boolean
          created_at?: string
          default_duration_minutes?: number
          description?: string | null
          follow_on_duration_minutes?: number | null
          follow_on_service_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string | null
          owner_id?: string
          service_type?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_follow_on_service_id_fkey"
            columns: ["follow_on_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      supervision_entries: {
        Row: {
          created_at: string
          direction: string
          encrypted_payload: Json
          id: string
          label: string
          minutes: number
          occurred_on: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          direction: string
          encrypted_payload: Json
          id?: string
          label: string
          minutes: number
          occurred_on: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          direction?: string
          encrypted_payload?: Json
          id?: string
          label?: string
          minutes?: number
          occurred_on?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          created_at: string
          description: string | null
          encrypted_payload: Json | null
          id: string
          is_active: boolean
          kind: string
          name: string
          organization_id: string | null
          owner_id: string
          schema: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          encrypted_payload?: Json | null
          id?: string
          is_active?: boolean
          kind: string
          name: string
          organization_id?: string | null
          owner_id: string
          schema?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          encrypted_payload?: Json | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          organization_id?: string | null
          owner_id?: string
          schema?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      timeline_events: {
        Row: {
          actor_id: string | null
          client_id: string
          created_at: string
          encrypted_summary: Json | null
          episode_id: string | null
          event_date: string
          event_type: string
          id: string
          occurred_at: string
          organization_id: string | null
          owner_id: string
          ref_id: string | null
          ref_table: string | null
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          client_id: string
          created_at?: string
          encrypted_summary?: Json | null
          episode_id?: string | null
          event_date: string
          event_type: string
          id?: string
          occurred_at?: string
          organization_id?: string | null
          owner_id: string
          ref_id?: string | null
          ref_table?: string | null
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          client_id?: string
          created_at?: string
          encrypted_summary?: Json | null
          episode_id?: string | null
          event_date?: string
          event_type?: string
          id?: string
          occurred_at?: string
          organization_id?: string | null
          owner_id?: string
          ref_id?: string | null
          ref_table?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      working_documents: {
        Row: {
          author_id: string
          client_id: string
          created_at: string
          encrypted_payload: Json
          episode_id: string | null
          id: string
          organization_id: string | null
          owner_id: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          client_id: string
          created_at?: string
          encrypted_payload: Json
          episode_id?: string | null
          id?: string
          organization_id?: string | null
          owner_id: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          client_id?: string
          created_at?: string
          encrypted_payload?: Json
          episode_id?: string | null
          id?: string
          organization_id?: string | null
          owner_id?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "working_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "working_documents_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "working_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          organization_id: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          name: string
          organization_id?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          organization_id?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_tag_links: {
        Row: {
          client_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_placements: {
        Row: {
          client_id: string
          created_at: string
          information: string
          organization_id: string | null
          owner_id: string
          preferred_times: string
          service_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          information?: string
          organization_id?: string | null
          owner_id: string
          preferred_times?: string
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          information?: string
          organization_id?: string | null
          owner_id?: string
          preferred_times?: string
          service_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_uid: { Args: never; Returns: string }
      form_link_open: { Args: { token: string }; Returns: Json }
      form_link_save: { Args: { token: string; answers: Json }; Returns: undefined }
      form_link_submit: { Args: { token: string }; Returns: Json }
      form_public_start: { Args: { form_id: string }; Returns: string }
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
    Enums: {},
  },
} as const
