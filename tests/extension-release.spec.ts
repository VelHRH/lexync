import { execFile } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

const execFileAsync = promisify(execFile);

async function createExtensionFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'lexync-extension-release-'));
  const source = path.join(root, 'extension');
  const baseline = path.join(root, 'manifest-permissions.json');

  await mkdir(path.join(source, 'icons'), { recursive: true });
  await writeFile(path.join(source, 'background.js'), 'globalThis.lexync = true;\n');
  await writeFile(path.join(source, 'icons/icon-16.png'), 'icon');
  await writeFile(path.join(source, 'popup.html'), '<!doctype html><title>Lexync</title>\n');
  await writeFile(path.join(source, 'manifest.json'), `${JSON.stringify({
    manifest_version: 3,
    name: 'Lexync',
    version: '1.2.3',
    permissions: ['activeTab', 'storage'],
    host_permissions: ['https://example.supabase.co/*'],
    icons: { 16: 'icons/icon-16.png' },
    action: { default_popup: 'popup.html' },
    background: { service_worker: 'background.js' },
  }, null, 2)}\n`);
  await writeFile(baseline, `${JSON.stringify({
    permissions: ['activeTab', 'storage'],
    hostPermissions: ['https://example.supabase.co/*'],
    optionalPermissions: [],
    optionalHostPermissions: [],
    contentScriptMatches: [],
    webAccessibleResourceMatches: [],
    externallyConnectableMatches: [],
  }, null, 2)}\n`);

  return { baseline, root, source };
}

async function packageExtension(source: string, output: string, baseline: string) {
  return execFileAsync(process.execPath, [
    'scripts/package-extension.mjs',
    '--source', source,
    '--output', output,
    '--permissions', baseline,
  ], { cwd: path.resolve('.') });
}

type ReleaseMetadata = {
  schemaVersion: number;
  manifestVersion: string;
  commitSha: string;
  zipFilename: string;
  sha256: string;
  chromeListingId: string;
};

async function createReleaseFixture() {
  const fixture = await createExtensionFixture();
  const commitSha = '0123456789abcdef0123456789abcdef01234567';
  const chromeListingId = 'lexync-chrome-listing';
  const zipFilename = 'lexync-chromium-extension-v1.2.3.zip';
  const artifact = path.join(fixture.root, zipFilename);
  const metadataPath = path.join(fixture.root, 'release-metadata.json');

  await packageExtension(fixture.source, artifact, fixture.baseline);
  const sha256 = createHash('sha256').update(await readFile(artifact)).digest('hex');
  const metadata: ReleaseMetadata = {
    schemaVersion: 1,
    manifestVersion: '1.2.3',
    commitSha,
    zipFilename,
    sha256,
    chromeListingId,
  };
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return { ...fixture, artifact, chromeListingId, commitSha, metadata, metadataPath };
}

