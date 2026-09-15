import { TestBed } from '@angular/core/testing';
import { SchedulingService } from '../../core/services/scheduling.service';
import { Appointment } from '../../models/entities';
import { ClientAppointmentsPage } from './appointments.page';

describe('client cancellation deadline', () => {
  let page: ClientAppointmentsPage;
  let cancelAppointment: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-20T12:00:00Z'));
    cancelAppointment = vi.fn().mockResolvedValue({});
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SchedulingService,
          useValue: {
            listAppointments: vi.fn().mockResolvedValue([]),
            cancelAppointment,
          },
        },
      ],
    });
    page = TestBed.runInInjectionContext(() => new ClientAppointmentsPage());
  });

  afterEach(() => vi.restoreAllMocks());

  it('offers cancellation only for active appointments that have not started', () => {
    expect(
      page.canCancel({ status: 'agendado', inicio: '2026-10-20T12:01:00Z' } as Appointment),
    ).toBe(true);
    expect(
      page.canCancel({ status: 'agendado', inicio: '2026-10-20T12:00:00Z' } as Appointment),
    ).toBe(false);
    expect(
      page.canCancel({ status: 'concluido', inicio: '2026-10-20T12:01:00Z' } as Appointment),
    ).toBe(false);
    expect(
      page.canCancel({
        status: 'cancelado_cliente',
        inicio: '2026-10-20T12:01:00Z',
      } as Appointment),
    ).toBe(false);
  });

  it('rechecks time when submitting a confirmation that was left open', async () => {
    page.cancelId.set('appointment');
    await page.cancel({
      id: 'appointment',
      status: 'agendado',
      inicio: '2026-10-20T12:00:00Z',
    } as Appointment);
    expect(cancelAppointment).not.toHaveBeenCalled();
    expect(page.cancelId()).toBeNull();
    expect(page.error()).toContain('antes do início');
  });
});
