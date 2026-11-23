import { describe, expect, it } from 'vitest';
import { authErrorText, passwordProblem } from './password';

describe('passwordProblem', () => {
  it('at least 8 characters, typed the same twice', () => {
    expect(passwordProblem('short', 'short')).toMatch(/almeno 8/);
    expect(passwordProblem('lunghezza8', 'lunghezza9')).toMatch(/non coincidono/);
    expect(passwordProblem('lunghezza8', 'lunghezza8')).toBeNull();
  });
});

describe('authErrorText', () => {
  it('known codes in Italian', () => {
    expect(authErrorText({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
      'Email o password non corretti'
    );
    expect(authErrorText({ code: 'same_password' })).toMatch(/diversa/);
    expect(authErrorText({ code: 'over_email_send_rate_limit' })).toMatch(/Troppe email/);
  });

  it('too many requests, no connection, anything else', () => {
    expect(authErrorText({ status: 429, message: 'x' })).toMatch(/Troppi tentativi/);
    expect(authErrorText({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' })).toMatch(
      /connessione/
    );
    expect(authErrorText({ message: 'Something odd' })).toBe('Something odd');
  });
});
