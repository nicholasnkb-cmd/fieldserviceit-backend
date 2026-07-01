import { TicketTimelineService } from './ticket-timeline.service';

describe('TicketTimelineService', () => {
  it('hides internal actions from customer-visible timelines by default', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new TicketTimelineService({
      ticketTimeline: { findMany },
    } as any);

    await service.getTimeline('ticket-1');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ticketId: 'ticket-1', isInternal: false },
      orderBy: { createdAt: 'desc' },
    }));
  });

  it('allows staff timelines to include internal actions', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new TicketTimelineService({
      ticketTimeline: { findMany },
    } as any);

    await service.getTimeline('ticket-1', true);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ticketId: 'ticket-1' },
    }));
  });
});
