import { QueryClient } from '@tanstack/react-query';

/**
 * 온라인 전용 + 읽기 캐시 (계획 C2 / AC9).
 * 캐시는 UX 최적화이지 진실의 원천이 아니다 — 쓰기는 항상 서버를 거친다 (P4).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});
