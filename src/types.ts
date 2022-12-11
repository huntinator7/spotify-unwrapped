export type User = {
  last_cursor?: string;
  refresh_token: string;
  created_date: string;
  last_updated: string;
  id: string;
  code_verifier: string;
  auth_code: string;
}

export type AccessTokenResponse = {
  access_token: string;
  refresh_token: string;
}
