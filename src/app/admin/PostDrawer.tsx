'use client';

import { useEffect, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { PostWithSlides } from '@/lib/data/posts';
import type { Slide, LeadMagnet } from '@/generated/prisma/client';

interface PostDrawerProps {
  post: PostWithSlides;
  onClose: () => void;
}

interface CarouselProps {
  slides: PostWithSlides['slides'];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

// Mirrors Instagram's own post carousel: square image, arrows that only
// show when there's somewhere to go, dot pagination overlaid on the image.
function InstagramCarousel({ slides, selectedIndex, onSelect }: CarouselProps): JSX.Element {
  const current = slides[selectedIndex];
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex < slides.length - 1;

  return (
    <div className="relative aspect-square w-full shrink-0 bg-carvao sm:w-[420px]">
      {current?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current.imageUrl} alt={`Slide ${selectedIndex + 1}`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-8 text-center text-sm text-creme/50">Sem imagem renderizada</div>
      )}

      {hasPrev ? (
        <button
          type="button"
          aria-label="Slide anterior"
          onClick={() => onSelect(selectedIndex - 1)}
          className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-creme/90 text-carvao shadow transition hover:bg-creme"
        >
          ‹
        </button>
      ) : null}
      {hasNext ? (
        <button
          type="button"
          aria-label="Próximo slide"
          onClick={() => onSelect(selectedIndex + 1)}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-creme/90 text-carvao shadow transition hover:bg-creme"
        >
          ›
        </button>
      ) : null}

      {slides.length > 1 ? (
        <div className="absolute inset-x-0 top-2 flex justify-center gap-1.5">
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Ir para o slide ${index + 1}`}
              aria-current={index === selectedIndex}
              onClick={() => onSelect(index)}
              className={`h-1.5 rounded-full transition-all ${index === selectedIndex ? 'w-4 bg-creme' : 'w-1.5 bg-creme/40 hover:bg-creme/70'}`}
            />
          ))}
        </div>
      ) : null}

      <span className="absolute bottom-2 right-2 rounded-full bg-carvao/60 px-2 py-0.5 text-xs font-medium text-creme">
        {selectedIndex + 1}/{slides.length}
      </span>
    </div>
  );
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
    <div className="flex flex-col gap-2 rounded-lg border border-carvao/10 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-carvao/40">Editar este slide</p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-carvao">Headline</span>
        <textarea value={headline} onChange={(event) => setHeadline(event.target.value)} rows={2} className="rounded border border-carvao/15 bg-white p-2 text-sm text-carvao focus:border-laranja focus:outline-none" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-carvao">Corpo</span>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} className="rounded border border-carvao/15 bg-white p-2 text-sm text-carvao focus:border-laranja focus:outline-none" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-carvao">Expressão em destaque (accentPhrase)</span>
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-carvao/70 p-4" role="dialog" aria-modal="true" aria-label="Detalhe do post" onClick={onClose}>
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:flex-row"
      >
        <InstagramCarousel slides={post.slides} selectedIndex={selectedIndex} onSelect={setSelectedIndex} />

        <div className="flex flex-1 flex-col overflow-y-auto p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="rounded-full bg-carvao/5 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-carvao/60">{post.status}</span>
            <button type="button" onClick={onClose} className="text-sm font-medium text-carvao/50 underline hover:text-carvao">
              Fechar
            </button>
          </div>

          <a href={post.theme.sourceUrl} target="_blank" rel="noopener noreferrer" className="mb-2 text-xs font-medium text-carvao/50 underline hover:text-carvao">
            Ver artigo-fonte ↗
          </a>
          {!post.theme.hasSufficientEvidence ? (
            <p className="mb-2 text-xs font-semibold text-laranja">⚠ Evidência insuficiente no artigo-fonte</p>
          ) : null}
          {post.rejectionReason ? <p className="mb-2 text-xs text-carvao/50">{post.rejectionReason}</p> : null}

          {/* Caption preview, styled like the post itself would read on Instagram. */}
          <p className="mb-4 whitespace-pre-wrap text-sm text-carvao/80">
            {caption || <span className="italic text-carvao/40">Sem legenda ainda.</span>}
          </p>

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
                  className="rounded border border-carvao/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-carvao transition hover:border-carvao/40 hover:bg-carvao/5 disabled:opacity-40"
                >
                  {regenerating ? 'Regenerando…' : 'Regenerar carrossel inteiro'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
