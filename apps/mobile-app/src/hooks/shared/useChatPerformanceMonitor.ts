import { useCallback, useEffect, useRef } from 'react';

type ProfilerStats = {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
};

const REPORT_INTERVAL_MS = 15000;

export function useChatPerformanceMonitor(screenName: string) {
  const profilerStatsRef = useRef<Record<string, ProfilerStats>>({});
  const frameCountRef = useRef(0);
  const fpsRef = useRef(0);
  const frameWindowStartRef = useRef(0);

  const onProfilerRender = useCallback(
    (id: string, phase: 'mount' | 'update' | 'nested-update', actualDuration: number) => {
      if (!__DEV__) {
        return;
      }

      const current = profilerStatsRef.current[id] || {
        count: 0,
        totalDurationMs: 0,
        maxDurationMs: 0,
      };

      current.count += 1;
      current.totalDurationMs += actualDuration;
      current.maxDurationMs = Math.max(current.maxDurationMs, actualDuration);
      profilerStatsRef.current[id] = current;

      if (phase === 'mount' && actualDuration > 20) {
        console.log(
          `[Perf][${screenName}] Slow mount detected for ${id}: ${actualDuration.toFixed(2)}ms`,
        );
      }
    },
    [screenName],
  );

  const markSnapshot = useCallback(
    (label: string) => {
      if (!__DEV__) {
        return;
      }

      const profilerSnapshot = Object.entries(profilerStatsRef.current).map(([id, stats]) => {
        const avg = stats.count > 0 ? stats.totalDurationMs / stats.count : 0;
        return `${id}: avg=${avg.toFixed(2)}ms max=${stats.maxDurationMs.toFixed(2)}ms commits=${stats.count}`;
      });

      console.log(
        `[Perf][${screenName}] Snapshot(${label}) fps=${fpsRef.current.toFixed(1)} | ${profilerSnapshot.join(' | ')}`,
      );
    },
    [screenName],
  );

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    frameWindowStartRef.current = globalThis.performance?.now?.() || Date.now();

    let rafId = 0;
    const tick = (timestamp: number) => {
      frameCountRef.current += 1;
      const elapsedMs = timestamp - frameWindowStartRef.current;

      if (elapsedMs >= 1000) {
        fpsRef.current = (frameCountRef.current * 1000) / elapsedMs;
        frameCountRef.current = 0;
        frameWindowStartRef.current = timestamp;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    const reportTimer = setInterval(() => {
      const segments = Object.entries(profilerStatsRef.current)
        .map(([id, stats]) => {
          const avg = stats.count > 0 ? stats.totalDurationMs / stats.count : 0;
          return `${id}: avg=${avg.toFixed(2)}ms max=${stats.maxDurationMs.toFixed(2)}ms commits=${stats.count}`;
        })
        .join(' | ');

      console.log(`[Perf][${screenName}] FPS=${fpsRef.current.toFixed(1)} | ${segments}`);
    }, REPORT_INTERVAL_MS);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(reportTimer);
    };
  }, [screenName]);

  return {
    onProfilerRender,
    markSnapshot,
  };
}
