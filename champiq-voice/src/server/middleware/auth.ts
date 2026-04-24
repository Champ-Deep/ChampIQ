import { Request, Response, NextFunction } from 'express';

/** Optional API key guard for the gateway HTTP server. Skip if no key configured. */
export function apiKeyAuth(apiKey: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!apiKey) { next(); return; }
    const provided =
      req.headers['x-api-key'] ??
      req.headers['authorization']?.replace(/^Bearer\s+/, '');
    if (provided !== apiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  };
}
