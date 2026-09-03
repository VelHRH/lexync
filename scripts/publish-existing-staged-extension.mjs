import { createSign } from 'node:crypto';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const API_BASE_URL = 'https://chromewebstore.googleapis.com/v2';
const CHROME_WEB_STORE_SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const revisionStatusNames = [
  'submittedItemRevisionStatus',
  'publishedItemRevisionStatus',
];
const requiredEnvironment = [
  'CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL',
  'CHROME_SERVICE_ACCOUNT_PRIVATE_KEY',
  'CHROME_PUBLISHER_ID',
  'CHROME_EXTENSION_ID',
];

class PublicationError extends Error {}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function parseArguments(argumentsList) {
  let mode;
  let expectedVersion;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument === '--status' || argument === '--publish') {
      if (mode) {
        throw new PublicationError('Choose exactly one of --status or --publish');
      }
      mode = argument.slice(2);
      continue;
    }

    if (argument === '--expected-version') {
      const value = argumentsList[index + 1];
      if (!value || value.startsWith('--') || expectedVersion) {
        throw new PublicationError('Expected --expected-version followed by one version');
      }
      expectedVersion = value;
      index += 1;
      continue;
    }

    throw new PublicationError(`Invalid argument: ${argument}`);
  }

  if (!mode || !expectedVersion) {
    throw new PublicationError('Usage: --status|--publish --expected-version <version>');
  }

  return { expectedVersion, mode };
}

function requireEnvironment() {
  const values = {};

  for (const name of requiredEnvironment) {
    const value = process.env[name];
    if (!value) {
      throw new PublicationError(`Missing required environment variable: ${name}`);
    }
    values[name] = value;
  }

  return values;
}

function validateVersion(version) {
  const components = version.split('.');
  const valid = components.length >= 1
    && components.length <= 4
    && components.every((component) => /^(0|[1-9]\d*)$/.test(component) && Number(component) <= 65535)
    && components.some((component) => Number(component) !== 0);

  if (!valid) {
    throw new PublicationError(`Invalid expected extension version: ${version}`);
  }
}

function createJwt(clientEmail, privateKey) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const claims = encode({
    iss: clientEmail,
    scope: CHROME_WEB_STORE_SCOPE,
    aud: TOKEN_ENDPOINT,
    iat: issuedAt,
    exp: issuedAt + 3600,
  });
  const signingInput = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();

  return `${signingInput}.${signer.sign(privateKey, 'base64url')}`;
}

async function parseJson(response, description) {
  if (!response.ok) {
    throw new PublicationError(`${description} failed with HTTP status ${response.status}`);
  }

  try {
    return await response.json();
  } catch {
    throw new PublicationError(`${description} returned invalid JSON`);
  }
}

async function requestAccessToken(clientEmail, privateKey) {
  let response;

  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: createJwt(clientEmail, privateKey),
      }),
    });
  } catch {
    throw new PublicationError('Token request failed');
  }

  const tokenResponse = await parseJson(response, 'Token request');
  if (!tokenResponse || typeof tokenResponse.access_token !== 'string' || !tokenResponse.access_token) {
    throw new PublicationError('Token response is missing an access token');
  }

  return tokenResponse.access_token;
}

function itemUrl(publisherId, extensionId, operation) {
  return `${API_BASE_URL}/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}:${operation}`;
}

async function fetchStatus(accessToken, publisherId, extensionId) {
  let response;

  try {
    response = await fetch(itemUrl(publisherId, extensionId, 'fetchStatus'), {
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new PublicationError('Chrome Web Store status request failed');
  }

  return parseJson(response, 'Chrome Web Store status request');
}

async function publishStaged(accessToken, publisherId, extensionId) {
  let response;

  try {
    response = await fetch(itemUrl(publisherId, extensionId, 'publish'), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ publishType: 'STAGED_PUBLISH' }),
    });
  } catch {
    throw new PublicationError('Chrome Web Store publish request failed');
  }

  await parseJson(response, 'Chrome Web Store publish request');
}

