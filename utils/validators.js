/**
 * Centralized Form & Security Validators for EvacWar
 * 
 * Rules:
 * 1. Phone Number: Strictly Philippine mobile number starting with "09" and exactly 11 digits (^09\d{9}$).
 * 2. Zone: Must be one of the official Barangay San Rafael zones (Zone 1 to Zone 7).
 * 3. Password: Minimum 8 characters, containing both letters and numbers.
 */

const VALID_ZONES = Object.freeze([
  'Zone 1',
  'Zone 2',
  'Zone 3',
  'Zone 4',
  'Zone 5',
  'Zone 6',
  'Zone 7'
]);

/**
 * Validates strictly 11-digit Philippine mobile numbers starting with '09'.
 * Rejects symbols, spaces, hyphens, non-09 prefixes, letters, and invalid lengths.
 * 
 * @param {string|number} phone 
 * @returns {boolean}
 */
function isValidPhoneNumber(phone) {
  if (phone === null || phone === undefined) return false;
  const str = String(phone).trim();
  // Strictly require starting with '09' and followed by exactly 9 digits (total 11 digits)
  return /^09\d{9}$/.test(str);
}

const PHONE_ERROR_MESSAGE = 'Mobile number must be a valid 11-digit Philippine number starting with 09 (e.g. 09123456789).';

/**
 * Validates that the selected zone is one of the valid Barangay San Rafael zones.
 * 
 * @param {string} zone 
 * @returns {boolean}
 */
function isValidZone(zone) {
  if (!zone || typeof zone !== 'string') return false;
  const trimmed = zone.trim();
  return VALID_ZONES.includes(trimmed);
}

const ZONE_ERROR_MESSAGE = 'Please select a valid Barangay Zone from the dropdown (Zone 1 to Zone 7).';

/**
 * Validates password strength:
 * - At least 8 characters
 * - Contains at least one letter (a-z, A-Z)
 * - Contains at least one number (0-9)
 * - Rejects purely numeric or purely alphabetic passwords
 * 
 * @param {string} password 
 * @returns {boolean}
 */
function isValidPassword(password) {
  if (!password || typeof password !== 'string') return false;
  if (password.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasLetter && hasNumber;
}

const PASSWORD_ERROR_MESSAGE = 'Password must be at least 8 characters long and contain both letters and numbers.';

module.exports = {
  VALID_ZONES,
  isValidPhoneNumber,
  PHONE_ERROR_MESSAGE,
  isValidZone,
  ZONE_ERROR_MESSAGE,
  isValidPassword,
  PASSWORD_ERROR_MESSAGE
};
