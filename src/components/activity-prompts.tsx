'use client';
import { useId, useRef, useState } from 'react';
import { api } from '@/lib/firebase';
import type { Workshop } from '@/lib/workshop';
import { ErrorMessage } from './ui';

export function ActivityPrompts({ session }: { session: Workshop }) {
  if (!session.activity) return null;
  return (
    <section aria-label="Prompt Aktiviti">
      <h2>Arahan aktiviti</h2>
      <p>
        Salin prompt dan gunakan dalam aplikasi AI pilihan anda. Kemudian muat naik satu hasil karya
        di bawah.
      </p>
      {session.activity.prompts.map((prompt, index) => (
        <PromptCard
          key={`${session.id}-${index}`}
          prompt={prompt}
          index={index}
          sessionId={session.id}
        />
      ))}
    </section>
  );
}
function PromptCard({
  prompt,
  index,
  sessionId,
}: {
  prompt: string;
  index: number;
  sessionId: string;
}) {
  const id = useId();
  const text = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return (
    <article className="panel" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Prompt {index + 1}</h3>
      <label htmlFor={`${id}-text`}>Teks Prompt {index + 1}</label>
      <textarea ref={text} id={`${id}-text`} readOnly value={prompt} rows={5} />
      <button
        className="button primary"
        onClick={async () => {
          setCopied(false);
          setError('');
          try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            api('progress', { sessionId, progress: 'prompt-ready' }).catch(() => {});
          } catch {
            setError(
              'Salinan automatik gagal. Tekan Pilih Teks, kemudian gunakan arahan Salin pada peranti anda.',
            );
          }
        }}
      >
        Salin Prompt
      </button>
      <p role="status">{copied ? 'Berjaya disalin!' : ''}</p>
      <ErrorMessage message={error} />
      {error && (
        <button
          className="button secondary"
          onClick={() => {
            text.current?.focus();
            text.current?.select();
            text.current?.setSelectionRange(0, prompt.length);
          }}
        >
          Pilih Teks
        </button>
      )}
    </article>
  );
}
