import { describe, expect, it } from 'vitest';
import { readConfirmToken, signupProblem, type SignupDraft } from './signup';

const ok: SignupDraft = {
  name: 'Plastica Rossi S.r.l.',
  email: 'mario@rossi.it',
  phone: '+39 0331 123456',
  password: 'segreta-123',
  again: 'segreta-123',
};

describe('signupProblem — the sign-up form before it is sent', () => {
  it('a complete form; the phone may be left empty', () => {
    expect(signupProblem(ok)).toBeNull();
    expect(signupProblem({ ...ok, phone: '  ' })).toBeNull();
  });

  it('the company name: at least 2 characters, at most 80', () => {
    expect(signupProblem({ ...ok, name: ' A ' })).toMatch(/nome dell’azienda/);
    expect(signupProblem({ ...ok, name: 'x'.repeat(81) })).toMatch(
      /al massimo 80/
    );
  });

  it('an email and a phone that can be used', () => {
    expect(signupProblem({ ...ok, email: 'mario@rossi' })).toBe(
      'Indirizzo email non valido'
    );
    expect(signupProblem({ ...ok, email: 'mario rossi@x.it' })).toBe(
      'Indirizzo email non valido'
    );
    expect(signupProblem({ ...ok, phone: 'chiamami' })).toBe(
      'Numero di telefono non valido'
    );
  });

  it('the password rules of the reset page', () => {
    expect(signupProblem({ ...ok, password: 'corta', again: 'corta' })).toMatch(
      /almeno 8/
    );
    expect(signupProblem({ ...ok, again: 'altra-123' })).toMatch(
      /non coincidono/
    );
  });
});

describe('readConfirmToken — the link from the confirmation email', () => {
  const token = 'Abc_-' + 'x'.repeat(38);
  it('the token in the hash', () => {
    expect(readConfirmToken(`#t=${token}`)).toBe(token);
  });
  it('none, or something else: null', () => {
    expect(readConfirmToken('')).toBeNull();
    expect(readConfirmToken('#t=short')).toBeNull();
    expect(readConfirmToken(`#t=${token}<script>`)).toBeNull();
  });
});
