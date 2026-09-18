import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login.page').then((m) => m.LoginPage),
    title: 'Entrar | agenda.',
  },
  {
    path: 'cadastro',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/register.page').then((m) => m.RegisterPage),
    title: 'Criar conta | agenda.',
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./pages/auth/auth-callback.page').then((m) => m.AuthCallbackPage),
    title: 'Confirmando acesso | agenda.',
  },
  {
    path: 'cliente',
    canActivate: [authGuard, roleGuard('cliente')],
    canActivateChild: [authGuard, roleGuard('cliente')],
    loadComponent: () => import('./shared/components/app-shell').then((m) => m.AppShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/cliente/client-dashboard.page').then((m) => m.ClientDashboardPage),
        title: 'Visão geral | agenda.',
      },
      {
        path: 'agendar',
        loadComponent: () => import('./pages/cliente/booking.page').then((m) => m.BookingPage),
        title: 'Novo agendamento | agenda.',
      },
      {
        path: 'agendamentos',
        loadComponent: () =>
          import('./pages/cliente/appointments.page').then((m) => m.ClientAppointmentsPage),
        title: 'Meus agendamentos | agenda.',
      },
    ],
  },
  {
    path: 'profissional',
    canActivate: [authGuard, roleGuard('profissional')],
    canActivateChild: [authGuard, roleGuard('profissional')],
    loadComponent: () => import('./shared/components/app-shell').then((m) => m.AppShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./pages/profissional/professional-dashboard.page').then(
            (m) => m.ProfessionalDashboardPage,
          ),
        title: 'Painel profissional | agenda.',
      },
      {
        path: 'agenda',
        loadComponent: () =>
          import('./pages/profissional/professional-agenda.page').then(
            (m) => m.ProfessionalAgendaPage,
          ),
        title: 'Minha agenda | agenda.',
      },
      {
        path: 'servicos',
        loadComponent: () =>
          import('./pages/profissional/services.page').then((m) => m.ServicesPage),
        title: 'Serviços | agenda.',
      },
      {
        path: 'disponibilidade',
        loadComponent: () =>
          import('./pages/profissional/availability.page').then((m) => m.AvailabilityPage),
        title: 'Disponibilidade | agenda.',
      },
      {
        path: 'bloqueios',
        loadComponent: () => import('./pages/profissional/blocks.page').then((m) => m.BlocksPage),
        title: 'Bloqueios | agenda.',
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
