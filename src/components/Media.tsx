import { useState } from 'react';
import type { ExerciseView } from '../lib/exercises';
import { thumbOf } from '../lib/exercises';
import { youtubeId } from '../lib/images';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

export function ExerciseThumb({ exercise, size = 'md' }: { exercise: ExerciseView; size?: 'md' | 'lg' }) {
  const src = thumbOf(exercise);
  const [failed, setFailed] = useState(false);
  return (
    <div className={`thumb ${size === 'lg' ? 'lg' : ''}`}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
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
