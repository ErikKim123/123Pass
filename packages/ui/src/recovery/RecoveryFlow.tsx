// Design Ref: §FR-14 — BIP39 24-word seed flow.

import { useState } from 'react';

import { generateRecoveryPhrase, isValidRecoveryPhrase } from '@123pass/core-crypto';

export interface RecoveryFlowProps {
  mode: 'generate' | 'restore';
  onConfirmed?: (phrase: string) => void;
  className?: string;
}

export function RecoveryFlow({
  mode,
  onConfirmed,
  className,
}: RecoveryFlowProps): JSX.Element {
  const [phrase, setPhrase] = useState<string>(() =>
    mode === 'generate' ? generateRecoveryPhrase() : '',
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode === 'generate') {
    const words = phrase.split(' ');
    return (
      <section className={className} data-testid="recovery-generate">
        <p>
          Write down these 24 words in order. Anyone with this phrase can recover your vault.
        </p>
        <ol data-testid="recovery-words">
          {words.map((w, i) => (
            <li key={i}>
              <span aria-hidden>{i + 1}.</span> {w}
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setPhrase(generateRecoveryPhrase())}>
          Regenerate
        </button>
        <label>
          <input
            aria-label="confirmed"
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I have safely stored this phrase
        </label>
        <button type="button" disabled={!confirmed} onClick={() => onConfirmed?.(phrase)}>
          Continue
        </button>
      </section>
    );
  }

  // Restore mode
  return (
    <section className={className} data-testid="recovery-restore">
      <p>Enter your 24-word recovery phrase, separated by spaces.</p>
      <textarea
        aria-label="recovery-input"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        rows={4}
      />
      {error ? (
        <div role="alert" data-testid="recovery-error">
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (!isValidRecoveryPhrase(phrase.trim())) {
            setError('Invalid recovery phrase (BIP39 checksum failed).');
            return;
          }
          setError(null);
          onConfirmed?.(phrase.trim());
        }}
      >
        Restore
      </button>
    </section>
  );
}
