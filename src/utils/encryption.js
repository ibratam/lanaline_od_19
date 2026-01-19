import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypts a string using AES-256-CBC
 * @param {string} text - Text to encrypt
 * @param {string} secretKey - Encryption key (min 32 characters)
 * @returns {string} - IV:encryptedText in hex format
 */
export function encrypt(text, secretKey) {
  if (!text || !secretKey) {
    throw new Error('Text and secret key are required for encryption');
  }

  // Use only first 32 characters of secret key
  const key = crypto
    .createHash('sha256')
    .update(secretKey)
    .digest();

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Prepend IV to ciphertext for decryption
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string encrypted with encrypt()
 * @param {string} encryptedText - Encrypted text in IV:encryptedText format
 * @param {string} secretKey - Encryption key (same as used for encryption)
 * @returns {string} - Decrypted text
 */
export function decrypt(encryptedText, secretKey) {
  if (!encryptedText || !secretKey) {
    throw new Error('Encrypted text and secret key are required for decryption');
  }

  const [ivHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted text format');
  }

  const key = crypto
    .createHash('sha256')
    .update(secretKey)
    .digest();

  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Masks a password for display (shows first and last char, hides middle)
 * @param {string} password - Password to mask
 * @returns {string} - Masked password
 */
export function maskPassword(password) {
  if (!password || password.length < 2) {
    return '••••••••';
  }
  const first = password.charAt(0);
  const last = password.charAt(password.length - 1);
  return `${first}••••••••${last}`;
}
