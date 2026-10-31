import { describe, expect, it } from 'vitest';
import { DriveApi, DriveError, NeedsSignIn, type Gis } from './drive';

const ID = '123-abc.apps.googleusercontent.com';

function fakeGis(reply: Record<string, unknown> = { access_token: 'tok', expires_in: 3599 }, granted = true) {
  const calls = { requests: 0, revoked: [] as string[], prompts: [] as (string | undefined)[] };
  const gis: Gis = {
    initTokenClient: ({ callback }) => ({ requestAccessToken: (opts) => { calls.requests++; calls.prompts.push(opts?.prompt); callback(reply); } }),
    hasGrantedAllScopes: () => granted,
    revoke: (t) => { calls.revoked.push(t); },
  };
  return { gis: async () => gis, calls };
}

type Route = (url: string, init: RequestInit) => Response;

function fakeFetch(route: Route) {
  const seen: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    seen.push({ url, init });
    return route(url, init);
  }) as unknown as typeof fetch;
  return { f, seen };
}

const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

async function signedIn(route: Route, gis = fakeGis()) {
  const { f, seen } = fakeFetch(route);
  const api = new DriveApi(ID, gis.gis, f);
  await api.token(true);
  return { api, seen, calls: gis.calls };
}

describe('DriveApi', () => {
  it('needs a tap before it has a token', async () => {
    const api = new DriveApi(ID, fakeGis().gis, fakeFetch(() => json({})).f);
    await expect(api.find()).rejects.toBeInstanceOf(NeedsSignIn);
    expect(api.hasToken()).toBe(false);
  });

  it('refuses a token without the Drive scope', async () => {
    const api = new DriveApi(ID, fakeGis(undefined, false).gis);
    await expect(api.token(true)).rejects.toThrow(/permission/);
  });

  it('refuses a sign-in error', async () => {
    const api = new DriveApi(ID, fakeGis({ error: 'access_denied' }).gis);
    await expect(api.token(true)).rejects.toThrow(/cancelled/);
  });

  it('is disabled without a client id', async () => {
    const api = new DriveApi('', fakeGis().gis);
    await expect(api.token(true)).rejects.toThrow(/set up/);
  });

  it('finds the app file and sends the token', async () => {
    const { api, seen } = await signedIn(() => json({ files: [{ id: 'f1', version: '4' }] }));
    expect(await api.find()).toEqual({ id: 'f1', version: '4' });
    expect(new Headers(seen[0].init.headers).get('Authorization')).toBe('Bearer tok');
    expect(decodeURIComponent(seen[0].url)).toContain("appProperties has { key='kratos' and value='data' }");
  });

  it('rejects unexpected replies', async () => {
    const { api } = await signedIn(() => json({ files: { id: 'f1' } }));
    await expect(api.find()).rejects.toThrow(/unexpected/);
    const bad = await signedIn(() => json({ files: [{ id: '<img src=x onerror=alert(1)>', version: '1' }] }));
    await expect(bad.api.find()).rejects.toThrow(/unexpected/);
    const notJson = await signedIn(() => new Response('<html>', { status: 200 }));
    await expect(notJson.api.find()).rejects.toThrow(/couldn’t read/);
  });

  it('escapes file ids in URLs', async () => {
    const { api, seen } = await signedIn(() => json({ id: 'f1', version: '2' }));
    await api.update('a/b?c', '{}');
    expect(seen[0].url).toContain('/files/a%2Fb%3Fc?');
  });

  it('treats a missing or trashed file as gone', async () => {
    const gone = await signedIn(() => json({ error: {} }, 404));
    expect(await gone.api.meta('f1')).toBeNull();
    const trashed = await signedIn(() => json({ id: 'f1', version: '2', trashed: true }));
    expect(await trashed.api.meta('f1')).toBeNull();
  });

  it('drops the token on 401 and explains other errors', async () => {
    const { api } = await signedIn(() => json({}, 401));
    await expect(api.find()).rejects.toBeInstanceOf(NeedsSignIn);
    expect(api.hasToken()).toBe(false);
    const busy = await signedIn(() => json({}, 503));
    await expect(busy.api.find()).rejects.toThrow(/busy/);
  });

  it('reports a network failure', async () => {
    const { api } = await signedIn(() => { throw new TypeError('offline'); });
    await expect(api.find()).rejects.toBeInstanceOf(DriveError);
  });

  it('creates the file with its marker and uploads the data', async () => {
    const { api, seen } = await signedIn(() => json({ id: 'f9', version: '1' }));
    expect(await api.create('{"version":1}')).toEqual({ id: 'f9', version: '1' });
    const body = String(seen[0].init.body);
    expect(seen[0].init.method).toBe('POST');
    expect(body).toContain('"appProperties":{"kratos":"data"}');
    expect(body).toContain('{"version":1}');
  });

  it('refuses oversized downloads', async () => {
    const { api } = await signedIn(() => new Response('x', { headers: { 'content-length': String(30 * 1024 * 1024) } }));
    await expect(api.download('f1')).rejects.toThrow(/20 MB/);
  });

  it('revokes the token on sign-out', async () => {
    const { api, calls } = await signedIn(() => json({}));
    await api.signOut();
    expect(calls.revoked).toEqual(['tok']);
    expect(api.hasToken()).toBe(false);
  });

  it('reads which account is signed in, once per token', async () => {
    const { api, seen } = await signedIn(() => json({ user: { permissionId: '0123456789' } }));
    expect(await api.account()).toBe('0123456789');
    expect(await api.account()).toBe('0123456789');
    expect(seen.length).toBe(1);
    expect(seen[0].url).toContain('/drive/v3/about?fields=');
  });

  it('refuses an odd account reply', async () => {
    const { api } = await signedIn(() => json({ user: { permissionId: '../x' } }));
    await expect(api.account()).rejects.toBeInstanceOf(DriveError);
  });

  it('offers the account chooser after the wrong account signed in', async () => {
    const gis = fakeGis();
    const { api } = await signedIn(() => json({}), gis);
    api.chooseAccount();
    expect(api.hasToken()).toBe(false);
    await api.token(true);
    await api.signOut();
    await api.token(true);
    expect(gis.calls.prompts).toEqual(['', 'select_account', '']);
  });
});
