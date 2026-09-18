import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/services/error-message';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.page.html',
  styleUrl: './auth.css',
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  protected readonly pending = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly needsConfirmation = signal(false);
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', Validators.required],
  });

  protected async submit(): Promise<void> {
    if (this.pending()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.pending.set(true);
    this.error.set('');
    this.success.set('');
    this.needsConfirmation.set(false);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.signIn(email, password);
      await this.router.navigateByUrl(`/${this.auth.profile()!.tipo}`);
    } catch (error) {
      this.error.set(errorMessage(error));
      this.needsConfirmation.set(
        !!error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'email_not_confirmed',
      );
    } finally {
      this.pending.set(false);
    }
  }

  protected async resend(): Promise<void> {
    if (this.pending() || this.form.controls.email.invalid) return;
    this.pending.set(true);
    this.error.set('');
    try {
      await this.auth.resendConfirmation(this.form.controls.email.value);
      this.success.set(
        'Se houver um cadastro pendente para este e-mail, você receberá um novo link de confirmação.',
      );
      this.needsConfirmation.set(false);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