function validateRevisionStatus(status, name) {
  const revision = status[name];
  if (revision === undefined) {
    return undefined;
  }

  if (!revision || typeof revision !== 'object' || Array.isArray(revision)) {
    throw new PublicationError(`Chrome Web Store status has an invalid ${name}`);
  }

  if (typeof revision.state !== 'string' || !revision.state) {
    throw new PublicationError(`Chrome Web Store status has an invalid ${name} state`);
  }

  if (!Array.isArray(revision.distributionChannels) || revision.distributionChannels.length === 0) {
    throw new PublicationError(`Chrome Web Store status is missing ${name} distributionChannels`);
  }

  const versions = revision.distributionChannels.map((channel) => channel?.crxVersion);
  if (versions.some((version) => typeof version !== 'string' || !version)) {
    throw new PublicationError(`Chrome Web Store status has invalid ${name} versions`);
  }

  return { revision, versions };
}

function validateStatusSchema(status) {
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    throw new PublicationError('Chrome Web Store status has an invalid schema');
  }

  let validRevisionCount = 0;
  for (const name of revisionStatusNames) {
    if (validateRevisionStatus(status, name)) {
      validRevisionCount += 1;
    }
  }

  if (validRevisionCount === 0) {
    throw new PublicationError('Chrome Web Store status has no valid revision status');
  }
}

function validateStagedStatus(status, expectedVersion) {
  validateStatusSchema(status);
  const submittedStatus = validateRevisionStatus(status, 'submittedItemRevisionStatus');
  if (!submittedStatus) {
    throw new PublicationError('Chrome Web Store status is missing submittedItemRevisionStatus');
  }
  const { revision: submitted, versions } = submittedStatus;

  if (submitted.state !== 'STAGED') {
    throw new PublicationError(`Submitted revision is not STAGED (state: ${String(submitted.state ?? 'missing')})`);
  }

  if (versions.some((version) => version !== expectedVersion)) {
    throw new PublicationError('Submitted revision version does not match expected version');
  }
}

function validatePublishedStatus(status, expectedVersion) {
  validateStatusSchema(status);
  const publishedStatus = validateRevisionStatus(status, 'publishedItemRevisionStatus');
  if (!publishedStatus) {
    throw new PublicationError('Chrome Web Store status is missing publishedItemRevisionStatus');
  }

  if (publishedStatus.revision.state !== 'PUBLISHED') {
    throw new PublicationError(`Published revision is not PUBLISHED (state: ${publishedStatus.revision.state})`);
  }

  if (publishedStatus.versions.some((version) => version !== expectedVersion)) {
    throw new PublicationError('Published revision version does not match expected version');
  }
}

function printStatus(label, status) {
  process.stdout.write(`${label}\n${JSON.stringify(status, null, 2)}\n`);
}

let options;

try {
  options = parseArguments(process.argv.slice(2));
  validateVersion(options.expectedVersion);
  const environment = requireEnvironment();
  const privateKey = environment.CHROME_SERVICE_ACCOUNT_PRIVATE_KEY.replaceAll('\\n', '\n');
  const accessToken = await requestAccessToken(
    environment.CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL,
    privateKey,
  );
  const status = await fetchStatus(
    accessToken,
    environment.CHROME_PUBLISHER_ID,
    environment.CHROME_EXTENSION_ID,
  );

  if (options.mode === 'status') {
    validateStatusSchema(status);
    printStatus('Chrome Web Store status:', status);
  } else {
    validateStagedStatus(status, options.expectedVersion);
    printStatus('Pre-publish status:', status);
    await publishStaged(
      accessToken,
      environment.CHROME_PUBLISHER_ID,
      environment.CHROME_EXTENSION_ID,
    );
    const postPublishStatus = await fetchStatus(
      accessToken,
      environment.CHROME_PUBLISHER_ID,
      environment.CHROME_EXTENSION_ID,
    );
    validatePublishedStatus(postPublishStatus, options.expectedVersion);
    printStatus('Post-publish status:', postPublishStatus);
  }
} catch (error) {
  fail(error instanceof PublicationError ? error.message : 'Publication helper failed');
}
