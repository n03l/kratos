interface ImportMetaEnv {
  /** OAuth client id for Google Drive sync; unset disables it. */
  readonly GOOGLE_CLIENT_ID?: string;
}

/** Full SHA of the commit this build came from; empty when unknown. Set in vite.config.ts. */
declare const __COMMIT__: string;
