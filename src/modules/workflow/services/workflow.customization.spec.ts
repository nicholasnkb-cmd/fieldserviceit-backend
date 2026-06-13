import { WorkflowService } from './workflow.service';

describe('WorkflowService tenant defaults', () => {
  it('uses the tenant trigger and prepends the configured approval step', async () => {
    const prisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({
          settings: JSON.stringify({
            customization: {
              workflow: {
                defaultTrigger: 'ticket.updated',
                defaultPriority: 'HIGH',
                requireApproval: true,
                autoAssign: true,
                approvalGroup: 'Service managers',
              },
            },
          }),
        }),
      },
      workflow: { create: jest.fn().mockResolvedValue({ id: 'workflow-1' }) },
    };
    const service = new WorkflowService(prisma as any);

    await service.create({ name: 'Escalation', steps: [{ action: 'notify', config: {} }] }, 'company-1');

    expect(prisma.workflow.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        triggerOn: 'ticket.updated',
        steps: {
          create: [
            { stepOrder: 1, action: 'require_approval', config: { group: 'Service managers' } },
            { stepOrder: 2, action: 'set_priority', config: { priority: 'HIGH' } },
            { stepOrder: 3, action: 'auto_assign', config: { strategy: 'least_loaded' } },
            { stepOrder: 4, action: 'notify', config: {} },
          ],
        },
      }),
    }));
  });
});
