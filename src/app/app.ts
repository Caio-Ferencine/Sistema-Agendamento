import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Supabase } from './core/services/supabase';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {

  private supabase = inject(Supabase);

  constructor() {
    this.supabase.testarConexao();
  }

}