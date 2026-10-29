import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'error'; message: string; fields?: Record<string, string> };

/** Formulaire de contact → POST /api/contact (validation zod côté serveur, champ piège anti-robots). */
export function ContactForm() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setStatus({ kind: 'sending' });
    try {
      await api('/contact', { method: 'POST', json: data });
      form.reset();
      setStatus({ kind: 'sent' });
    } catch (err) {
      const fields = err instanceof ApiError ? (err.details as { fields?: Record<string, string> })?.fields : undefined;
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Envoi impossible', fields });
    }
  }

  const fieldError = (name: string) => (status.kind === 'error' ? status.fields?.[name] : undefined);

  if (status.kind === 'sent') {
    return (
      <div className="contact-card contact-ok" role="status">
        <div className="contact-ok-ic">✓</div>
        <h3>Message bien reçu.</h3>
        <p>Merci ! Je vous réponds au plus vite.</p>
        <button className="btn btn-ghost" onClick={() => setStatus({ kind: 'idle' })}>
          Envoyer un autre message
        </button>
      </div>
    );
  }

  return (
    <form className="contact-card" onSubmit={onSubmit} noValidate>
      <div className="field-row">
        <label>
          <span>Nom</span>
          <input name="name" required minLength={2} maxLength={120} autoComplete="name" aria-invalid={Boolean(fieldError('name'))} />
          {fieldError('name') && <em>{fieldError('name')}</em>}
        </label>
        <label>
          <span>E-mail</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" aria-invalid={Boolean(fieldError('email'))} />
          {fieldError('email') && <em>{fieldError('email')}</em>}
        </label>
      </div>
      <label>
        <span>Entreprise (facultatif)</span>
        <input name="company" maxLength={160} autoComplete="organization" />
      </label>
      <label>
        <span>Message</span>
        <textarea name="message" required minLength={10} maxLength={5000} rows={5} aria-invalid={Boolean(fieldError('message'))} />
        {fieldError('message') && <em>{fieldError('message')}</em>}
      </label>
      {/* Champ invisible : s'il est rempli, c'est un robot. */}
      <label className="hp" aria-hidden>
        Site web
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <button type="submit" className="btn btn-primary" disabled={status.kind === 'sending'}>
        {status.kind === 'sending' ? 'Envoi…' : 'Envoyer le message →'}
      </button>
      {status.kind === 'error' && !status.fields && <p className="form-error">{status.message}</p>}
    </form>
  );
}
