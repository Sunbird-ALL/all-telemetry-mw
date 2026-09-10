const { createHash } = require('crypto');
const http = require('http');
const https = require('https');

// jose v6 is ESM-only; callers already dynamically `await import('jose')`
// where needed. getEncryptionKey is async for the same reason.
async function getEncryptionKey() {
  const jose = await import('jose');
  const encKeyStr = process.env.JOSE_ENCRYPTION_PRIVATE_KEY_V3;
  if (encKeyStr) {
    return jose.base64url.decode(encKeyStr);
  }
  const secretKey = process.env.JOSE_SECRET_V3 || '';
  return createHash('sha256').update(secretKey).digest();
}

function getSigningKey() {
  const signinKeyStr = process.env.JOSE_SIGNIN_PRIVATE_KEY_V3 || '';
  return new TextEncoder().encode(signinKeyStr);
}

class AuthServiceUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'AuthServiceUnavailableError';
    this.cause = cause;
    this.code = cause && cause.code;
  }
}

function logAuthServiceEvent(event, fields) {
  console.error(
    JSON.stringify({
      level: 'error',
      event,
      ts: new Date().toISOString(),
      ...fields,
    }),
  );
}

function postJson(urlStr, body) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr);
      const data = JSON.stringify(body);
      const transport = url.protocol === 'https:' ? https : http;
      const req = transport.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
          },
        },
        (res) => {
          let responseBody = '';
          res.on('data', (chunk) => {
            responseBody += chunk;
          });
          res.on('end', () => {
            const statusCode = res.statusCode || 0;
            if (statusCode < 200 || statusCode >= 300) {
              logAuthServiceEvent('auth_service_unexpected_status', {
                url: urlStr,
                statusCode,
                bodySnippet: responseBody.slice(0, 200),
              });
              reject(
                new AuthServiceUnavailableError(
                  `Auth service responded with unexpected status ${statusCode}`,
                ),
              );
              return;
            }
            try {
              resolve(JSON.parse(responseBody));
            } catch (parseErr) {
              logAuthServiceEvent('auth_service_invalid_response', {
                url: urlStr,
                statusCode,
                bodySnippet: responseBody.slice(0, 200),
                error: parseErr.message,
              });
              reject(
                new AuthServiceUnavailableError(
                  'Auth service returned an invalid response',
                  parseErr,
                ),
              );
            }
          });
        },
      );
      req.on('error', (err) => {
        logAuthServiceEvent('auth_service_unreachable', {
          url: urlStr,
          errorCode: err.code || null,
          error: err.message,
        });
        reject(new AuthServiceUnavailableError('Auth service is unreachable', err));
      });
      req.write(data);
      req.end();
    } catch (err) {
      logAuthServiceEvent('auth_service_request_setup_failed', {
        url: urlStr,
        error: err.message,
      });
      reject(
        new AuthServiceUnavailableError(
          'Auth service request could not be constructed',
          err,
        ),
      );
    }
  });
}

// Checks whether `token` is the user's currently active session token, by asking
// axl-login-service's tokenStatus API directly. Strictly no local fallback: either
// axl-login-service answers true/false, or this throws AuthServiceUnavailableError.
async function checkTokenStatus(userId, token) {
  const loginServiceUrl = process.env.AXL_LOGIN_SERVICE_URL_V3 || '';

  try {
    const statusData = await postJson(loginServiceUrl, {
      user_id: Number(userId) || userId,
      token,
    });
    const isActive =
      statusData?.responseObj?.responseDataParams?.data?.isActive ??
      statusData?.data?.isActive ??
      statusData?.isActive ??
      false;
    return Boolean(isActive);
  } catch (err) {
    logAuthServiceEvent('auth_service_check_failed', {
      url: loginServiceUrl,
      userId,
      errorCode: err instanceof AuthServiceUnavailableError ? err.code || null : null,
      error: err.message,
    });
    if (err instanceof AuthServiceUnavailableError) {
      throw err;
    }
    throw new AuthServiceUnavailableError(
      'Not able to connect with axl-login-service',
      err,
    );
  }
}

module.exports = {
  getEncryptionKey,
  getSigningKey,
  AuthServiceUnavailableError,
  postJson,
  checkTokenStatus,
};
