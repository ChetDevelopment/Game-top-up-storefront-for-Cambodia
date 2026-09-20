import { NextRequest } from 'next/server';

function parseCIDR(cidr: string): { start: number; end: number } | null {
  try {
    const [ip, mask] = cidr.split('/');
    if (!ip || !mask) return null;
    const maskBits = parseInt(mask, 10);
    if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) return null;

    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;

    const ipLong = (parts[0]! << 24) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
    const maskLong = ~((1 << (32 - maskBits)) - 1);
    const start = ipLong & maskLong;
    const end = start + ((1 << (32 - maskBits)) - 1);
    return { start, end };
  } catch {
    return null;
  }
}

function ipToLong(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
  return (parts[0]! << 24) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

function isIPInRanges(ip: string, ranges: string[]): boolean {
  if (ranges.length === 0) return false;

  const ipLong = ipToLong(ip);
  if (ipLong === null) return false;

  for (const range of ranges) {
    const parsed = parseCIDR(range);
    if (parsed && ipLong >= parsed.start && ipLong <= parsed.end) {
      return true;
    }
  }

  return false;
}

function isValidIPv4(ip: string): boolean {
  return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip);
}

function isValidIPv6(ip: string): boolean {
  return /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(ip);
}

export function extractClientIP(req: NextRequest): string | null {
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'x-vercel-forwarded-for',
    'cf-connecting-ip',
  ];

  for (const header of headers) {
    const value = req.headers.get(header);
    if (value) {
      const ip = value.split(',')[0]?.trim();
      if (ip && (isValidIPv4(ip) || isValidIPv6(ip))) {
        return ip;
      }
    }
  }

  return null;
}

function getRangesForProvider(provider: 'BAKONG' | 'ABA'): string[] {
  const envVar = provider === 'BAKONG' ? 'BAKONG_IP_RANGES' : 'ABA_IP_RANGES';
  const envValue = process.env[envVar];

  if (!envValue || envValue.trim().length === 0) {
    return [];
  }

  return envValue
    .split(',')
    .map(r => r.trim())
    .filter(r => r.length > 0);
}

export function isAllowedProviderIP(
  req: NextRequest,
  provider: 'BAKONG' | 'ABA'
): {
  allowed: boolean;
  clientIP: string | null;
  reason?: string;
} {
  const clientIP = extractClientIP(req);

  if (!clientIP) {
    return {
      allowed: false,
      clientIP: null,
      reason: 'Could not extract client IP',
    };
  }

  const ranges = getRangesForProvider(provider);

  if (ranges.length === 0) {
    return {
      allowed: false,
      clientIP,
      reason: `No IP ranges configured for ${provider}. Set ${provider === 'BAKONG' ? 'BAKONG_IP_RANGES' : 'ABA_IP_RANGES'} env var.`,
    };
  }

  const isAllowed = isIPInRanges(clientIP, ranges);

  return {
    allowed: isAllowed,
    clientIP,
    reason: isAllowed ? 'IP in allowed range' : 'IP not in allowed range',
  };
}

export function getConfiguredIPRanges(provider: 'BAKONG' | 'ABA'): string[] {
  return getRangesForProvider(provider);
}

export function getEnvIPRanges(envVarName: string): string[] {
  const envValue = process.env[envVarName];
  if (!envValue) return [];
  return envValue
    .split(',')
    .map(range => range.trim())
    .filter(range => range.length > 0);
}

export function validateCIDR(cidr: string): {
  valid: boolean;
  error?: string;
} {
  const parsed = parseCIDR(cidr);
  if (!parsed) {
    return { valid: false, error: 'Invalid CIDR notation (expected format: x.x.x.x/y)' };
  }
  const [ip, mask] = cidr.split('/');
  if (!ip || !mask) return { valid: false, error: 'Invalid CIDR format' };
  const maskNum = parseInt(mask, 10);
  if (isNaN(maskNum) || maskNum < 0 || maskNum > 32) {
    return { valid: false, error: 'Invalid mask (must be 0-32)' };
  }
  if (!isValidIPv4(ip)) {
    return { valid: false, error: 'Invalid IP address' };
  }
  return { valid: true };
}
