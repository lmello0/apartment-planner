export const environment = {
  /** true = in-memory MockApiService and auth bypass (`npm run start:mock`, unit tests). */
  useMock: true,
  /** true = the backend runs with AUTH_DISABLED and the Supabase login is skipped. Local dev only. */
  authDisabled: false,
  apiUrl: '/api',
  supabaseUrl: '',
  supabaseAnonKey: '',
};
