"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeRetryAfterSeconds } from "@/lib/otp-rate-limit";

/**
 * Countdown for a server-provided OTP retry delay.
 *
 * - Client convenience only: the next request is still server-gated.
 * - May vanish on page refresh — that is expected.
 * - Returns the live `remaining` plus a `start()` to arm it.
 */
export function useOtpRetryCountdown(): {
  remaining: number;
  start: (seconds: number) => void;
} {
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (seconds: number) => {
      const normalized = normalizeRetryAfterSeconds(seconds) ?? 60;
      clear();
      setRemaining(normalized);
      timerRef.current = setInterval(() => {
        setRemaining((current) => {
          if (current <= 1) {
            if (timerRef.current !== null) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            return 0;
          }
          return current - 1;
        });
      }, 1000);
    },
    [clear]
  );

  useEffect(() => clear, [clear]);

  return { remaining, start };
}
