/**
 * 순수 로직 유닛 테스트 전용 (초성 변환·매칭).
 * RN 컴포넌트는 여기서 다루지 않는다 — 화면은 실기기에서 확인한다.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
};
