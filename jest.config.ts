import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@game/(.*)$': '<rootDir>/src/$1',
    '^@game/domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@game/application/(.*)$': '<rootDir>/src/application/$1',
    '^@game/infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@game/gateway/(.*)$': '<rootDir>/src/gateway/$1',
    '^@game/modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@game/common/(.*)$': '<rootDir>/src/common/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/index.ts'],
};

export default config;
