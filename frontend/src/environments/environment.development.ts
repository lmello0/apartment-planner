/** Local development against the real FastAPI backend (backend: AUTH_DISABLED=true). */
export const environment = {
  useMock: false,
  authDisabled: true,
  apiUrl: 'http://localhost:8000/api',
  supabaseUrl: '',
  supabaseAnonKey: '',
};
