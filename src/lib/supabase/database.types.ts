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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          field: string | null
          file_name: string
          id: string
          mime_type: string | null
          provider: string
          provider_path: string
          record_id: number
          size_bytes: number | null
          sort_order: number
          table_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          field?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          provider?: string
          provider_path: string
          record_id: number
          size_bytes?: number | null
          sort_order?: number
          table_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          field?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          provider?: string
          provider_path?: string
          record_id?: number
          size_bytes?: number | null
          sort_order?: number
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          changes: Json
          id: number
          record_id: number
          table_name: string
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          changes?: Json
          id?: number
          record_id: number
          table_name: string
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          changes?: Json
          id?: number
          record_id?: number
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: number
          locked: boolean
          name: string | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          name?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          name?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          address: Json | null
          admin_email: string | null
          admin_name: string | null
          admin_phone: string | null
          archived_at: string | null
          coi_expiration: string | null
          coi_status: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          details: string | null
          front_desk_contact: string | null
          front_desk_email: string | null
          front_desk_phone: string | null
          id: number
          locked: boolean
          receiving_agent: string | null
          receiving_email: string | null
          receiving_phone: string | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
          work_hours: string | null
        }
        Insert: {
          address?: Json | null
          admin_email?: string | null
          admin_name?: string | null
          admin_phone?: string | null
          archived_at?: string | null
          coi_expiration?: string | null
          coi_status?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          details?: string | null
          front_desk_contact?: string | null
          front_desk_email?: string | null
          front_desk_phone?: string | null
          id?: number
          locked?: boolean
          receiving_agent?: string | null
          receiving_email?: string | null
          receiving_phone?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          work_hours?: string | null
        }
        Update: {
          address?: Json | null
          admin_email?: string | null
          admin_name?: string | null
          admin_phone?: string | null
          archived_at?: string | null
          coi_expiration?: string | null
          coi_status?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          details?: string | null
          front_desk_contact?: string | null
          front_desk_email?: string | null
          front_desk_phone?: string | null
          id?: number
          locked?: boolean
          receiving_agent?: string | null
          receiving_email?: string | null
          receiving_phone?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          work_hours?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buildings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buildings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_interactions: {
        Row: {
          archived_at: string | null
          contact_id: number
          created_at: string
          created_by: string | null
          date: string | null
          deleted_at: string | null
          follow_up_date: string | null
          id: number
          locked: boolean
          result: string | null
          submitted_at: string | null
          title: string | null
          type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          contact_id: number
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          follow_up_date?: string | null
          id?: number
          locked?: boolean
          result?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          contact_id?: number
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          follow_up_date?: string | null
          id?: number
          locked?: boolean
          result?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_interactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_interactions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: Json | null
          alias_dba: string | null
          alternate_email: string | null
          alternate_intl_phone: string | null
          alternate_name: string | null
          alternate_phone: string | null
          alternate_role_title: string | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          has_alternate_contact: boolean
          id: number
          intl_phone: string | null
          last_name: string | null
          locked: boolean
          main_phone: string | null
          notes: string | null
          organization_id: number | null
          phone_extension: string | null
          preferred_language: string | null
          referred_by_contact_id: number | null
          referred_by_employee_id: number | null
          referred_by_organization_id: number | null
          role_position: string | null
          submitted_at: string | null
          title: string | null
          type: string | null
          updated_at: string
          updated_by: string | null
          was_referred: boolean
        }
        Insert: {
          address?: Json | null
          alias_dba?: string | null
          alternate_email?: string | null
          alternate_intl_phone?: string | null
          alternate_name?: string | null
          alternate_phone?: string | null
          alternate_role_title?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          has_alternate_contact?: boolean
          id?: number
          intl_phone?: string | null
          last_name?: string | null
          locked?: boolean
          main_phone?: string | null
          notes?: string | null
          organization_id?: number | null
          phone_extension?: string | null
          preferred_language?: string | null
          referred_by_contact_id?: number | null
          referred_by_employee_id?: number | null
          referred_by_organization_id?: number | null
          role_position?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
          was_referred?: boolean
        }
        Update: {
          address?: Json | null
          alias_dba?: string | null
          alternate_email?: string | null
          alternate_intl_phone?: string | null
          alternate_name?: string | null
          alternate_phone?: string | null
          alternate_role_title?: string | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          has_alternate_contact?: boolean
          id?: number
          intl_phone?: string | null
          last_name?: string | null
          locked?: boolean
          main_phone?: string | null
          notes?: string | null
          organization_id?: number | null
          phone_extension?: string | null
          preferred_language?: string | null
          referred_by_contact_id?: number | null
          referred_by_employee_id?: number | null
          referred_by_organization_id?: number | null
          role_position?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
          was_referred?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_referred_by_contact_id_fkey"
            columns: ["referred_by_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_referred_by_employee_id_fkey"
            columns: ["referred_by_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_referred_by_organization_id_fkey"
            columns: ["referred_by_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          archived_at: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          departments: string[]
          dl_expiration: string | null
          dl_status: string | null
          ein: string | null
          email: string | null
          employment_type: string | null
          first_name: string | null
          home_address: Json | null
          id: number
          last_name: string | null
          locked: boolean
          phone: string | null
          ssn: string | null
          start_date: string | null
          status: string | null
          submitted_at: string | null
          termination_date: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
          workers_comp_expiration: string | null
        }
        Insert: {
          archived_at?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          departments?: string[]
          dl_expiration?: string | null
          dl_status?: string | null
          ein?: string | null
          email?: string | null
          employment_type?: string | null
          first_name?: string | null
          home_address?: Json | null
          id?: number
          last_name?: string | null
          locked?: boolean
          phone?: string | null
          ssn?: string | null
          start_date?: string | null
          status?: string | null
          submitted_at?: string | null
          termination_date?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          workers_comp_expiration?: string | null
        }
        Update: {
          archived_at?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          departments?: string[]
          dl_expiration?: string | null
          dl_status?: string | null
          ein?: string | null
          email?: string | null
          employment_type?: string | null
          first_name?: string | null
          home_address?: Json | null
          id?: number
          last_name?: string | null
          locked?: boolean
          phone?: string | null
          ssn?: string | null
          start_date?: string | null
          status?: string | null
          submitted_at?: string | null
          termination_date?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          workers_comp_expiration?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      form_notes: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: number
          locked: boolean
          note_type: string | null
          project_id: number | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: number
          locked?: boolean
          note_type?: string | null
          project_id?: number | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: number
          locked?: boolean
          note_type?: string | null
          project_id?: number | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_permissions: {
        Row: {
          group_id: number
          permission_key: string
        }
        Insert: {
          group_id: number
          permission_key: string
        }
        Update: {
          group_id?: number
          permission_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_permissions_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      groups: {
        Row: {
          active: boolean
          created_at: string
          id: number
          is_system: boolean
          legacy_code: string | null
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: number
          is_system?: boolean
          legacy_code?: string | null
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: number
          is_system?: boolean
          legacy_code?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      inventory_checkouts: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          date: string | null
          deleted_at: string | null
          equipment: string | null
          id: number
          locked: boolean
          project_id: number | null
          submitted_at: string | null
          technician_id: number | null
          title: string | null
          type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          equipment?: string | null
          id?: number
          locked?: boolean
          project_id?: number | null
          submitted_at?: string | null
          technician_id?: number | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          equipment?: string | null
          id?: number
          locked?: boolean
          project_id?: number | null
          submitted_at?: string | null
          technician_id?: number | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_checkouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_checkouts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_checkouts_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_checkouts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_reports: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          date: string | null
          deleted_at: string | null
          id: number
          locked: boolean
          logins_and_passwords: string | null
          maintenance_plan_service_call: boolean
          pending_1: string | null
          pending_2: string | null
          pending_3: string | null
          pending_4: string | null
          pending_5: string | null
          project_id: number | null
          report: string | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
          vehicle_id: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          logins_and_passwords?: string | null
          maintenance_plan_service_call?: boolean
          pending_1?: string | null
          pending_2?: string | null
          pending_3?: string | null
          pending_4?: string | null
          pending_5?: string | null
          project_id?: number | null
          report?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          logins_and_passwords?: string | null
          maintenance_plan_service_call?: boolean
          pending_1?: string | null
          pending_2?: string | null
          pending_3?: string | null
          pending_4?: string | null
          pending_5?: string | null
          project_id?: number | null
          report?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          vehicle_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reports_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reports_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_reports_tagged: {
        Row: {
          created_at: string
          record_id: number
          target_id: number
        }
        Insert: {
          created_at?: string
          record_id: number
          target_id: number
        }
        Update: {
          created_at?: string
          record_id?: number
          target_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_reports_tagged_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "job_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reports_tagged_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      job_reports_team: {
        Row: {
          created_at: string
          record_id: number
          target_id: number
        }
        Insert: {
          created_at?: string
          record_id: number
          target_id: number
        }
        Update: {
          created_at?: string
          record_id?: number
          target_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_reports_team_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "job_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_reports_team_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          archived_at: string | null
          category_id: number | null
          content: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: number
          locked: boolean
          status: string | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
          updated_on: string | null
          video_link: string | null
          view_count: number | null
        }
        Insert: {
          archived_at?: string | null
          category_id?: number | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_on?: string | null
          video_link?: string | null
          view_count?: number | null
        }
        Update: {
          archived_at?: string | null
          category_id?: number | null
          content?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          updated_on?: string | null
          video_link?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "kb_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_articles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles_audience_group: {
        Row: {
          created_at: string
          record_id: number
          target_id: number
        }
        Insert: {
          created_at?: string
          record_id: number
          target_id: number
        }
        Update: {
          created_at?: string
          record_id?: number
          target_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "kb_articles_audience_group_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "kb_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_articles_audience_group_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_categories: {
        Row: {
          active: boolean
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          icon_class: string | null
          id: number
          locked: boolean
          sort_order: number | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          icon_class?: string | null
          id?: number
          locked?: boolean
          sort_order?: number | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          icon_class?: string | null
          id?: number
          locked?: boolean
          sort_order?: number | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: Json | null
          archived_at: string | null
          coi_expiration: string | null
          created_at: string
          created_by: string | null
          dba_or_legal_name: string | null
          dealer_number: string | null
          default_commission_markup: string | null
          deleted_at: string | null
          details: string | null
          id: number
          locked: boolean
          main_email: string | null
          main_phone: string | null
          portal_login: string | null
          portal_password: string | null
          submitted_at: string | null
          tax_exempt: boolean
          title: string | null
          type: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address?: Json | null
          archived_at?: string | null
          coi_expiration?: string | null
          created_at?: string
          created_by?: string | null
          dba_or_legal_name?: string | null
          dealer_number?: string | null
          default_commission_markup?: string | null
          deleted_at?: string | null
          details?: string | null
          id?: number
          locked?: boolean
          main_email?: string | null
          main_phone?: string | null
          portal_login?: string | null
          portal_password?: string | null
          submitted_at?: string | null
          tax_exempt?: boolean
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address?: Json | null
          archived_at?: string | null
          coi_expiration?: string | null
          created_at?: string
          created_by?: string | null
          dba_or_legal_name?: string | null
          dealer_number?: string | null
          default_commission_markup?: string | null
          deleted_at?: string | null
          details?: string | null
          id?: number
          locked?: boolean
          main_email?: string | null
          main_phone?: string | null
          portal_login?: string | null
          portal_password?: string | null
          submitted_at?: string | null
          tax_exempt?: boolean
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number | null
          archived_at: string | null
          check_number: number | null
          created_at: string
          created_by: string | null
          date_issued: string | null
          deleted_at: string | null
          details: string | null
          employee_id: number | null
          id: number
          locked: boolean
          payment_method: string | null
          reason: string | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number | null
          archived_at?: string | null
          check_number?: number | null
          created_at?: string
          created_by?: string | null
          date_issued?: string | null
          deleted_at?: string | null
          details?: string | null
          employee_id?: number | null
          id?: number
          locked?: boolean
          payment_method?: string | null
          reason?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number | null
          archived_at?: string | null
          check_number?: number | null
          created_at?: string
          created_by?: string | null
          date_issued?: string | null
          deleted_at?: string | null
          details?: string | null
          employee_id?: number | null
          id?: number
          locked?: boolean
          payment_method?: string | null
          reason?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          area: string
          description: string
          key: string
          kind: string
          label: string
          module: string
          resource: string
        }
        Insert: {
          action: string
          area: string
          description?: string
          key: string
          kind: string
          label: string
          module: string
          resource: string
        }
        Update: {
          action?: string
          area?: string
          description?: string
          key?: string
          kind?: string
          label?: string
          module?: string
          resource?: string
        }
        Relationships: []
      }
      permits: {
        Row: {
          address: Json | null
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          el_permit_number: string | null
          expiration_date: string | null
          expiration_status: string | null
          id: number
          locked: boolean
          master_permit_number: string | null
          municipality_id: number | null
          notes: string | null
          owner_contact_id: number | null
          owner_phone: string | null
          project_id: number | null
          status: string | null
          submitted_at: string | null
          title: string | null
          type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: Json | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          el_permit_number?: string | null
          expiration_date?: string | null
          expiration_status?: string | null
          id?: number
          locked?: boolean
          master_permit_number?: string | null
          municipality_id?: number | null
          notes?: string | null
          owner_contact_id?: number | null
          owner_phone?: string | null
          project_id?: number | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: Json | null
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          el_permit_number?: string | null
          expiration_date?: string | null
          expiration_status?: string | null
          id?: number
          locked?: boolean
          master_permit_number?: string | null
          municipality_id?: number | null
          notes?: string | null
          owner_contact_id?: number | null
          owner_phone?: string | null
          project_id?: number | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permits_municipality_id_fkey"
            columns: ["municipality_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permits_owner_contact_id_fkey"
            columns: ["owner_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permits_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          brand_id: number | null
          cost: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: number
          location: string | null
          locked: boolean
          model: string | null
          product_type: string | null
          sell_price: number | null
          sku: string | null
          submitted_at: string | null
          supplier_id: number | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_id?: number | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          location?: string | null
          locked?: boolean
          model?: string | null
          product_type?: string | null
          sell_price?: number | null
          sku?: string | null
          submitted_at?: string | null
          supplier_id?: number | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_id?: number | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          location?: string | null
          locked?: boolean
          model?: string | null
          product_type?: string | null
          sell_price?: number | null
          sku?: string | null
          submitted_at?: string | null
          supplier_id?: number | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          apartment_or_unit: string | null
          archived_at: string | null
          builder_developer_id: number | null
          builder_developer_notes: string | null
          building_id: number | null
          category: string | null
          commission_notes: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          design_firm_id: number | null
          designer_notes: string | null
          door_gate_code: string | null
          financial_status: string | null
          gc_pm_id: number | null
          general_contractor_id: number | null
          general_contractor_notes: string | null
          has_builder_developer: boolean
          has_designer: boolean
          has_general_contractor: boolean
          has_permit: boolean
          id: number
          in_building: boolean
          job_address: Json | null
          job_owner_id: number | null
          job_status: string | null
          lead_designer_id: number | null
          list_items: string | null
          locked: boolean
          maintenance_amount: number | null
          maintenance_history: string | null
          maintenance_plan: boolean
          maintenance_purchase_date: string | null
          maintenance_sales_person_id: number | null
          maintenance_status: string | null
          maintenance_type: string | null
          older_reports: string | null
          owner_contact: string | null
          owner_contact_intl: string | null
          permit_id: number | null
          plans: string | null
          referral_contact_id: number | null
          referral_organization_id: number | null
          referral_type: string | null
          special_orders: boolean
          start_date: string | null
          submitted_at: string | null
          survey_videos_links: string | null
          system_credentials: string | null
          systems: string[]
          title: string | null
          type: string | null
          updated_at: string
          updated_by: string | null
          warranty: boolean
        }
        Insert: {
          apartment_or_unit?: string | null
          archived_at?: string | null
          builder_developer_id?: number | null
          builder_developer_notes?: string | null
          building_id?: number | null
          category?: string | null
          commission_notes?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          design_firm_id?: number | null
          designer_notes?: string | null
          door_gate_code?: string | null
          financial_status?: string | null
          gc_pm_id?: number | null
          general_contractor_id?: number | null
          general_contractor_notes?: string | null
          has_builder_developer?: boolean
          has_designer?: boolean
          has_general_contractor?: boolean
          has_permit?: boolean
          id?: number
          in_building?: boolean
          job_address?: Json | null
          job_owner_id?: number | null
          job_status?: string | null
          lead_designer_id?: number | null
          list_items?: string | null
          locked?: boolean
          maintenance_amount?: number | null
          maintenance_history?: string | null
          maintenance_plan?: boolean
          maintenance_purchase_date?: string | null
          maintenance_sales_person_id?: number | null
          maintenance_status?: string | null
          maintenance_type?: string | null
          older_reports?: string | null
          owner_contact?: string | null
          owner_contact_intl?: string | null
          permit_id?: number | null
          plans?: string | null
          referral_contact_id?: number | null
          referral_organization_id?: number | null
          referral_type?: string | null
          special_orders?: boolean
          start_date?: string | null
          submitted_at?: string | null
          survey_videos_links?: string | null
          system_credentials?: string | null
          systems?: string[]
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
          warranty?: boolean
        }
        Update: {
          apartment_or_unit?: string | null
          archived_at?: string | null
          builder_developer_id?: number | null
          builder_developer_notes?: string | null
          building_id?: number | null
          category?: string | null
          commission_notes?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          design_firm_id?: number | null
          designer_notes?: string | null
          door_gate_code?: string | null
          financial_status?: string | null
          gc_pm_id?: number | null
          general_contractor_id?: number | null
          general_contractor_notes?: string | null
          has_builder_developer?: boolean
          has_designer?: boolean
          has_general_contractor?: boolean
          has_permit?: boolean
          id?: number
          in_building?: boolean
          job_address?: Json | null
          job_owner_id?: number | null
          job_status?: string | null
          lead_designer_id?: number | null
          list_items?: string | null
          locked?: boolean
          maintenance_amount?: number | null
          maintenance_history?: string | null
          maintenance_plan?: boolean
          maintenance_purchase_date?: string | null
          maintenance_sales_person_id?: number | null
          maintenance_status?: string | null
          maintenance_type?: string | null
          older_reports?: string | null
          owner_contact?: string | null
          owner_contact_intl?: string | null
          permit_id?: number | null
          plans?: string | null
          referral_contact_id?: number | null
          referral_organization_id?: number | null
          referral_type?: string | null
          special_orders?: boolean
          start_date?: string | null
          submitted_at?: string | null
          survey_videos_links?: string | null
          system_credentials?: string | null
          systems?: string[]
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
          warranty?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "projects_builder_developer_id_fkey"
            columns: ["builder_developer_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_design_firm_id_fkey"
            columns: ["design_firm_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_gc_pm_id_fkey"
            columns: ["gc_pm_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_general_contractor_id_fkey"
            columns: ["general_contractor_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_job_owner_id_fkey"
            columns: ["job_owner_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_lead_designer_id_fkey"
            columns: ["lead_designer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_maintenance_sales_person_id_fkey"
            columns: ["maintenance_sales_person_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_permit_id_fkey"
            columns: ["permit_id"]
            isOneToOne: false
            referencedRelation: "permits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_referral_contact_id_fkey"
            columns: ["referral_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_referral_organization_id_fkey"
            columns: ["referral_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      punch_list_items: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          details: string | null
          due_date: string | null
          id: number
          locked: boolean
          priority: string | null
          project_id: number | null
          status: string | null
          submitted_at: string | null
          team_member_id: number | null
          title: string | null
          type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          details?: string | null
          due_date?: string | null
          id?: number
          locked?: boolean
          priority?: string | null
          project_id?: number | null
          status?: string | null
          submitted_at?: string | null
          team_member_id?: number | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          details?: string | null
          due_date?: string | null
          id?: number
          locked?: boolean
          priority?: string | null
          project_id?: number | null
          status?: string | null
          submitted_at?: string | null
          team_member_id?: number | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "punch_list_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_list_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_list_items_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "punch_list_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      record_checklist_items: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: number
          item: string
          record_id: number
          source: string | null
          table_name: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: number
          item: string
          record_id: number
          source?: string | null
          table_name: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: number
          item?: string
          record_id?: number
          source?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_checklist_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_checklist_items_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_checklist_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      record_comments: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          field: string | null
          id: number
          record_id: number
          resolved_at: string | null
          table_name: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          field?: string | null
          id?: number
          record_id: number
          resolved_at?: string | null
          table_name: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          field?: string | null
          id?: number
          record_id?: number
          resolved_at?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      record_notes: {
        Row: {
          body: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          follow_up_date: string | null
          id: number
          record_id: number
          table_name: string
        }
        Insert: {
          body: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_date?: string | null
          id?: number
          record_id: number
          table_name: string
        }
        Update: {
          body?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          follow_up_date?: string | null
          id?: number
          record_id?: number
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rmas: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          date_submitted: string | null
          deleted_at: string | null
          details: string | null
          equipment: string | null
          id: number
          locked: boolean
          manufacturer_id: number | null
          project_id: number | null
          rma_number: string | null
          serial_numbers: string | null
          status: string | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          date_submitted?: string | null
          deleted_at?: string | null
          details?: string | null
          equipment?: string | null
          id?: number
          locked?: boolean
          manufacturer_id?: number | null
          project_id?: number | null
          rma_number?: string | null
          serial_numbers?: string | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          date_submitted?: string | null
          deleted_at?: string | null
          details?: string | null
          equipment?: string | null
          id?: number
          locked?: boolean
          manufacturer_id?: number | null
          project_id?: number | null
          rma_number?: string | null
          serial_numbers?: string | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rmas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rmas_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rmas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rmas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          archived_at: string | null
          brand_id: number | null
          cost: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          destination_project_id: number | null
          id: number
          locked: boolean
          mac_address: string | null
          model: string | null
          product_type: string | null
          sell_price: number | null
          staff_id: number | null
          stock_item_id: number | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_id?: number | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          destination_project_id?: number | null
          id?: number
          locked?: boolean
          mac_address?: string | null
          model?: string | null
          product_type?: string | null
          sell_price?: number | null
          staff_id?: number | null
          stock_item_id?: number | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_id?: number | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          destination_project_id?: number | null
          id?: number
          locked?: boolean
          mac_address?: string | null
          model?: string | null
          product_type?: string | null
          sell_price?: number | null
          staff_id?: number | null
          stock_item_id?: number | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_destination_project_id_fkey"
            columns: ["destination_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_performance: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          date: string | null
          deleted_at: string | null
          description: string | null
          employee_id: number | null
          id: number
          locked: boolean
          submitted_at: string | null
          title: string | null
          type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          description?: string | null
          employee_id?: number | null
          id?: number
          locked?: boolean
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          description?: string | null
          employee_id?: number | null
          id?: number
          locked?: boolean
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_performance_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_performance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_performance_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          archived_at: string | null
          brand_id: number | null
          cost: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          destination_project_id: number | null
          id: number
          location: string | null
          locked: boolean
          mac_address: string | null
          model: string | null
          product_id: number | null
          product_type: string | null
          sell_price: number | null
          serial: string | null
          staff_id: number | null
          status: string | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_id?: number | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          destination_project_id?: number | null
          id?: number
          location?: string | null
          locked?: boolean
          mac_address?: string | null
          model?: string | null
          product_id?: number | null
          product_type?: string | null
          sell_price?: number | null
          serial?: string | null
          staff_id?: number | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_id?: number | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          destination_project_id?: number | null
          id?: number
          location?: string | null
          locked?: boolean
          mac_address?: string | null
          model?: string | null
          product_id?: number | null
          product_type?: string | null
          sell_price?: number | null
          serial?: string | null
          staff_id?: number | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_destination_project_id_fkey"
            columns: ["destination_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: number
          locked: boolean
          name: string | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          name?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          name?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_notes: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          closed_date: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: number
          issue_category: string | null
          locked: boolean
          note: string | null
          note_date: string | null
          status: string | null
          submitted_at: string | null
          ticket_id: number
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          closed_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          issue_category?: string | null
          locked?: boolean
          note?: string | null
          note_date?: string | null
          status?: string | null
          submitted_at?: string | null
          ticket_id: number
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          closed_date?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          issue_category?: string | null
          locked?: boolean
          note?: string | null
          note_date?: string | null
          status?: string | null
          submitted_at?: string | null
          ticket_id?: number
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_notes_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          date_closed: string | null
          deleted_at: string | null
          id: number
          issue_category: string | null
          issue_description: string | null
          locked: boolean
          only_me: string | null
          priority: string | null
          status: string | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          date_closed?: string | null
          deleted_at?: string | null
          id?: number
          issue_category?: string | null
          issue_description?: string | null
          locked?: boolean
          only_me?: string | null
          priority?: string | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          date_closed?: string | null
          deleted_at?: string | null
          id?: number
          issue_category?: string | null
          issue_description?: string | null
          locked?: boolean
          only_me?: string | null
          priority?: string | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_proposals: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: number
          locked: boolean
          project_id: number | null
          submitted_at: string | null
          survey_details: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          project_id?: number | null
          submitted_at?: string | null
          survey_details?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          project_id?: number | null
          submitted_at?: string | null
          survey_details?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_proposals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_proposals_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          details: string | null
          due_date: string | null
          due_status: string | null
          id: number
          locked: boolean
          member_id: number | null
          priority: string | null
          status: string | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          details?: string | null
          due_date?: string | null
          due_status?: string | null
          id?: number
          locked?: boolean
          member_id?: number | null
          priority?: string | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          details?: string | null
          due_date?: string | null
          due_status?: string | null
          id?: number
          locked?: boolean
          member_id?: number | null
          priority?: string | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number | null
          archived_at: string | null
          contact_id: number | null
          created_at: string
          created_by: string | null
          date: string | null
          deleted_at: string | null
          description: string | null
          id: number
          locked: boolean
          organization_id: number | null
          payment_type: string | null
          portal_number: string | null
          project_id: number | null
          reason: string | null
          submitted_at: string | null
          title: string | null
          type: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number | null
          archived_at?: string | null
          contact_id?: number | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: number
          locked?: boolean
          organization_id?: number | null
          payment_type?: string | null
          portal_number?: string | null
          project_id?: number | null
          reason?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number | null
          archived_at?: string | null
          contact_id?: number | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: number
          locked?: boolean
          organization_id?: number | null
          payment_type?: string | null
          portal_number?: string | null
          project_id?: number | null
          reason?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_installations: {
        Row: {
          archived_at: string | null
          brand_and_model: string | null
          created_at: string
          created_by: string | null
          date: string | null
          deleted_at: string | null
          email: string | null
          id: number
          locked: boolean
          project_id: number | null
          room_area: string | null
          serial_number: string | null
          submitted_at: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
          validated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          brand_and_model?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: number
          locked?: boolean
          project_id?: number | null
          room_area?: string | null
          serial_number?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          validated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          brand_and_model?: string | null
          created_at?: string
          created_by?: string | null
          date?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: number
          locked?: boolean
          project_id?: number | null
          room_area?: string | null
          serial_number?: string | null
          submitted_at?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tv_installations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_installations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_installations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tv_installations_team: {
        Row: {
          created_at: string
          record_id: number
          target_id: number
        }
        Insert: {
          created_at?: string
          record_id: number
          target_id: number
        }
        Update: {
          created_at?: string
          record_id?: number
          target_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tv_installations_team_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "tv_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tv_installations_team_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: number
          locked: boolean
          make_and_model: string | null
          populate_on_reports: string | null
          submitted_at: string | null
          tag_number: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
          vin: string | null
          year: number | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          make_and_model?: string | null
          populate_on_reports?: string | null
          submitted_at?: string | null
          tag_number?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          vin?: string | null
          year?: number | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: number
          locked?: boolean
          make_and_model?: string | null
          populate_on_reports?: string | null
          submitted_at?: string | null
          tag_number?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      my_permissions: { Args: never; Returns: string[] }
      project_financials: {
        Args: { p_project_ids: number[] }
        Returns: {
          approved_amount: number
          invoiced_amount: number
          paid_amount: number
          project_id: number
        }[]
      }
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
