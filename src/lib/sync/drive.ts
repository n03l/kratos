import { DRIVE_ID, parseRemoteFile, type RemoteFile } from '../logic/sync';
import { MAX_IMPORT_BYTES } from '../repo/validate';

/**
 * Google Drive from the browser: Google Identity Services hands out short-lived access tokens (about an
 * hour, no refresh token without a backend), and the Drive REST API stores one JSON file. The scope is
 * drive.file, so Kratos sees only files it created. Tokens stay in memory; they are never stored or logged.
 */

const GIS_URL = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FILES = 'https://www.googleapis.com/drive/v3/files';
const ABOUT = 'https://www.googleapis.com/drive/v3/about';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_NAME = 'Kratos data.json';
const FIELDS = 'id,version';

/** The OAuth client id from the build, or '' when Drive sync isn't set up. It is public, not a secret. */
export const clientId = (() => {
  const v = import.meta.env.GOOGLE_CLIENT_ID;
  return typeof v === 'string' && /^[\w-]+\.apps\.googleusercontent\.com$/.test(v) ? v : '';
})();

export class DriveError extends Error {}

/** No valid token, and getting one needs a tap (Google opens a sign-in window). */
export class NeedsSignIn extends DriveError {
  constructor() {
    super('Tap Sync to sign in to Google again.');
  }
}

class NotFound extends DriveError {}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}

/** The part of Google Identity Services used here. */
export interface Gis {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string }) => void;
  }): { requestAccessToken(opts?: { prompt?: string }): void };
  hasGrantedAllScopes(r: TokenResponse, scope: string): boolean;
  revoke(token: string, done?: () => void): void;
}

let gisLoad: Promise<Gis> | null = null;

/** Load the Google sign-in script on first use, so starting the app offline doesn't depend on it. */
export function loadGis(): Promise<Gis> {
  gisLoad ??= new Promise<Gis>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_URL;
    s.async = true;
    s.onload = () => {
      const gis = (window as { google?: { accounts?: { oauth2?: Gis } } }).google?.accounts?.oauth2;
      if (gis) resolve(gis);
      else reject(new DriveError('Google sign-in didn’t load. Try again later.'));
    };
    s.onerror = () => {
      gisLoad = null;
      s.remove();
      reject(new DriveError('Couldn’t reach Google sign-in. Check your connection and try again.'));
    };
    document.head.append(s);
  });
  return gisLoad;
}

const signInError = (type?: string) =>
  type === 'popup_closed'
    ? 'The Google sign-in window was closed before it finished.'
    : type === 'popup_failed_to_open'
      ? 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.'
      : 'Google sign-in failed. Try again.';

function statusError(status: number): DriveError {
  if (status === 401) return new NeedsSignIn();
  if (status === 403) return new DriveError('Drive refused the request (403). Disconnect and connect Google Drive again in More.');
  if (status === 404) return new NotFound('The Kratos file is no longer in Drive.');
  if (status === 429 || status >= 500) return new DriveError(`Drive is busy right now (${status}). Try again in a minute.`);
  return new DriveError(`Drive request failed (${status}).`);
}

export class DriveApi {
  #token: { value: string; expiresAt: number; account?: string } | null = null;
  /** 'select_account' after signing in to the wrong account, so Google shows the account chooser. */
  #prompt = '';

