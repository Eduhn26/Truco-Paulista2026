import { HealthService } from './health.service';

type PrismaServiceStub = {
  isDatabaseReady: () => Promise<boolean>;
};

describe('HealthService', () => {
  it('returns ok when the database probe succeeds', async () => {
    const prismaServiceStub: PrismaServiceStub = {
      isDatabaseReady: () => Promise.resolve(true),
    };

    const healthService = new HealthService(prismaServiceStub as never);
    const result = await healthService.getReadiness();

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error('Expected readiness to be successful');
    }

    expect(result.response.status).toBe('ok');
    expect(result.response.check).toBe('readiness');
    expect(result.response.dependencies.database).toBe('up');
    expect(Number.isNaN(Date.parse(result.response.timestamp))).toBe(false);
  });

  it('returns error when the database probe fails', async () => {
    const prismaServiceStub: PrismaServiceStub = {
      isDatabaseReady: () => Promise.resolve(false),
    };

    const healthService = new HealthService(prismaServiceStub as never);
    const result = await healthService.getReadiness();

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error('Expected readiness to fail');
    }

    expect(result.response.status).toBe('error');
    expect(result.response.check).toBe('readiness');
    expect(result.response.dependencies.database).toBe('down');
    expect(Number.isNaN(Date.parse(result.response.timestamp))).toBe(false);
  });
});