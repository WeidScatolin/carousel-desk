'use client';

import { useEffect, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import type { PostWithSlides } from '@/lib/data/posts';
import type { Slide, LeadMagnet } from '@/generated/prisma/client';

interface PostDrawerProps {
  post: PostWithSlides;
  onClose: () => void;
}

function SlideEditor({ slide, onSaved }: { slide: Slide; onSaved: () => void }): JSX.Element {
  const [headline, setHeadline] = useState(slide.headline ?? '');
  const [body, setBody] = useState(slide.body ?? '');
  const [accentPhrase, setAccentPhrase] = useState(slide.accentPhrase ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    const response = await fetch(`/api/slides/${slide.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headline, body, accentPhrase: accentPhrase || null }),
    });
    setSaving(false);
    if (!response.ok) {
      setError('Não foi possível salvar este slide.');
      return;
    }
    onSaved();
  }

  return (
    <div className="flex flex-col gap-2">
      {slide.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slide.imageUrl} alt={`Slide ${slide.order + 1}`} className="w-full rounded-lg border border-carvao/10" />
      ) : (
        <p className="rounded-lg border border-carvao/10 bg-carvao/5 p-8 text-center text-sm text-carvao/50">Sem imagem renderizada</p>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-carvao">Headline</span>
        <textarea value={headline} onChange={(event) => setHeadline(event.target.value)} rows={2} className="rounded border border-carvao/15 bg-white p-2 text-sm text-carvao focus:border-laranja focus:outline-none" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-carvao">Corpo</span>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="rounded border border-carvao/15 bg-white p-2 text-sm text-carvao focus:border-laranja focus:outline-none" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-carvao">Expressão em destaque (accentPhrase)</span>
        <input
          value={accentPhrase}
          onChange={(event) => setAccentPhrase(event.target.value)}
          placeholder="Precisa ser um trecho exato do headline"
          className="rounded border border-carvao/15 bg-white p-2 text-sm text-carvao focus:border-laranja focus:outline-none"
        />
      </label>
      {error ? <p className="text-xs font-medium text-laranja">{error}</p> : null}
      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="w-fit rounded bg-carvao px-3 py-2 text-xs font-semibold uppercase tracking-wide text-creme transition hover:bg-laranja disabled:opacity-40"
      >
        {saving ? 'Salvando…' : 'Salvar e regenerar este slide'}
      </button>
    </div>
  );
}

export function PostDrawer({ post, onClose }: PostDrawerProps): JSX.Element {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [caption, setCaption] = useState(post.caption ?? '');
  const [ctaKeyword, setCtaKeyword] = useState(post.ctaKeyword ?? '');
  const [leadMagnetId, setLeadMagnetId] = useState(post.leadMagnetId ?? '');
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [savingPost, setSavingPost] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/lead-magnets')
      .then((response) => response.json())
      .then((data) => setLeadMagnets(data.leadMagnets ?? []))
      .catch(() => setLeadMagnets([]));
  }, []);

  const selectedSlide = post.slides[selectedIndex];

  async function handleSavePost(): Promise<void> {
    setSavingPost(true);
    setPostError(null);
    const response = await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caption,
        ctaKeyword: ctaKeyword || null,
        leadMagnetId: leadMagnetId || null,
      }),
    });
    setSavingPost(false);
    if (!response.ok) {
      setPostError('Não foi possível salvar a legenda/CTA.');
      return;
    }
    router.refresh();
  }

  async function handleRegenerateAll(): Promise<void> {
    setRegenerating(true);
    setPostError(null);
    const response = await fetch(`/api/posts/${post.id}/regenerate`, { method: 'POST' });
    setRegenerating(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setPostError(payload?.error ?? 'Não foi possível regenerar o carrossel.');
      return;
    }
    router.refresh();
    onClose();
  }

  function handleSlideSaved(): void {
    router.refresh();
  }

  const canRegenerate = post.status !== 'scheduled' && post.status !== 'published';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-carvao/60" role="dialog" aria-modal="true" aria-label="Detalhe do post">
      <div className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-creme p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-xl font-extrabold text-carvao">Detalhe do post</h2>
          <button type="button" onClick={onClose} className="text-sm font-medium text-carvao/50 underline hover:text-laranja">
            Fechar
          </button>
        </div>

        <a href={post.theme.sourceUrl} target="_blank" rel="noopener noreferrer" className="mb-2 text-xs font-medium text-carvao/50 underline hover:text-laranja">
          Ver artigo-fonte ↗
        </a>
        {!post.theme.hasSufficientEvidence ? (
          <p className="mb-2 text-xs font-semibold text-laranja">⚠ Evidência insuficiente no artigo-fonte</p>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-1">
          {post.slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`h-8 w-8 rounded text-xs font-semibold transition ${index === selectedIndex ? 'bg-carvao text-creme' : 'bg-carvao/5 text-carvao/60 hover:bg-carvao/10'}`}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {selectedSlide ? <SlideEditor key={selectedSlide.id} slide={selectedSlide} onSaved={handleSlideSaved} /> : null}

        <div className="my-4 border-t border-carvao/10 pt-4">
          <label className="mb-2 flex flex-col gap-1 text-sm">
            <span className="font-semibold text-carvao">Legenda</span>
            <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={4} className="rounded border border-carvao/15 bg-white p-2 text-sm text-carvao focus:border-laranja focus:outline-none" />
          </label>
          <label className="mb-2 flex flex-col gap-1 text-sm">
            <span className="font-semibold text-carvao">Palavra-chave de CTA</span>
            <input value={ctaKeyword} onChange={(event) => setCtaKeyword(event.target.value)} className="rounded border border-carvao/15 bg-white p-2 text-sm text-carvao focus:border-laranja focus:outline-none" />
          </label>
          <label className="mb-2 flex flex-col gap-1 text-sm">
            <span className="font-semibold text-carvao">Lead magnet</span>
            <select value={leadMagnetId} onChange={(event) => setLeadMagnetId(event.target.value)} className="rounded border border-carvao/15 bg-white p-2 text-sm text-carvao focus:border-laranja focus:outline-none">
              <option value="">Nenhum</option>
              {leadMagnets.map((magnet) => (
                <option key={magnet.id} value={magnet.id}>
                  {magnet.name} ({magnet.ctaKeyword})
                </option>
              ))}
            </select>
          </label>
          {ctaKeyword ? (
            <p className="mb-2 rounded bg-carvao/5 p-2 text-xs text-carvao/70">
              Preview do CTA: comente <span className="font-mono font-bold text-laranja">{ctaKeyword.toUpperCase()}</span> para receber o material.
            </p>
          ) : null}
          {postError ? <p className="mb-2 text-xs font-medium text-laranja">{postError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={savingPost}
              onClick={() => void handleSavePost()}
              className="rounded bg-carvao px-4 py-2 text-xs font-semibold uppercase tracking-wide text-creme transition hover:bg-laranja disabled:opacity-40"
            >
              {savingPost ? 'Salvando…' : 'Salvar legenda/CTA'}
            </button>
            {canRegenerate ? (
              <button
                type="button"
                disabled={regenerating}
                onClick={() => void handleRegenerateAll()}
                className="rounded border border-carvao/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-carvao transition hover:border-laranja hover:text-laranja disabled:opacity-40"
              >
                {regenerating ? 'Regenerando…' : 'Regenerar carrossel inteiro'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
