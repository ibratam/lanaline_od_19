import { encrypt, decrypt, maskPassword } from '../../src/utils/encryption.js';

describe('Encryption Utilities', () => {
  const testSecretKey = 'a'.repeat(32); // 32-character secret key

  describe('encrypt() function', () => {
    it('should encrypt a string and return IV:encryptedText format', () => {
      const text = 'myPassword123';
      const encrypted = encrypt(text, testSecretKey);

      expect(encrypted).toContain(':');
      const [iv, ciphertext] = encrypted.split(':');
      expect(iv).toHaveLength(32); // 16 bytes in hex = 32 chars
      expect(ciphertext.length).toBeGreaterThan(0);
    });

    it('should produce different output for same input (due to random IV)', () => {
      const text = 'myPassword123';
      const encrypted1 = encrypt(text, testSecretKey);
      const encrypted2 = encrypt(text, testSecretKey);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should throw error if text is missing', () => {
      expect(() => encrypt(null, testSecretKey)).toThrow(
        'Text and secret key are required for encryption'
      );
    });

    it('should throw error if secret key is missing', () => {
      expect(() => encrypt('text', null)).toThrow(
        'Text and secret key are required for encryption'
      );
    });

    it('should throw error if text is empty string', () => {
      expect(() => encrypt('', testSecretKey)).toThrow(
        'Text and secret key are required for encryption'
      );
    });
  });

  describe('decrypt() function', () => {
    it('should decrypt an encrypted string back to original', () => {
      const originalText = 'myPassword123';
      const encrypted = encrypt(originalText, testSecretKey);
      const decrypted = decrypt(encrypted, testSecretKey);

      expect(decrypted).toBe(originalText);
    });

    it('should handle special characters', () => {
      const originalText = 'P@$$w0rd!#%&*()[]{}';
      const encrypted = encrypt(originalText, testSecretKey);
      const decrypted = decrypt(encrypted, testSecretKey);

      expect(decrypted).toBe(originalText);
    });

    it('should handle unicode characters', () => {
      const originalText = 'パスワード123🔐';
      const encrypted = encrypt(originalText, testSecretKey);
      const decrypted = decrypt(encrypted, testSecretKey);

      expect(decrypted).toBe(originalText);
    });

    it('should handle long strings', () => {
      const originalText = 'a'.repeat(1000);
      const encrypted = encrypt(originalText, testSecretKey);
      const decrypted = decrypt(encrypted, testSecretKey);

      expect(decrypted).toBe(originalText);
    });

    it('should throw error if encrypted text is missing', () => {
      expect(() => decrypt(null, testSecretKey)).toThrow(
        'Encrypted text and secret key are required for decryption'
      );
    });

    it('should throw error if secret key is missing', () => {
      const encrypted = encrypt('text', testSecretKey);
      expect(() => decrypt(encrypted, null)).toThrow(
        'Encrypted text and secret key are required for decryption'
      );
    });

    it('should throw error if encrypted text format is invalid', () => {
      expect(() => decrypt('invalidFormat', testSecretKey)).toThrow(
        'Invalid encrypted text format'
      );
    });

    it('should throw error if IV is missing', () => {
      expect(() => decrypt(':encryptedtext', testSecretKey)).toThrow(
        'Invalid encrypted text format'
      );
    });

    it('should throw error if encrypted portion is missing', () => {
      expect(() => decrypt('validiv:', testSecretKey)).toThrow(
        'Invalid encrypted text format'
      );
    });

    it('should fail to decrypt with wrong secret key', () => {
      const originalText = 'myPassword123';
      const encrypted = encrypt(originalText, testSecretKey);
      const wrongKey = 'b'.repeat(32);

      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });
  });

  describe('maskPassword() function', () => {
    it('should mask password showing first and last character', () => {
      const password = 'myPassword123';
      const masked = maskPassword(password);

      expect(masked).toMatch(/^m.*3$/);
      expect(masked).toContain('••••••••');
    });

    it('should return dots for short passwords', () => {
      const password = 'ab';
      const masked = maskPassword(password);

      expect(masked).toBe('a••••••••b');
    });

    it('should return all dots for single character', () => {
      const password = 'a';
      const masked = maskPassword(password);

      expect(masked).toBe('••••••••');
    });

    it('should return all dots for empty password', () => {
      const masked = maskPassword('');

      expect(masked).toBe('••••••••');
    });

    it('should return all dots for null password', () => {
      const masked = maskPassword(null);

      expect(masked).toBe('••••••••');
    });

    it('should return all dots for undefined password', () => {
      const masked = maskPassword(undefined);

      expect(masked).toBe('••••••••');
    });

    it('should handle special characters in password', () => {
      const password = 'P@$$w0rd!';
      const masked = maskPassword(password);

      expect(masked).toMatch(/^P.*!$/);
      expect(masked).toContain('•••••••');
    });

    it('should maintain consistent length with dots', () => {
      const password = 'myPassword123';
      const masked = maskPassword(password);

      expect(masked.length).toBe(10); // first + 8 dots + last
    });
  });

  describe('Encryption roundtrip with various keys', () => {
    it('should work with 32-character key', () => {
      const key = 'x'.repeat(32);
      const text = 'test';
      const encrypted = encrypt(text, key);
      const decrypted = decrypt(encrypted, key);

      expect(decrypted).toBe(text);
    });

    it('should work with longer key (uses only hash)', () => {
      const key = 'this is a very long key that is more than 32 characters';
      const text = 'test';
      const encrypted = encrypt(text, key);
      const decrypted = decrypt(encrypted, key);

      expect(decrypted).toBe(text);
    });

    it('should work with shortest valid key', () => {
      const key = '1'; // Gets hashed, so key length requirement is flexible
      const text = 'test';
      const encrypted = encrypt(text, key);
      const decrypted = decrypt(encrypted, key);

      expect(decrypted).toBe(text);
    });
  });
});
