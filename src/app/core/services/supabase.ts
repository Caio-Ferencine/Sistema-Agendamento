import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class Supabase {

  public client: SupabaseClient;

  constructor() {
    this.client = createClient(
      environment.supabaseUrl,
      environment.supabaseKey
    );
  }

  async testarConexao() {

    const { data, error } = await this.client.auth.getSession();

    if (error) {
      console.error('Erro na conexão com o Supabase:', error);
      return;
    }

    console.log('Supabase conectado com sucesso!');
    console.log('Sessão atual:', data.session);
  }
}