async function validateRelease(
  fixture: Awaited<ReturnType<typeof createReleaseFixture>>,
  overrides: {
    metadata?: Partial<ReleaseMetadata>;
    tag?: string;
    expectedCommit?: string;
    expectedChromeListingId?: string;
    githubReleaseVersions?: string;
    chromeWebStoreVersions?: string;
  } = {},
) {
  const metadata = { ...fixture.metadata, ...overrides.metadata };
  await writeFile(fixture.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

  return execFileAsync(process.execPath, [
    'scripts/validate-extension-release.mjs',
    '--artifact', fixture.artifact,
    '--metadata', fixture.metadataPath,
    '--tag', overrides.tag ?? 'v1.2.3',
    '--expected-commit', overrides.expectedCommit ?? fixture.commitSha,
    '--expected-chrome-listing-id', overrides.expectedChromeListingId ?? fixture.chromeListingId,
    '--github-release-versions', overrides.githubReleaseVersions ?? '1.2.2',
    '--chrome-web-store-versions', overrides.chromeWebStoreVersions ?? '1.2.2',
  ], { cwd: path.resolve('.') });
}

async function readRepositoryFile(relativePath: string) {
  return readFile(path.resolve(relativePath), 'utf8');
}

type PublicationResponse = {
  status?: number;
  body: unknown;
};

async function createPublicationFixture(responses: PublicationResponse[]) {
  const root = await mkdtemp(path.join(tmpdir(), 'lexync-extension-publication-'));
  const preload = path.join(root, 'fetch-preload.mjs');
  const requests = path.join(root, 'requests.json');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  await writeFile(preload, `import { writeFileSync } from 'node:fs';

const calls = [];
const responses = JSON.parse(process.env.LEXYNC_TEST_RESPONSES ?? '[]');

globalThis.fetch = async (input, init = {}) => {
  calls.push({
    url: String(input),
    method: init.method ?? 'GET',
    headers: init.headers ?? {},
    body: init.body ?? null,
  });
  const response = responses[calls.length - 1] ?? { status: 500, body: {} };
  return new Response(JSON.stringify(response.body), {
    status: response.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
};

process.on('exit', () => writeFileSync(process.env.LEXYNC_TEST_REQUESTS, JSON.stringify(calls)));
`);

  return {
    env: {
      CHROME_EXTENSION_ID: 'test-extension',
      CHROME_PUBLISHER_ID: 'test-publisher',
      CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL: 'test-service-account@example.iam.gserviceaccount.com',
      CHROME_SERVICE_ACCOUNT_PRIVATE_KEY: privateKeyPem.replaceAll('\n', '\\n'),
      LEXYNC_TEST_REQUESTS: requests,
      LEXYNC_TEST_RESPONSES: JSON.stringify(responses),
    },
    preload,
    requests,
    root,
  };
}

async function runPublication(
  fixture: Awaited<ReturnType<typeof createPublicationFixture>>,
  mode: 'status' | 'publish',
  expectedVersion = '1.2.3',
) {
  return execFileAsync(process.execPath, [
    '--import', fixture.preload,
    'scripts/publish-existing-staged-extension.mjs',
    `--${mode}`,
    '--expected-version', expectedVersion,
  ], {
    cwd: path.resolve('.'),
    env: { ...process.env, ...fixture.env },
  });
}

async function readPublicationRequests(fixture: Awaited<ReturnType<typeof createPublicationFixture>>) {
  return JSON.parse(await readFile(fixture.requests, 'utf8')) as Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string | null;
  }>;
}

