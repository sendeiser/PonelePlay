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
      ai_settings: {
        Row: {
          api_key: string | null
          api_key_encrypted: string | null
          enable_svg_fallback: boolean | null
          id: string
          is_active: boolean | null
          model_image: string | null
          model_text: string | null
          provider: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          api_key?: string | null
          api_key_encrypted?: string | null
          enable_svg_fallback?: boolean | null
          id?: string
          is_active?: boolean | null
          model_image?: string | null
          model_text?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          api_key?: string | null
          api_key_encrypted?: string | null
          enable_svg_fallback?: boolean | null
          id?: string
          is_active?: boolean | null
          model_image?: string | null
          model_text?: string | null
          provider?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          color_hex: string
          created_at: string | null
          description: string | null
          icon_name: string | null
          id: string
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          color_hex: string
          created_at?: string | null
          description?: string | null
          icon_name?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          color_hex?: string
          created_at?: string | null
          description?: string | null
          icon_name?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      combo_tools: {
        Row: {
          combo_id: string | null
          id: string
          step_order: number | null
          tool_id: string | null
          usage_note: string | null
        }
        Insert: {
          combo_id?: string | null
          id?: string
          step_order?: number | null
          tool_id?: string | null
          usage_note?: string | null
        }
        Update: {
          combo_id?: string | null
          id?: string
          step_order?: number | null
          tool_id?: string | null
          usage_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "combo_tools_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_tools_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      combos: {
        Row: {
          badge_color: string | null
          created_at: string | null
          criollo_summary: string
          id: string
          is_featured: boolean | null
          phase_workflow_mermaid: string | null
          slug: string
          subtitle: string | null
          title: string
          workflow_note: string | null
        }
        Insert: {
          badge_color?: string | null
          created_at?: string | null
          criollo_summary: string
          id?: string
          is_featured?: boolean | null
          phase_workflow_mermaid?: string | null
          slug: string
          subtitle?: string | null
          title: string
          workflow_note?: string | null
        }
        Update: {
          badge_color?: string | null
          created_at?: string | null
          criollo_summary?: string
          id?: string
          is_featured?: boolean | null
          phase_workflow_mermaid?: string | null
          slug?: string
          subtitle?: string | null
          title?: string
          workflow_note?: string | null
        }
        Relationships: []
      }
      ls_ai_agent_logs: {
        Row: {
          agent_type: string
          created_at: string | null
          github_repo_id: number
          id: string
          issue_number: number
          prompt: string
          response: string
        }
        Insert: {
          agent_type?: string
          created_at?: string | null
          github_repo_id: number
          id?: string
          issue_number: number
          prompt: string
          response: string
        }
        Update: {
          agent_type?: string
          created_at?: string | null
          github_repo_id?: number
          id?: string
          issue_number?: number
          prompt?: string
          response?: string
        }
        Relationships: []
      }
      ls_comments: {
        Row: {
          author_id: string
          author_name: string
          content: string
          created_at: string
          id: string
          issue_id: string
        }
        Insert: {
          author_id?: string
          author_name: string
          content: string
          created_at?: string
          id?: string
          issue_id: string
        }
        Update: {
          author_id?: string
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          issue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ls_comments_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "ls_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      ls_issue_team_metadata: {
        Row: {
          ai_summary: string | null
          antigravity_status: Database["public"]["Enums"]["ls_agent_execution_status"]
          antigravity_task_id: string | null
          github_repo_id: number
          id: string
          internal_notes: string | null
          issue_number: number
          story_points: number | null
          updated_at: string | null
        }
        Insert: {
          ai_summary?: string | null
          antigravity_status?: Database["public"]["Enums"]["ls_agent_execution_status"]
          antigravity_task_id?: string | null
          github_repo_id: number
          id?: string
          internal_notes?: string | null
          issue_number: number
          story_points?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_summary?: string | null
          antigravity_status?: Database["public"]["Enums"]["ls_agent_execution_status"]
          antigravity_task_id?: string | null
          github_repo_id?: number
          id?: string
          internal_notes?: string | null
          issue_number?: number
          story_points?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ls_issues: {
        Row: {
          assignee_name: string
          assignee_role: string
          branch: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          number: number
          pr_number: number | null
          priority: string
          repository_id: string
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_name?: string
          assignee_role?: string
          branch?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          number: number
          pr_number?: number | null
          priority?: string
          repository_id: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_name?: string
          assignee_role?: string
          branch?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          number?: number
          pr_number?: number | null
          priority?: string
          repository_id?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ls_issues_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "ls_linked_repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      ls_kanban_columns: {
        Row: {
          created_at: string | null
          filter_label: string | null
          github_state: string
          id: string
          name: string
          position: number
          repository_id: string
        }
        Insert: {
          created_at?: string | null
          filter_label?: string | null
          github_state?: string
          id?: string
          name: string
          position?: number
          repository_id: string
        }
        Update: {
          created_at?: string | null
          filter_label?: string | null
          github_state?: string
          id?: string
          name?: string
          position?: number
          repository_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ls_kanban_columns_repository_id_fkey"
            columns: ["repository_id"]
            isOneToOne: false
            referencedRelation: "ls_linked_repositories"
            referencedColumns: ["id"]
          },
        ]
      }
      ls_linked_repositories: {
        Row: {
          ai_settings: Json | null
          created_at: string | null
          default_branch: string
          full_name: string
          github_repo_id: number
          id: string
          is_private: boolean
          workspace_id: string
        }
        Insert: {
          ai_settings?: Json | null
          created_at?: string | null
          default_branch?: string
          full_name: string
          github_repo_id: number
          id?: string
          is_private?: boolean
          workspace_id: string
        }
        Update: {
          ai_settings?: Json | null
          created_at?: string | null
          default_branch?: string
          full_name?: string
          github_repo_id?: number
          id?: string
          is_private?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ls_linked_repositories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "ls_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ls_subtasks: {
        Row: {
          completed: boolean
          created_at: string
          id: string
          issue_id: string
          position: number
          title: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          id?: string
          issue_id: string
          position?: number
          title: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          id?: string
          issue_id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ls_subtasks_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "ls_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      ls_user_integrations: {
        Row: {
          created_at: string | null
          github_token: string | null
          github_user: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          github_token?: string | null
          github_user?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          github_token?: string | null
          github_user?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ls_workspace_members: {
        Row: {
          id: string
          joined_at: string | null
          role: Database["public"]["Enums"]["ls_user_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["ls_user_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          role?: Database["public"]["Enums"]["ls_user_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ls_workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "ls_workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ls_workspaces: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_id: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_id: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      publication_sections: {
        Row: {
          created_at: string
          description: string
          emoji: string
          id: string
          is_system: boolean
          name: string
          slug: string
          tone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          emoji?: string
          id: string
          is_system?: boolean
          name: string
          slug: string
          tone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          emoji?: string
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          tone?: string
          updated_at?: string
        }
        Relationships: []
      }
      publications: {
        Row: {
          author_or_channel: string
          created_at: string
          created_by_ai: boolean
          criollo_takeaway: string
          difficulty: string
          emoji: string
          estimated_time: string
          github_language: string | null
          github_stars: number | null
          id: string
          is_favorite: boolean
          is_pinned: boolean
          key_points: Json
          resource_type: string
          section_id: string
          slug: string
          summary: string
          tags: string[]
          technical_notes: string
          thumbnail_url: string | null
          title: string
          tutorial_steps: Json
          updated_at: string
          url: string
          video_embed_url: string | null
        }
        Insert: {
          author_or_channel?: string
          created_at?: string
          created_by_ai?: boolean
          criollo_takeaway?: string
          difficulty?: string
          emoji?: string
          estimated_time?: string
          github_language?: string | null
          github_stars?: number | null
          id: string
          is_favorite?: boolean
          is_pinned?: boolean
          key_points?: Json
          resource_type?: string
          section_id?: string
          slug: string
          summary?: string
          tags?: string[]
          technical_notes?: string
          thumbnail_url?: string | null
          title: string
          tutorial_steps?: Json
          updated_at?: string
          url: string
          video_embed_url?: string | null
        }
        Update: {
          author_or_channel?: string
          created_at?: string
          created_by_ai?: boolean
          criollo_takeaway?: string
          difficulty?: string
          emoji?: string
          estimated_time?: string
          github_language?: string | null
          github_stars?: number | null
          id?: string
          is_favorite?: boolean
          is_pinned?: boolean
          key_points?: Json
          resource_type?: string
          section_id?: string
          slug?: string
          summary?: string
          tags?: string[]
          technical_notes?: string
          thumbnail_url?: string | null
          title?: string
          tutorial_steps?: Json
          updated_at?: string
          url?: string
          video_embed_url?: string | null
        }
        Relationships: []
      }
      queue_items: {
        Row: {
          created_at: string
          downvotes_count: number
          id: string
          is_pinned: boolean
          net_score: number | null
          played_at: string | null
          proposed_by: string
          room_id: string
          song_id: string
          status: string
          upvotes_count: number
        }
        Insert: {
          created_at?: string
          downvotes_count?: number
          id?: string
          is_pinned?: boolean
          net_score?: number | null
          played_at?: string | null
          proposed_by: string
          room_id: string
          song_id: string
          status?: string
          upvotes_count?: number
        }
        Update: {
          created_at?: string
          downvotes_count?: number
          id?: string
          is_pinned?: boolean
          net_score?: number | null
          played_at?: string | null
          proposed_by?: string
          room_id?: string
          song_id?: string
          status?: string
          upvotes_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "queue_items_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "queue_items_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "songs"
            referencedColumns: ["id"]
          },
        ]
      }
      room_participants: {
        Row: {
          id: string
          is_banned: boolean
          joined_at: string
          last_proposed_at: string | null
          role: string
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_banned?: boolean
          joined_at?: string
          last_proposed_at?: string | null
          role?: string
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_banned?: boolean
          joined_at?: string
          last_proposed_at?: string | null
          role?: string
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          active_provider: string
          code: string
          cooldown_seconds: number
          created_at: string
          current_queue_item_id: string | null
          ended_at: string | null
          fallback_genre: string
          host_id: string
          id: string
          is_active: boolean
          max_pending_per_user: number
          name: string
          playback_state: Json
        }
        Insert: {
          active_provider?: string
          code: string
          cooldown_seconds?: number
          created_at?: string
          current_queue_item_id?: string | null
          ended_at?: string | null
          fallback_genre?: string
          host_id: string
          id?: string
          is_active?: boolean
          max_pending_per_user?: number
          name: string
          playback_state?: Json
        }
        Update: {
          active_provider?: string
          code?: string
          cooldown_seconds?: number
          created_at?: string
          current_queue_item_id?: string | null
          ended_at?: string | null
          fallback_genre?: string
          host_id?: string
          id?: string
          is_active?: boolean
          max_pending_per_user?: number
          name?: string
          playback_state?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rooms_current_queue_item_fk"
            columns: ["current_queue_item_id"]
            isOneToOne: false
            referencedRelation: "queue_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      songs: {
        Row: {
          album: string | null
          artist: string
          created_at: string
          duration_ms: number
          id: string
          image_url: string
          spotify_track_id: string | null
          title: string
          youtube_video_id: string | null
        }
        Insert: {
          album?: string | null
          artist: string
          created_at?: string
          duration_ms?: number
          id?: string
          image_url: string
          spotify_track_id?: string | null
          title: string
          youtube_video_id?: string | null
        }
        Update: {
          album?: string | null
          artist?: string
          created_at?: string
          duration_ms?: number
          id?: string
          image_url?: string
          spotify_track_id?: string | null
          title?: string
          youtube_video_id?: string | null
        }
        Relationships: []
      }
      tool_media: {
        Row: {
          caption: string | null
          created_at: string | null
          id: string
          is_ai_generated: boolean | null
          media_type: string | null
          prompt_used: string | null
          public_url: string
          sort_order: number | null
          storage_path: string
          tool_id: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          id?: string
          is_ai_generated?: boolean | null
          media_type?: string | null
          prompt_used?: string | null
          public_url: string
          sort_order?: number | null
          storage_path: string
          tool_id?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          id?: string
          is_ai_generated?: boolean | null
          media_type?: string | null
          prompt_used?: string | null
          public_url?: string
          sort_order?: number | null
          storage_path?: string
          tool_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_media_tool_id_fkey"
            columns: ["tool_id"]
            isOneToOne: false
            referencedRelation: "tools"
            referencedColumns: ["id"]
          },
        ]
      }
      tools: {
        Row: {
          category_id: string | null
          code_id: string
          compatibility_tags: string[] | null
          created_at: string | null
          criollo_analogy: string
          criollo_semaforo: Json | null
          criollo_without_with: Json | null
          emoji: string | null
          id: string
          install_commands: Json | null
          is_featured: boolean | null
          mcp_config_json: string | null
          mermaid_diagram: string | null
          phase_number: number | null
          raw_markdown: string
          repo_url: string | null
          risk_level: string | null
          slug: string
          status: string | null
          svg_infographic_config: Json | null
          tagline: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          code_id: string
          compatibility_tags?: string[] | null
          created_at?: string | null
          criollo_analogy: string
          criollo_semaforo?: Json | null
          criollo_without_with?: Json | null
          emoji?: string | null
          id?: string
          install_commands?: Json | null
          is_featured?: boolean | null
          mcp_config_json?: string | null
          mermaid_diagram?: string | null
          phase_number?: number | null
          raw_markdown: string
          repo_url?: string | null
          risk_level?: string | null
          slug: string
          status?: string | null
          svg_infographic_config?: Json | null
          tagline: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          code_id?: string
          compatibility_tags?: string[] | null
          created_at?: string | null
          criollo_analogy?: string
          criollo_semaforo?: Json | null
          criollo_without_with?: Json | null
          emoji?: string | null
          id?: string
          install_commands?: Json | null
          is_featured?: boolean | null
          mcp_config_json?: string | null
          mermaid_diagram?: string | null
          phase_number?: number | null
          raw_markdown?: string
          repo_url?: string | null
          risk_level?: string | null
          slug?: string
          status?: string | null
          svg_infographic_config?: Json | null
          tagline?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tools_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          avatar_emoji: string
          created_at: string
          display_name: string
          id: string
          is_anonymous: boolean
          spotify_user_id: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          avatar_emoji?: string
          created_at?: string
          display_name: string
          id?: string
          is_anonymous?: boolean
          spotify_user_id?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          avatar_emoji?: string
          created_at?: string
          display_name?: string
          id?: string
          is_anonymous?: boolean
          spotify_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string
          id: string
          queue_item_id: string
          room_id: string
          user_id: string
          vote_type: number
        }
        Insert: {
          created_at?: string
          id?: string
          queue_item_id: string
          room_id: string
          user_id: string
          vote_type: number
        }
        Update: {
          created_at?: string
          id?: string
          queue_item_id?: string
          room_id?: string
          user_id?: string
          vote_type?: number
        }
        Relationships: [
          {
            foreignKeyName: "votes_queue_item_id_fkey"
            columns: ["queue_item_id"]
            isOneToOne: false
            referencedRelation: "queue_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_room_playback: {
        Args: { p_next_queue_item_id?: string; p_room_id: string }
        Returns: Json
      }
      cast_queue_vote: {
        Args: {
          p_direction: number
          p_queue_item_id: string
          p_user_id: string
        }
        Returns: Json
      }
      ls_add_member_by_email: {
        Args: {
          p_email: string
          p_role?: Database["public"]["Enums"]["ls_user_role"]
          p_workspace: string
        }
        Returns: string
      }
      ls_can_access_issue: {
        Args: { p_issue: string; p_write?: boolean }
        Returns: boolean
      }
      ls_can_access_repo: {
        Args: { p_repo: string; p_write?: boolean }
        Returns: boolean
      }
      ls_create_workspace: {
        Args: {
          p_github_repo_id?: number
          p_name: string
          p_repo_full_name: string
          p_slug: string
        }
        Returns: string
      }
      ls_delete_workspace: { Args: { p_workspace: string }; Returns: undefined }
      ls_is_in_workspace: { Args: { p_ws: string }; Returns: boolean }
      ls_list_registered_users: {
        Args: { p_workspace?: string }
        Returns: {
          already_member: boolean
          email: string
          id: string
          name: string
        }[]
      }
      ls_list_workspace_members: {
        Args: { p_workspace: string }
        Returns: {
          email: string
          id: string
          joined_at: string
          name: string
          role: Database["public"]["Enums"]["ls_user_role"]
          user_id: string
        }[]
      }
      ls_remove_workspace_member: {
        Args: { p_target_user_id: string; p_workspace: string }
        Returns: undefined
      }
      propose_or_upvote_song: {
        Args: {
          p_album: string
          p_artist: string
          p_duration_ms: number
          p_image_url: string
          p_room_id: string
          p_spotify_track_id: string
          p_title: string
          p_user_id: string
          p_youtube_video_id: string
        }
        Returns: Json
      }
      record_room_reaction: {
        Args: { p_emoji: string; p_room_id: string }
        Returns: Json
      }
      upsert_party_user: {
        Args: {
          p_avatar_emoji?: string
          p_display_name: string
          p_is_anonymous?: boolean
          p_user_id: string
        }
        Returns: {
          auth_user_id: string | null
          avatar_emoji: string
          created_at: string
          display_name: string
          id: string
          is_anonymous: boolean
          spotify_user_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      ls_agent_execution_status: "idle" | "running" | "pr_ready" | "error"
      ls_user_role: "owner" | "admin" | "developer" | "viewer"
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
      ls_agent_execution_status: ["idle", "running", "pr_ready", "error"],
      ls_user_role: ["owner", "admin", "developer", "viewer"],
    },
  },
} as const
