import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/services/error-message';

export function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmation')?.value
    ? null
    : { passwordsMismatch: true };
}

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.page.html',
  styleUrl: './auth.css',
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  protected readonly pending = signal(false);
  protected readonly error = signal('');
  protected readonly confirmationSent = signal(false);
  protected readonly form = this.fb.nonNullable.group(
    {
      nome: [
        '',
        [
          Validators.required,
          Validators.minLength(2),
          Validators.maxLength(120),
          Validators.pattern(/\S.*\S/),
        ],
      ],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      telefone: [
        '',
        [Validators.pattern(/^\+?(?:[\s().-]*\d){8,15}[\s().-]*$/), Validators.maxLength(20)],
      ],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128)]],
      confirmation: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  protected async submit(): Promise<void> {
    if (this.pending()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.pending.set(true);
    this.error.set('');
    try {
      const result = await this.auth.signUp(this.form.getRawValue());
      if (result.requiresEmailConfirmation) {
        this.confirmationSent.set(true);
        this.form.controls.password.reset();
        this.form.controls.confirmation.reset();
      } else {
        await this.router.navigateByUrl(`/${this.auth.profile()!.tipo}`);
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
