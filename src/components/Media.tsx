import { useEffect, useRef, useState } from 'react';
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
  const visible = frames.filter((f) => !failed[f]);
  const current = visible[index % Math.max(visible.length, 1)];
  const video = exercise.videoUrl;
  const ytId = youtubeId(video);

  return (
    <>
      {current ? (
        <div className="media" style={{ height }}>
          <button
            type="button"
            aria-label={visible.length > 1 ? 'Ver próxima imagem' : 'Imagem do exercício'}
            onClick={() => setIndex((i) => i + 1)}
            style={{ border: 0, padding: 0, background: 'none', width: '100%', height: '100%' }}
          >
            <img
              src={current}
              alt={`Execução: ${exercise.name}`}
              onError={() => setFailed((f) => ({ ...f, [current]: true }))}
            />
          </button>
          {visible.length > 1 && (
            <span className="media-count">
              {(index % visible.length) + 1} / {visible.length}
            </span>
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
