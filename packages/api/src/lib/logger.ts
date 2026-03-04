/** Structured JSON logger for CloudWatch. */
export const logger = {
  info(message: string, data?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: 'INFO', message, ...data, timestamp: new Date().toISOString() }));
  },

  warn(message: string, data?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: 'WARN', message, ...data, timestamp: new Date().toISOString() }));
  },

  error(message: string, error?: unknown, data?: Record<string, unknown>) {
    console.error(JSON.stringify({
      level: 'ERROR',
      message,
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      ...data,
      timestamp: new Date().toISOString(),
    }));
  },
};
