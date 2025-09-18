import { Request } from 'firebase-functions/v2/https';

/**
 * Set CORS headers for HTTP requests
 */
export const setCorsHeaders = (res: any): void => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
};

/**
 * Handle CORS preflight requests
 */
export const handleCorsOptions = (req: Request, res: any): boolean => {
  if (req.method === 'OPTIONS') {
    res.status(200).send('');
    return true;
  }
  return false;
};

/**
 * Validate HTTP method
 */
export const validateHttpMethod = (
  req: Request,
  res: any,
  allowedMethods: string[]
): boolean => {
  if (!allowedMethods.includes(req.method)) {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return false;
  }
  return true;
};
