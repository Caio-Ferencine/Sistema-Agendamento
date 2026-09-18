/** Only curated messages cross the boundary from APIs into the interface. */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;

  const details =
    error && typeof error === 'object'
      ? (error as { code?: string; status?: number; message?: string; name?: string })
      : {};
  if (details.code === 'PT409' && details.message === 'SERVICE_CHANGED') {
    return 'O serviço foi atualizado. Confira a duração, o valor e os horários antes de confirmar novamente.';
  }
  const messages: Record<string, string> = {
    PT401: 'Sua sessão expirou. Entre novamente para continuar.',
    PT403: 'Você não tem permissão para realizar esta operação.',
    PT404: 'O registro não foi encontrado. Atualize a página e tente novamente.',
    PT409:
      'Este período não está mais disponível ou conflita com sua agenda. Atualize os horários e tente novamente.',
    PT422: 'Confira os dados informados, a data, os horários e a duração do serviço.',
    '23P01': 'Este período já está ocupado. Escolha outro horário.',
    '23505': 'Já existe um registro com estes dados. Confira as informações.',
    '23514': 'Os dados não atendem às regras de agendamento. Confira os campos e os horários.',
    '23503': 'Este registro está relacionado a outros dados e não pode ser removido.',
    '42501': 'Você não tem permissão para realizar esta operação.',
    PGRST301: 'Sua sessão expirou. Entre novamente para continuar.',
    PGRST116: 'Não foi possível encontrar os dados solicitados.',
    invalid_credentials: 'E-mail ou senha incorretos.',
    email_not_confirmed: 'Confirme seu e-mail antes de entrar. Procure também na pasta de spam.',
    user_already_exists: 'Não foi possível criar a conta. Se já possui cadastro, tente entrar.',
    email_exists: 'Não foi possível criar a conta. Se já possui cadastro, tente entrar.',
    weak_password: 'Escolha uma senha mais forte, com pelo menos 8 caracteres.',
    over_email_send_rate_limit: 'Aguarde alguns minutos antes de solicitar outro e-mail.',
    over_request_rate_limit:
      'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
    signup_disabled: 'O cadastro está temporariamente indisponível. Tente novamente mais tarde.',
    validation_failed: 'Confira os dados informados e tente novamente.',
    bad_jwt: 'Sua sessão expirou. Entre novamente para continuar.',
    otp_expired: 'Este link expirou ou já foi utilizado. Tente entrar ou solicite um novo link.',
    flow_state_not_found:
      'Não foi possível validar o link. Abra-o no mesmo navegador em que realizou o cadastro.',
    flow_state_expired: 'Este link expirou. Solicite um novo link de confirmação.',
  };

  if (details.code && messages[details.code]) return messages[details.code];
  if (details.status === 429) return messages['over_request_rate_limit'];
  if (details.status === 401) return messages['PT401'];
  if (details.status === 403) return messages['PT403'];
  if (
    details.name === 'AuthRetryableFetchError' ||
    /fetch|network|connection|offline|timeout/i.test(details.message ?? '')
  ) {
    return 'Não foi possível conectar ao servidor. Confira sua conexão e tente novamente.';
  }
  return 'Não foi possível concluir a operação. Tente novamente em alguns instantes.';
}
