import type { Request, Response, NextFunction } from 'express';

const startedAt = Date.now();
const httpRequests = new Map<string, number>();
const httpDurations = new Map<string, number>();

const keyFor = (method: string, path: string, status: number) => `${method} ${path} ${status}`;

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const key = keyFor(req.method, req.route?.path || req.path, res.statusCode);
    httpRequests.set(key, (httpRequests.get(key) || 0) + 1);
    httpDurations.set(key, (httpDurations.get(key) || 0) + Date.now() - start);
  });

  next();
};

export const renderMetrics = () => {
  const lines = [
    '# HELP creative_bot_uptime_seconds Process uptime in seconds.',
    '# TYPE creative_bot_uptime_seconds gauge',
    `creative_bot_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`,
    '# HELP creative_bot_http_requests_total Total HTTP requests.',
    '# TYPE creative_bot_http_requests_total counter',
  ];

  for (const [key, value] of httpRequests.entries()) {
    const [method, route, status] = key.split(' ');
    lines.push(
      `creative_bot_http_requests_total{method="${method}",route="${route}",status="${status}"} ${value}`
    );
  }

  lines.push(
    '# HELP creative_bot_http_request_duration_ms_sum Total HTTP request duration in milliseconds.',
    '# TYPE creative_bot_http_request_duration_ms_sum counter'
  );

  for (const [key, value] of httpDurations.entries()) {
    const [method, route, status] = key.split(' ');
    lines.push(
      `creative_bot_http_request_duration_ms_sum{method="${method}",route="${route}",status="${status}"} ${value}`
    );
  }

  return `${lines.join('\n')}\n`;
};
