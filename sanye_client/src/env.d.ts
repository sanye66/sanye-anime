/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_GATEWAY_URL?: string
  readonly VITE_CAS_LOGIN_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
