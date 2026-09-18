import { AppError } from '../../core/services/error-message';

/** Appointment instants are UTC; dates/times chosen by a person use the professional's IANA zone. */
export function todayInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join('-');
}
export function formatDateTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
export function formatTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}
export function dateInZone(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join('-');
}
export function localDateTimeToIso(value: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new AppError('Informe uma data e um horário válidos.');
  const target = Date.parse(value + ':00Z');
  // Date.parse normalizes dates such as February 31; do not reserve the resulting March date.
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 16) !== value) {
    throw new AppError('Informe uma data e um horário válidos.');
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const localAsUtc = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const get = (type: string) => parts.find((part) => part.type === type)!.value;
    return Date.parse(
      `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`,
    );
  };
  let result = target;
  for (let i = 0; i < 4; i++) result += target - localAsUtc(result);
  // A skipped hour during a DST transition is not a valid local time.
  if (localAsUtc(result) !== target)
    throw new AppError(
      'Este horário não existe no fuso do profissional devido à mudança de horário. Escolha outro horário.',
    );
  return new Date(result).toISOString();
}
