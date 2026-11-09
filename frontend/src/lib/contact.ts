/**
 * Rules for the optional contact address a person can choose to share.
 *
 * A login email is private. People who want to be reachable pick a separate contact
 * address and turn sharing on (see supabase/contact_sharing.sql, which enforces the
 * same rules in the database).
 */
export const CONTACT_EMAIL_MAX_LENGTH = 254;
const CONTACT_EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Trims and lower-cases an address; blank input means "no contact email". */
export function normalizeContactEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email === "" ? null : email;
}

/** An error message for an unusable address, or null when it is fine (a blank address is fine). */
export function contactEmailError(value: string): string | null {
  const email = normalizeContactEmail(value);
  if (email === null) return null;
  if (email.length > CONTACT_EMAIL_MAX_LENGTH || !CONTACT_EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address, or leave it blank.";
  }
  return null;
}