test.describe('Chromium extension release artifact', () => {
  test('creates a byte-identical ZIP from the same validated build', async () => {
    const fixture = await createExtensionFixture();

    try {
      const first = path.join(fixture.root, 'first.zip');
      const second = path.join(fixture.root, 'second.zip');

      await packageExtension(fixture.source, first, fixture.baseline);
      await packageExtension(fixture.source, second, fixture.baseline);

      const firstArchive = await readFile(first);
      const secondArchive = await readFile(second);

      expect(firstArchive.subarray(0, 2).toString()).toBe('PK');
      expect(createHash('sha256').update(firstArchive).digest('hex')).toBe(
        createHash('sha256').update(secondArchive).digest('hex'),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test('accepts an exact CI ZIP when release metadata and operator inputs agree', async () => {
    const fixture = await createReleaseFixture();

    try {
      const result = await validateRelease(fixture);

      expect(result.stdout).toMatch(/valid/i);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test.describe('release validation rejection contracts', () => {
    const cases: Array<{
      name: string;
      options: Parameters<typeof validateRelease>[1];
      message: string;
    }> = [
      {
        name: 'checksum mismatch',
        options: { metadata: { sha256: '0'.repeat(64) } },
        message: 'Checksum mismatch',
      },
      {
        name: 'missing required metadata',
        options: { metadata: { chromeListingId: undefined as unknown as string } },
        message: 'Missing required metadata',
      },
      {
        name: 'tag and manifest version mismatch',
        options: { tag: 'v9.9.9' },
        message: 'Tag version does not match manifest version',
      },
      {
        name: 'reused GitHub release version',
        options: { githubReleaseVersions: '1.2.3,1.2.2' },
        message: 'GitHub release version already exists',
      },
      {
        name: 'reused Chrome Web Store version',
        options: { chromeWebStoreVersions: '1.2.3,1.2.2' },
        message: 'Chrome Web Store version already exists',
      },
      {
        name: 'commit mismatch',
        options: { expectedCommit: 'fedcba9876543210fedcba9876543210fedcba98' },
        message: 'Commit SHA mismatch',
      },
      {
        name: 'configured Chrome listing identity mismatch',
        options: { expectedChromeListingId: 'different-chrome-listing' },
        message: 'Chrome Web Store listing ID mismatch',
      },
    ];

    for (const rejection of cases) {
      test(`rejects ${rejection.name}`, async () => {
        const fixture = await createReleaseFixture();

        try {
          await expect(validateRelease(fixture, rejection.options)).rejects.toMatchObject({
            stderr: expect.stringContaining(rejection.message),
          });
        } finally {
          await rm(fixture.root, { recursive: true, force: true });
        }
      });
    }
  });

  test('defines the protected staged release workflow contract', async () => {
    const workflow = await readRepositoryFile('.github/workflows/extension-release.yml');

    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/inputs:[\s\S]*tag:/);
    expect(workflow).toMatch(/inputs:[\s\S]*run[_-]?id:/);
    expect(workflow).toMatch(/concurrency:[\s\S]*group:[^\n]*inputs\.tag/);
    expect(workflow).toMatch(/concurrency:[\s\S]*cancel-in-progress:\s*false/);
    expect(workflow).toMatch(/actions\/download-artifact@[^\n]*[\s\S]*name:\s*lexync-chromium-extension/);
    expect(workflow).toMatch(/run[_-]?id:\s*\$\{\{\s*inputs\.(?:run[_-]?id|ci[_-]?run[_-]?id)\s*\}\}/);
    expect(workflow).toMatch(/validate-extension-release/);
    expect(workflow).toMatch(/--metadata|release-metadata/i);
    expect(workflow).toMatch(/--artifact|\.zip/i);
    expect(workflow).toMatch(/expected[-_]commit|commit[-_]sha/i);
    expect(workflow).toMatch(/environment:\s*chrome-web-store/);
    expect(workflow).toMatch(/\$\{\{\s*secrets\.CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL\s*\}\}/);
    expect(workflow).toMatch(/\$\{\{\s*secrets\.CHROME_SERVICE_ACCOUNT_PRIVATE_KEY\s*\}\}/);
    expect(workflow.match(/\$\{\{\s*secrets\.[A-Z0-9_]+\s*\}\}/gi) ?? []).toHaveLength(2);
    expect(workflow).toMatch(/\$\{\{\s*vars\.CHROME_EXTENSION_ID\s*\}\}/);
    expect(workflow).toMatch(/\$\{\{\s*vars\.CHROME_PUBLISHER_ID\s*\}\}/);
    expect(workflow).toMatch(/wxt[^\n]*(?:--dry-run|dry-run)/i);
    expect(workflow).not.toMatch(/(?:pnpm\s+)?(?:exec\s+)?wxt\s+build/i);
    expect(workflow).not.toMatch(/pnpm\s+(?:run\s+)?build|extension:package/i);
    expect(workflow).toMatch(/chromewebstore\.googleapis\.com|Chrome Web Store API v2|API v2/i);
    expect(workflow).toMatch(/STAGED_PUBLISH/);
    expect(workflow).not.toMatch(/SKIP_REVIEW|PUBLISH_NOW|IMMEDIATE_PUBLISH|publish immediately/i);
    expect(workflow).toMatch(/gh release create|GitHub Release/i);
    expect(workflow).toMatch(/sha256|checksum/i);
    expect(workflow).toMatch(/provenance|commit sha|commit_sha/i);
    expect(workflow).toMatch(/release notes|generate-notes|notes/i);
  });

  test('packages the release artifact from production extension configuration', async () => {
    const workflow = await readRepositoryFile('.github/workflows/ci.yml');
    const browserTests = workflow.indexOf('pnpm exec playwright test');
    const productionBuild = workflow.indexOf('name: Build production extension artifact');
    const packaging = workflow.indexOf('pnpm extension:package');

    expect(workflow).toMatch(/WXT_PUBLIC_SUPABASE_URL:\s*\$\{\{\s*vars\.EXTENSION_SUPABASE_URL\s*\}\}/);
    expect(workflow).toMatch(/WXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:\s*\$\{\{\s*vars\.EXTENSION_SUPABASE_PUBLISHABLE_KEY\s*\}\}/);
    expect(workflow).toMatch(/WXT_PUBLIC_WEB_URL:\s*\$\{\{\s*vars\.EXTENSION_WEB_URL\s*\}\}/);
    expect(browserTests).toBeGreaterThan(-1);
    expect(productionBuild).toBeGreaterThan(browserTests);
    expect(packaging).toBeGreaterThan(productionBuild);
  });

  test('defines a separate explicit staged-publication workflow contract', async () => {
    const workflow = await readRepositoryFile('.github/workflows/extension-publish.yml');

    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/inputs:[\s\S]*(?:action|publish)/i);
    expect(workflow).toMatch(/environment:\s*chrome-web-store/);
    expect(workflow).toMatch(/status|approved/i);
    expect(workflow).toMatch(/expected[-_ ]version|version/i);
    expect(workflow).toMatch(/scripts\/publish-[^\n]*(?:staged|existing)/i);
    expect(workflow).not.toMatch(/upload|artifact.*zip|\.zip.*upload/i);
    expect(workflow).toMatch(/post[-_ ]publish|published status|status after publish/i);
  });

  test('documents protected release setup, smoke checks, and rollback distinctions', async () => {
    const documentation = await readRepositoryFile('docs/extension-release.md');

    expect(documentation).toMatch(/protected environment/i);
    expect(documentation).toMatch(/reviewer|approval/i);
    expect(documentation).toMatch(/secret|variable/i);
    expect(documentation).toMatch(/CHROME_EXTENSION_ID/);
    expect(documentation).toMatch(/CHROME_PUBLISHER_ID/);
    expect(documentation).toMatch(/CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL/);
    expect(documentation).toMatch(/CHROME_SERVICE_ACCOUNT_PRIVATE_KEY/);
    expect(documentation).not.toMatch(/CHROME_CLIENT_ID|CHROME_CLIENT_SECRET|CHROME_REFRESH_TOKEN|CHROME_LISTING_ID/);
    expect(documentation).toMatch(/production smoke/i);
    expect(documentation).toMatch(/install/i);
    expect(documentation).toMatch(/sign in|capture|sync/i);
    expect(documentation).toMatch(/rollback/i);
    expect(documentation).toMatch(/pending review[\s\S]*(?:cancel|cancell)|cancel[\s\S]*pending review/i);
    expect(documentation).toMatch(/staged[\s\S]*(?:withhold|hold)|(?:withhold|hold)[\s\S]*staged/i);
    expect(documentation).toMatch(/public defect[\s\S]*(?:known-good|higher version)|known-good[\s\S]*(?:higher version|public defect)/i);
  });

  test('reports a valid published status without requiring a submitted revision', async () => {
    const fixture = await createPublicationFixture([
      { body: { access_token: 'fake-access-token' } },
      {
        body: {
          publishedItemRevisionStatus: {
            state: 'PUBLISHED',
            distributionChannels: [{ crxVersion: '1.2.3' }],
          },
        },
      },
    ]);

    try {
      const result = await runPublication(fixture, 'status');
      const requests = await readPublicationRequests(fixture);

      expect(result.stdout).toContain('PUBLISHED');
      expect(result.stdout).toContain('1.2.3');
      expect(requests.map((request) => request.url)).toEqual([
        'https://oauth2.googleapis.com/token',
        'https://chromewebstore.googleapis.com/v2/publishers/test-publisher/items/test-extension:fetchStatus',
      ]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test('publishes a matching staged revision without uploading an artifact', async () => {
    const fixture = await createPublicationFixture([
      { body: { access_token: 'fake-access-token' } },
      {
        body: {
          submittedItemRevisionStatus: {
            state: 'STAGED',
            distributionChannels: [{ crxVersion: '1.2.3' }],
          },
        },
      },
      { body: { publishedItemRevisionStatus: { state: 'PUBLISHED' } } },
      {
        body: {
          publishedItemRevisionStatus: {
            state: 'PUBLISHED',
            distributionChannels: [{ crxVersion: '1.2.3' }],
          },
        },
      },
    ]);

    try {
      const result = await runPublication(fixture, 'publish');
      const requests = await readPublicationRequests(fixture);

      expect(result.stdout).toContain('Post-publish status');
      expect(requests.map((request) => request.url)).toEqual([
        'https://oauth2.googleapis.com/token',
        'https://chromewebstore.googleapis.com/v2/publishers/test-publisher/items/test-extension:fetchStatus',
        'https://chromewebstore.googleapis.com/v2/publishers/test-publisher/items/test-extension:publish',
        'https://chromewebstore.googleapis.com/v2/publishers/test-publisher/items/test-extension:fetchStatus',
      ]);
      expect(requests.some((request) => /upload/i.test(request.url))).toBe(false);
      expect(JSON.parse(requests[2].body ?? '')).toEqual({ publishType: 'STAGED_PUBLISH' });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  test.describe('staged publication postconditions', () => {
    const cases = [
      {
        name: 'a non-PUBLISHED post-publish state',
        published: { state: 'PENDING_REVIEW', distributionChannels: [{ crxVersion: '1.2.3' }] },
        message: 'Published revision is not PUBLISHED',
      },
      {
        name: 'a mismatched post-publish version',
        published: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '9.9.9' }] },
        message: 'Published revision version does not match expected version',
      },
    ];

    for (const publicationCase of cases) {
      test(`rejects after the publish request when ${publicationCase.name}`, async () => {
        const fixture = await createPublicationFixture([
          { body: { access_token: 'fake-access-token' } },
          {
            body: {
              submittedItemRevisionStatus: {
                state: 'STAGED',
                distributionChannels: [{ crxVersion: '1.2.3' }],
              },
            },
          },
          { body: { publishedItemRevisionStatus: { state: 'PUBLISHED' } } },
          { body: { publishedItemRevisionStatus: publicationCase.published } },
        ]);

        try {
          await expect(runPublication(fixture, 'publish')).rejects.toMatchObject({
            stderr: expect.stringContaining(publicationCase.message),
          });
          const requests = await readPublicationRequests(fixture);

          expect(requests.map((request) => request.url)).toEqual([
            'https://oauth2.googleapis.com/token',
            'https://chromewebstore.googleapis.com/v2/publishers/test-publisher/items/test-extension:fetchStatus',
            'https://chromewebstore.googleapis.com/v2/publishers/test-publisher/items/test-extension:publish',
            'https://chromewebstore.googleapis.com/v2/publishers/test-publisher/items/test-extension:fetchStatus',
          ]);
        } finally {
          await rm(fixture.root, { recursive: true, force: true });
        }
      });
    }
  });

  test.describe('staged publication preconditions', () => {
    const cases = [
      {
        name: 'non-STAGED submitted state',
        submitted: { state: 'PENDING_REVIEW', distributionChannels: [{ crxVersion: '1.2.3' }] },
        message: 'not STAGED',
      },
      {
        name: 'mismatched submitted version',
        submitted: { state: 'STAGED', distributionChannels: [{ crxVersion: '9.9.9' }] },
        message: 'version does not match expected version',
      },
    ];

    for (const publicationCase of cases) {
      test(`rejects ${publicationCase.name} before publishing`, async () => {
        const fixture = await createPublicationFixture([
          { body: { access_token: 'fake-access-token' } },
          { body: { submittedItemRevisionStatus: publicationCase.submitted } },
        ]);

        try {
          await expect(runPublication(fixture, 'publish')).rejects.toMatchObject({
            stderr: expect.stringContaining(publicationCase.message),
          });
          const requests = await readPublicationRequests(fixture);

          expect(requests.map((request) => request.url)).toEqual([
            'https://oauth2.googleapis.com/token',
            'https://chromewebstore.googleapis.com/v2/publishers/test-publisher/items/test-extension:fetchStatus',
          ]);
        } finally {
          await rm(fixture.root, { recursive: true, force: true });
        }
      });
    }
  });

  test('rejects invalid versions, missing assets, permission drift, and secret credentials', async () => {
    const fixture = await createExtensionFixture();

    try {
      const output = path.join(fixture.root, 'extension.zip');
      const manifestPath = path.join(fixture.source, 'manifest.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        version: string;
        permissions: string[];
        optional_host_permissions?: string[];
      };

      manifest.version = '1.02.3';
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await expect(packageExtension(fixture.source, output, fixture.baseline)).rejects.toMatchObject({
        stderr: expect.stringContaining('Invalid extension version'),
      });

      manifest.version = '1.2.3';
      manifest.permissions.push('bookmarks');
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await expect(packageExtension(fixture.source, output, fixture.baseline)).rejects.toMatchObject({
        stderr: expect.stringContaining('Manifest permissions differ'),
      });

      manifest.permissions.pop();
      manifest.optional_host_permissions = ['https://unexpected.example/*'];
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await expect(packageExtension(fixture.source, output, fixture.baseline)).rejects.toMatchObject({
        stderr: expect.stringContaining('Manifest permissions differ'),
      });

      delete manifest.optional_host_permissions;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await rm(path.join(fixture.source, 'icons/icon-16.png'));
      await expect(packageExtension(fixture.source, output, fixture.baseline)).rejects.toMatchObject({
        stderr: expect.stringContaining('Missing manifest asset'),
      });

      await writeFile(path.join(fixture.source, 'icons/icon-16.png'), 'icon');
      await writeFile(path.join(fixture.source, 'background.js'), 'const key = "sb_secret_release";\n');
      await expect(packageExtension(fixture.source, output, fixture.baseline)).rejects.toMatchObject({
        stderr: expect.stringContaining('Server-side credential'),
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});
