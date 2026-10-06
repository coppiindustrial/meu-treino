import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ExerciseView } from '../lib/exercises';
import { thumbOf } from '../lib/exercises';
import { youtubeId } from '../lib/images';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/**
 * Primeiro quadro da animação 3D, parado. Desenha num canvas (funciona com imagem de outro site)
 * e só baixa quando a miniatura aparece na tela.
 */
function GifFrame({ src, onFail }: { src: string; onFail: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;
    const draw = () => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (cancelled) return;
        const box = canvas.clientWidth || 56;
        const scale = Math.min(3, window.devicePixelRatio || 1);
        const size = Math.round(box * scale);
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        // Enquadra o centro da imagem (corta as sobras se não for quadrada).
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      };
      img.onerror = () => {
        if (!cancelled) onFail();
      };
      img.src = src;
    };
    if (!('IntersectionObserver' in window)) {
      draw();
      return () => {
        cancelled = true;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        draw();
      },
      { rootMargin: '200px' },
    );
    io.observe(canvas);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} aria-hidden="true" />;
}

export function ExerciseThumb({ exercise, size = 'md' }: { exercise: ExerciseView; size?: 'md' | 'lg' }) {
  const [gifFailed, setGifFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const photo = thumbOf(exercise);
  return (
    <div className={`thumb ${size === 'lg' ? 'lg' : ''}`}>
      {exercise.gif && !gifFailed ? (
        <GifFrame src={exercise.gif} onFail={() => setGifFailed(true)} />
      ) : photo && !failed ? (
        <img src={photo} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon name="image" size={22} />
      )}
    </div>
  );
}

/** Animação (GIF), fotos e vídeo do exercício. */
export function ExerciseMedia({ exercise, height = 200 }: { exercise: ExerciseView; height?: number }) {
  const frames = [...(exercise.gif ? [exercise.gif] : []), ...exercise.images];
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [videoOpen, setVideoOpen] = useState(false);
  const [drag, setDrag] = useState(0);
  const visible = frames.filter((f) => !failed[f]);
  const n = visible.length;
  const at = n > 0 ? index % n : 0;
  const video = exercise.videoUrl;
  const ytId = youtubeId(video);

  // Em ciclo: da última vai para a primeira e, voltando, da primeira para a última.
  const prev = () => setIndex((i) => (((i % n) - 1 + n) % n));
  const next = () => setIndex((i) => (i % n) + 1);

  // Deslizar com o dedo troca de imagem; um toque no terço esquerdo volta e no resto avança.
  const gesture = useRef<{ x: number; y: number; t: number; dir: 'x' | 'y' | null; id: number } | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (n < 2) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: performance.now(), dir: null, id: e.pointerId };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.dir && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
      g.dir = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.dir === 'x') e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (g.dir === 'x') setDrag(dx);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    setDrag(0);
    if (g.dir === 'y') return;
    if (g.dir === 'x') {
      const fast = Math.abs(dx) > 20 && performance.now() - g.t < 250;
      if (Math.abs(dx) > 40 || fast) (dx < 0 ? next : prev)();
      return;
    }
    // Mede pela moldura: o trilho está deslocado para o lado da imagem atual.
    const box = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect();
    if (e.clientX - box.left < box.width / 3) prev();
    else next();
  };
  const onCancel = () => {
    gesture.current = null;
    setDrag(0);
  };

  return (
    <>
      {n > 0 ? (
        <div className="stack" style={{ gap: 8 }}>
        <div className="media" style={{ height }}>
          <div
            className={`media-track ${drag ? 'dragging' : ''}`}
            style={{ transform: `translateX(calc(${-at * 100}% + ${drag}px))` }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onCancel}
          >
            {visible.map((src, i) => (
              <img
                key={src}
                src={src}
                alt={`Execução: ${exercise.name}${n > 1 ? ` (imagem ${i + 1} de ${n})` : ''}`}
                draggable={false}
                aria-hidden={i !== at}
                onError={() => setFailed((f) => ({ ...f, [src]: true }))}
              />
            ))}
          </div>
          {n > 1 && (
            <>
              <span className="media-hint" aria-hidden="true">
                <span>
                  <Icon name="back" size={18} />
                </span>
                <span>
                  <Icon name="next" size={18} />
                </span>
              </span>
              <button type="button" className="sr-only" onClick={prev}>
                Imagem anterior
              </button>
              <button type="button" className="sr-only" onClick={next}>
                Próxima imagem
              </button>
            </>
          )}
          {video && (
            <div className="media-actions">
              <button type="button" className="media-chip" onClick={() => setVideoOpen(true)}>
                <Icon name="playCircle" size={18} />
                Ver vídeo
              </button>
            </div>
          )}
        </div>
        {n > 1 && (
          <div className="media-dots" aria-live="polite" aria-label={`Imagem ${at + 1} de ${n}`}>
            {visible.map((src, i) => (
              <span key={src} className={i === at ? 'on' : ''} />
            ))}
          </div>
        )}
        </div>
      ) : (
        <div className="media empty" style={{ height: Math.min(height, 140) }}>
          <Icon name="image" size={30} />
          <span>Sem imagem para este exercício</span>
          {video && (
            <button type="button" className="media-chip" onClick={() => setVideoOpen(true)}>
              <Icon name="playCircle" size={18} />
              Ver vídeo
            </button>
          )}
        </div>
      )}
      <Sheet open={videoOpen} onClose={() => setVideoOpen(false)} title={exercise.name}>
        {ytId ? (
          <iframe
            className="video-frame"
            src={`https://www.youtube-nocookie.com/embed/${ytId}?playsinline=1`}
            title={`Vídeo: ${exercise.name}`}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : null}
        {video && (
          <a className="btn block soft" href={video} target="_blank" rel="noreferrer">
            Abrir o vídeo fora do app
          </a>
        )}
      </Sheet>
    </>
  );
}
