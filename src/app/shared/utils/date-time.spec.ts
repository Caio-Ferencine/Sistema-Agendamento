import { dateInZone, localDateTimeToIso } from './date-time';

describe('professional time-zone conversion', () => {
  it('converts Sao Paulo wall time independently of the browser zone', () => {
    expect(localDateTimeToIso('2026-09-14T09:30', 'America/Sao_Paulo')).toBe(
      '2026-09-14T12:30:00.000Z',
    );
  });

  it('handles a zone with a fractional-hour UTC offset', () => {
    expect(localDateTimeToIso('2026-09-14T09:30', 'Asia/Kolkata')).toBe('2026-09-14T04:00:00.000Z');
  });

  it('rejects normalized dates instead of silently choosing another day', () => {
    expect(() => localDateTimeToIso('2026-02-31T09:00', 'America/Sao_Paulo')).toThrow(
      'data e um horário válidos',
    );
    expect(() => localDateTimeToIso('2026-02-29T09:00', 'America/Sao_Paulo')).toThrow(
      'data e um horário válidos',
    );
    expect(() => localDateTimeToIso('2026-09-14T24:00', 'America/Sao_Paulo')).toThrow(
      'data e um horário válidos',
    );
  });

  it('accepts a valid leap day', () => {
    expect(localDateTimeToIso('2028-02-29T09:00', 'America/Sao_Paulo')).toBe(
      '2028-02-29T12:00:00.000Z',
    );
  });

  it('rejects an hour skipped during a daylight-saving transition', () => {
    expect(() => localDateTimeToIso('2026-03-08T02:30', 'America/New_York')).toThrow(
      'não existe no fuso',
    );
  });

  it('uses the professional day around UTC midnight', () => {
    expect(dateInZone('2026-09-14T01:00:00Z', 'America/Sao_Paulo')).toBe('2026-09-13');
  });
});