  constructor(
    private readonly id: string,
    private readonly gis: () => Promise<Gis> = loadGis,
    private readonly fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  hasToken(): boolean {
    return !!this.#token && this.#token.expiresAt > Date.now() + 60_000;
  }

  /** A valid token. Without one, `interactive` opens Google's sign-in window (call it from a tap). */
  async token(interactive: boolean): Promise<string> {
    if (this.hasToken()) return this.#token!.value;
    if (!interactive) throw new NeedsSignIn();
    if (!this.id) throw new DriveError('Drive sync isn’t set up in this build.');
    const gis = await this.gis();
    const r = await new Promise<TokenResponse>((resolve, reject) => {
      gis.initTokenClient({
        client_id: this.id,
        scope: SCOPE,
        callback: resolve,
        error_callback: (e) => reject(new DriveError(signInError(e?.type))),
      }).requestAccessToken({ prompt: this.#prompt });
    });
    if (r.error || typeof r.access_token !== 'string' || !r.access_token) {
      throw new DriveError(r.error === 'access_denied' ? 'Google sign-in was cancelled.' : signInError());
    }
    if (!gis.hasGrantedAllScopes(r, SCOPE)) {
      throw new DriveError('Kratos needs permission to keep its file in your Drive. Connect again and allow it.');
    }
    const sec = Number(r.expires_in);
    this.#token = { value: r.access_token, expiresAt: Date.now() + (Number.isFinite(sec) && sec > 0 ? Math.min(sec, 3600) : 3000) * 1000 };
    this.#prompt = '';
    return this.#token.value;
  }

  /** Drive's permission id for the signed-in Google account (the token response doesn't say which it is). */
  async account(): Promise<string> {
    const t = this.#token;
    if (t?.account) return t.account;
    const body = await this.#json(`${ABOUT}?fields=${encodeURIComponent('user(permissionId)')}`);
    const user = typeof body === 'object' && body !== null && Object.hasOwn(body, 'user') ? (body as { user: unknown }).user : undefined;
    const id = typeof user === 'object' && user !== null && Object.hasOwn(user, 'permissionId')
      ? (user as { permissionId: unknown }).permissionId : undefined;
    if (typeof id !== 'string' || !DRIVE_ID.test(id)) throw new DriveError('Drive sent an unexpected account description.');
    if (t && this.#token === t) t.account = id;
    return id;
  }

  /** Drop the token of a wrong account (without revoking it) and offer the account chooser on the next sign-in. */
  chooseAccount() {
    this.#token = null;
    this.#prompt = 'select_account';
  }

  /** Forget the token and ask Google to revoke it. The file in Drive stays. */
  async signOut() {
    const t = this.#token?.value;
    this.#token = null;
    if (t) await this.gis().then((gis) => gis.revoke(t), () => undefined);
  }

  async #call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.token(false);
    let res: Response;
    try {
      res = await this.fetchFn(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    } catch {
      throw new DriveError('Couldn’t reach Google Drive. Check your connection and try again.');
    }
    if (res.status === 401) this.#token = null;
    if (!res.ok) throw statusError(res.status);
    return res;
  }

  async #json(url: string, init?: RequestInit): Promise<unknown> {
    const res = await this.#call(url, init);
    try {
      return await res.json();
    } catch {
      throw new DriveError('Drive sent a reply Kratos couldn’t read.');
    }
  }

  /** The Kratos file this app created, if any (newest first if there are several). */
  async find(): Promise<RemoteFile | null> {
    const q = "appProperties has { key='kratos' and value='data' } and trashed = false";
    const url = `${FILES}?q=${encodeURIComponent(q)}&orderBy=modifiedTime%20desc&pageSize=10&spaces=drive&fields=${encodeURIComponent(`files(${FIELDS})`)}`;
    const body = await this.#json(url);
    const files = typeof body === 'object' && body !== null && Object.hasOwn(body, 'files') ? (body as { files: unknown }).files : undefined;
    if (!Array.isArray(files)) throw new DriveError('Drive sent an unexpected file list.');
    return files.length ? parseRemoteFile(files[0]) : null;
  }

  /** The file's current version, or null if it was deleted or trashed. */
  async meta(fileId: string): Promise<RemoteFile | null> {
    try {
      const body = await this.#json(`${FILES}/${encodeURIComponent(fileId)}?fields=${FIELDS},trashed`);
      if (typeof body === 'object' && body !== null && Object.hasOwn(body, 'trashed') && (body as { trashed: unknown }).trashed === true) return null;
      return parseRemoteFile(body);
    } catch (err) {
      if (err instanceof NotFound) return null;
      throw err;
    }
  }

  /** The file's text. Callers must check it (parseBackup) before using it. */
  async download(fileId: string): Promise<string> {
    const res = await this.#call(`${FILES}/${encodeURIComponent(fileId)}?alt=media`);
    const size = Number(res.headers.get('content-length'));
    if (size > MAX_IMPORT_BYTES) throw new DriveError('The file in Drive is larger than 20 MB, too big to be Kratos data.');
    const text = await res.text();
    if (text.length > MAX_IMPORT_BYTES) throw new DriveError('The file in Drive is larger than 20 MB, too big to be Kratos data.');
    return text;
  }

  async create(text: string): Promise<RemoteFile> {
    const boundary = `kratos-${Math.random().toString(36).slice(2)}`;
    const meta = { name: FILE_NAME, mimeType: 'application/json', appProperties: { kratos: 'data' } };
    const body = [
      `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(meta),
      `--${boundary}`, 'Content-Type: application/json', '', text,
      `--${boundary}--`, '',
    ].join('\r\n');
    return parseRemoteFile(await this.#json(`${UPLOAD}?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }));
  }

  async update(fileId: string, text: string): Promise<RemoteFile> {
    return parseRemoteFile(await this.#json(`${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media&fields=${FIELDS}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: text,
    }));
  }
}
