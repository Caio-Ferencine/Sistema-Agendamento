import { AppError, errorMessage } from './error-message';

describe('safe user-facing error messages', () => {
  it('never exposes unrecognized database error details', () => {
    const message = errorMessage({
      code: 'XX000',
      message: 'table private_secrets has leaked a token',
    });
    expect(message).not.toContain('private_secrets');
    expect(message).not.toContain('token');
    expect(message).toContain('Tente novamente');
  });

  it('recognizes concurrent bookings and expired sessions', () => {
    expect(errorMessage({ code: '23P01' })).toContain('ocupado');
    expect(errorMessage({ code: 'PT409' })).toContain('não está mais disponível');
    expect(errorMessage({ code: 'PT401' })).toContain('Entre novamente');
  });

  it('distinguishes invalid credentials from a network failure', () => {
    expect(errorMessage({ code: 'invalid_credentials' })).toBe('E-mail ou senha incorretos.');
    expect(errorMessage(new TypeError('Failed to fetch'))).toContain('Confira sua conexão');
  });

  it('allows a curated application message', () => {
    expect(errorMessage(new AppError('Escolha um horário.'))).toBe('Escolha um horário.');
  });
});
