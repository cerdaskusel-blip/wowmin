'use client';
import { useEffect, useState, useId } from 'react';
import { Plus, Play, Pencil, Trash2, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { auth, api } from '@/lib/firebase';
import type { ActivityFields, ActivityTemplate } from '@/lib/activities';
import { ErrorMessage } from './ui';
import { Modal } from './modal';

async function requestActivity(data?: object) {
  const response = await fetch('/api/activities', {
    method: data ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`,
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    cache: 'no-store',
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Aktiviti tidak dapat dimuatkan. Cuba semula.');
  return result as { templates?: ActivityTemplate[]; template?: ActivityTemplate };
}
const empty = (): ActivityFields => ({
  title: '',
  description: '',
  durationMinutes: 15,
  prompts: [''],
});
export function ActivityDashboard() {
  const router = useRouter();
  const formId = useId();
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ActivityFields | null>(null);
  const [editingId, setEditingId] = useState<string>();
  const [deleting, setDeleting] = useState<ActivityTemplate | null>(null);
  const [formError, setFormError] = useState('');
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    requestActivity()
      .then((result) => {
        if (!ignore) setTemplates(result.templates || []);
      })
      .catch((e) => {
        if (!ignore) setError((e as Error).message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [reload]);
  function edit(template?: ActivityTemplate) {
    setEditingId(template?.id);
    setDraft(
      template
        ? {
            title: template.title,
            description: template.description,
            durationMinutes: template.durationMinutes,
            prompts: [...template.prompts],
          }
        : empty(),
    );
    setFormError('');
    setNotice('');
  }
  async function start(template: ActivityTemplate) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api('create', { templateId: template.id });
      try {
        localStorage.setItem('wow-host-session', result.sessionId);
      } catch {}
      router.push(`/session/${result.sessionId}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <section
      className="panel activity-dashboard"
      style={{ gridColumn: '1 / -1' }}
      aria-label="Dashboard Aktiviti"
    >
      <div className="activity-dashboard-heading">
        <div>
          <h1>Ruang Fasilitator</h1>
          <h2>Aktiviti Saya</h2>
          <p>Simpan aktiviti anda, kemudian pilih Mula Sesi untuk mendapatkan kod dan QR baharu.</p>
        </div>
        <button className="button primary" disabled={busy || loading} onClick={() => edit()}>
          <Plus size={18} aria-hidden="true" /> Cipta Aktiviti
        </button>
      </div>
      <p role="status">{loading ? 'Memuatkan aktiviti…' : notice}</p>
      <ErrorMessage message={error} />
      {error && (
        <button
          className="button secondary"
          disabled={busy || loading}
          onClick={() => setReload((v) => v + 1)}
        >
          Cuba Muat Semula
        </button>
      )}
      {!loading && !error && !templates.length && (
        <p>Belum ada aktiviti. Cipta templat pertama anda.</p>
      )}
      <div className="activity-grid">
        {templates.map((template) => (
          <article
            className="panel activity-card"
            key={template.id}
            aria-label={`Aktiviti: ${template.title}`}
          >
            <h3>{template.title}</h3>
            <p className="activity-description" style={{ whiteSpace: 'pre-wrap' }}>
              {template.description}
            </p>
            <p className="activity-meta">
              <Clock size={16} aria-hidden="true" />
              {template.durationMinutes} minit · {template.prompts.length} prompt
            </p>
            <div className="two-buttons">
              <button className="button primary" disabled={busy} onClick={() => start(template)}>
                <Play size={16} aria-hidden="true" /> Mula Sesi
              </button>
              <button className="button secondary" disabled={busy} onClick={() => edit(template)}>
                <Pencil size={16} aria-hidden="true" /> Edit Aktiviti
              </button>
              <button
                className="button secondary template-delete"
                disabled={busy}
                onClick={() => {
                  setDeleting(template);
                  setFormError('');
                }}
              >
                <Trash2 size={16} aria-hidden="true" /> Padam Templat
              </button>
            </div>
          </article>
        ))}
      </div>
      {draft && (
        <Modal
          title={editingId ? 'Edit Aktiviti' : 'Cipta Aktiviti'}
          onClose={() => {
            if (!busy) setDraft(null);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setFormError('');
              try {
                const result = await requestActivity({
                  action: 'save',
                  ...draft,
                  ...(editingId ? { id: editingId } : {}),
                });
                const saved = result.template!;
                setTemplates((previous) => [
                  saved,
                  ...previous.filter((item) => item.id !== saved.id),
                ]);
                setDraft(null);
                setNotice('Aktiviti berjaya disimpan.');
              } catch (e) {
                setFormError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Tajuk aktiviti
              <input
                autoFocus
                required
                maxLength={70}
                value={draft.title}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label htmlFor={`${formId}-description`}>Penerangan</label>
            <textarea
              id={`${formId}-description`}
              required
              maxLength={2000}
              rows={3}
              value={draft.description}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
            <label>
              Tempoh dalam minit
              <input
                type="number"
                required
                min={1}
                max={240}
                step={1}
                value={Number.isNaN(draft.durationMinutes) ? '' : draft.durationMinutes}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, durationMinutes: e.target.valueAsNumber })}
              />
            </label>
            <p>1–240 minit. Masukkan antara 1 hingga 5 prompt bebas.</p>
            {draft.prompts.map((prompt, index) => (
              <div key={index}>
                <label htmlFor={`${formId}-prompt-${index}`}>Prompt {index + 1}</label>
                <textarea
                  id={`${formId}-prompt-${index}`}
                  required
                  maxLength={2000}
                  rows={3}
                  value={prompt}
                  disabled={busy}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      prompts: draft.prompts.map((old, i) => (i === index ? e.target.value : old)),
                    })
                  }
                />
                {draft.prompts.length > 1 && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      setDraft({ ...draft, prompts: draft.prompts.filter((_, i) => i !== index) })
                    }
                  >
                    Buang Prompt {index + 1}
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="button secondary"
              disabled={busy || draft.prompts.length === 5}
              onClick={() => setDraft({ ...draft, prompts: [...draft.prompts, ''] })}
            >
              Tambah Prompt
            </button>
            <ErrorMessage message={formError} />
            <div className="two-buttons">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Batal
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan Aktiviti'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Padam Templat?"
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p>
            Padam templat <strong>{deleting.title}</strong>? Tindakan ini tidak boleh dibatalkan.
            Sesi yang sudah bermula tidak terjejas.
          </p>
          <ErrorMessage message={formError} />
          <div className="two-buttons">
            <button
              autoFocus
              className="button secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Batal
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setFormError('');
                try {
                  await requestActivity({ action: 'delete', id: deleting.id, confirmed: true });
                  setTemplates((previous) => previous.filter((item) => item.id !== deleting.id));
                  setDeleting(null);
                  setNotice('Templat berjaya dipadam.');
                } catch (e) {
                  setFormError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Memadam…' : 'Ya, Padam Templat'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
