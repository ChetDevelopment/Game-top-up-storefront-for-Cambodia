import { promises as dns } from "dns";

/**
 * A utility to check if an email domain is from a known disposable/temporary email provider.
 */
export const DISPOSABLE_DOMAINS = [
  "temp-mail.org",
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "sharklasers.com",
  "dispostable.com",
  "getnada.com",
  "boun.cr",
  "mohmal.com",
  "tempmail.net",
  "yopmail.com",
  "fakeinbox.com",
  "throwawaymail.com",
  "maildrop.cc",
  "trashmail.com",
  "temp-mail.io",
  "tempmailo.com",
  "temp-mail.com",
  "minutebox.com",
  "emailondeck.com",
  "internal-mail.com",
  "duck.com"
];

/**
 * Layer 1: Basic format and Disposable list check
 */
export function isFormatAndDomainValid(email: string): boolean {
  if (!email || !email.includes("@")) return false;
  
  const domain = email.split("@")[1].toLowerCase();
  
  // Check against disposable list
  if (DISPOSABLE_DOMAINS.includes(domain)) {
    return false;
  }
  
  // Basic Regex for email structure
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;

  return true;
}

/**
 * Layer 2: DNS MX Record Check
 * Verifies that the domain actually has a mail server.
 */
export async function isRealEmail(email: string): Promise<boolean> {
  // First, do the fast checks
  if (!isFormatAndDomainValid(email)) return false;

  const domain = email.split("@")[1].toLowerCase();

  // Common real domains can be white-listed to save DNS time
  const whiteList = ["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"];
  if (whiteList.includes(domain)) return true;

  try {
    // Look up Mail Exchange (MX) records
    const mxRecords = await dns.resolveMx(domain);
    return mxRecords && mxRecords.length > 0;
  } catch (error) {
    // If DNS lookup fails, the domain likely doesn't exist or can't receive mail
    return false;
  }
}
