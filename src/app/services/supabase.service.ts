import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

type RoomInsert = {
  target_neighborhood: string;
  status: 'active';
};

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly supabaseUrl = 'https://htpzcqnutayjdrqhyxgb.supabase.co';
  private readonly supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0cHpjcW51dGF5amRycWh5eGdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzA4MjQsImV4cCI6MjEwNjcwNjgyNH0.NUW7FjbXHGs41yEvLOpxRSz92nG6FPVgL3J6Dj4Yahk';
  readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(this.supabaseUrl, this.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  async createRoom(neighborhood: string): Promise<string> {
    const room: RoomInsert = {
      target_neighborhood: neighborhood,
      status: 'active',
    };

    const { data, error } = await this.client
      .from('rooms')
      .insert(room)
      .select('id')
      .single();

    if (error) {
      console.error('[DineAlign] Failed to create room:', error.message);
      throw error;
    }

    return String(data.id);
  }
}
