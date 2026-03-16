import { HealthController } from '@game/health/health.controller';

describe('HealthController', () => {
  let healthController: HealthController;

  beforeEach(() => {
    healthController = new HealthController();
  });

  it('returns the liveness payload without checking dependencies', () => {
    const result = healthController.getLiveness();

    expect(result.status).toBe('ok');
    expect(result.check).toBe('liveness');
    expect(result.service).toBe('truco-paulista-backend');
    expect(result.timestamp).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
