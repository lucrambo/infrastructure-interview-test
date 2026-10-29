import pino, { type DestinationStream, type Logger } from "pino";

export type { Logger };

/** JSON lines on stdout: one object per event, ISO timestamps and textual levels. */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    destination,
  );
}
