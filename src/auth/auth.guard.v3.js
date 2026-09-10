require('dotenv').config();
const {
  AuthServiceUnavailableError,
  checkTokenStatus,
  getEncryptionKey,
  getSigningKey,
} = require('./authHelper');

// Polyfill for jose in Node.js (CommonJS)
if (!globalThis.crypto) {
  const { webcrypto } = require('crypto');
  globalThis.crypto = webcrypto;
}

class JwtAuthGuard {
  constructor() {}

  async canActivate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: 'Authorization header missing' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
      return res.status(401).json({ message: 'Invalid authorization header format' });
    }
    const token = parts[1];

    try {
      const { jwtDecrypt, jwtVerify } = await import('jose');

      // Step 1: Decrypt outer JWE token using shared encryption key
      const encryptionKey = await getEncryptionKey();
      const { payload: decryptedPayload } = await jwtDecrypt(token, encryptionKey);

      if (!decryptedPayload.jwtSignedToken) {
        return res.status(401).json({ message: 'jwtSignedToken not found in decrypted payload' });
      }

      // Step 2: Verify inner JWS signature
      const signinKey = getSigningKey();
      const jwtSignedToken = String(decryptedPayload.jwtSignedToken);
      const { payload: verifiedPayload } = await jwtVerify(jwtSignedToken, signinKey);

      // Step 3: Validate expiration and virtual_id
      const { exp } = verifiedPayload;
      const virtualId = verifiedPayload.virtualId ?? verifiedPayload.virtual_id;

      if (!exp || exp <= Math.floor(Date.now() / 1000)) {
        return res.status(401).json({ message: 'Token expired' });
      }

      if (!virtualId || (typeof virtualId !== 'string' && typeof virtualId !== 'number')) {
        return res.status(401).json({ message: 'Missing virtual_id in token payload' });
      }

      // Step 4: Verify active token status — strictly no fallback
      let isActive;
      try {
        isActive = await checkTokenStatus(virtualId, token);
      } catch (statusError) {
        if (statusError instanceof AuthServiceUnavailableError) {
          return res.status(503).json({ message: 'Not able to connect with axl-login-service' });
        }
        throw statusError;
      }

      if (!isActive) {
        return res.status(401).json({ message: 'User is logged out' });
      }

      req.user = { ...verifiedPayload, virtualId, virtual_id: virtualId };
      next();
    } catch (err) {
      console.error('JWT error:', err);
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  }
}

module.exports = new JwtAuthGuard();
