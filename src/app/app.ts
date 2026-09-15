import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<a class="skip-link" href="#main-content">Pular para o conteúdo</a><router-outlet />',
  styleUrl: './app.css',
})
export class App {}
