import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDialogs } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { TopBar } from '../components/Layout';
import { ExerciseThumb } from '../components/Media';
import { exerciseOrMissing, useExercises } from '../lib/exercises';
import { withTransition } from '../lib/nav';
import { itemsOf, reorderWorkoutItems, restoreWorkout, snapshotWorkout } from '../lib/repo';
import type { WorkoutItem } from '../lib/types';

interface Drag {
  from: number;
  pointerId: number;
  startY: number;
  startScroll: number;
  y: number;
  rowH: number;
}

/** Tela "Reordenar" (como no Hevy): arrastar pelo ≡ muda a ordem e o ⊖ tira o exercício. */
export function ReorderWorkout() {
  const { workoutId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useDialogs();
  const { map } = useExercises();
  const items = useLiveQuery(() => itemsOf(workoutId), [workoutId]);
  const [order, setOrder] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | null>(null);

  useEffect(() => {
    if (items && order === null) setOrder(items.map((it) => it.id));
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      if (scrollTimer.current) cancelAnimationFrame(scrollTimer.current);
    },
    [],
  );

  const goBack = () =>
    withTransition('back', () => {
      if (window.history.state && window.history.state.idx > 0) navigate(-1);
      else navigate(`/treino/${workoutId}`, { replace: true });
    });

  if (!items || !order) return <main className="screen no-tabs" />;
  const byId = new Map(items.map((it) => [it.id, it]));
  const list = order.map((id) => byId.get(id)).filter((it): it is WorkoutItem => !!it);
  const inSuperset = new Set<string>();
  items.forEach((it, i) => {
    if (it.supersetNext && items[i + 1]) {
      inSuperset.add(it.id);
      inSuperset.add(items[i + 1].id);
    }
  });

  const update = () => {
    const d = dragRef.current;
    if (!d) return;
    const dy = d.y - d.startY + (window.scrollY - d.startScroll);
    const to = Math.max(0, Math.min(list.length - 1, Math.round(d.from + dy / d.rowH)));
    setDrag({ from: d.from, to, dy });
  };

  // Perto das bordas da tela, a lista rola sozinha enquanto arrasta.
  const autoScroll = () => {
    const d = dragRef.current;
    if (!d) return;
    const edge = 90;
    const bottom = window.innerHeight - 130;
    const speed = d.y < edge ? -(edge - d.y) / 6 : d.y > bottom ? (d.y - bottom) / 6 : 0;
    if (speed) {
      window.scrollBy(0, speed);
      update();
    }
    scrollTimer.current = requestAnimationFrame(autoScroll);
  };

  const onDown = (i: number) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // sem captura
    }
    const row = rowsRef.current?.children[i] as HTMLElement | undefined;
    dragRef.current = { from: i, pointerId: e.pointerId, startY: e.clientY, startScroll: window.scrollY, y: e.clientY, rowH: row?.offsetHeight || 64 };
    setDrag({ from: i, to: i, dy: 0 });
    scrollTimer.current = requestAnimationFrame(autoScroll);
  };

  const onMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    d.y = e.clientY;
    update();
  };

  const onUp = () => {
    if (scrollTimer.current) cancelAnimationFrame(scrollTimer.current);
    scrollTimer.current = null;
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !drag) {
      setDrag(null);
      return;
    }
    const { from, to } = drag;
    if (from !== to) {
      const next = order.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setOrder(next);
    }
    setDrag(null);
  };

  const shift = (k: number): string | undefined => {
    if (!drag) return undefined;
    const h = dragRef.current?.rowH ?? 64;
    if (k === drag.from) return `translateY(${drag.dy}px)`;
    if (drag.from < drag.to && k > drag.from && k <= drag.to) return `translateY(${-h}px)`;
    if (drag.from > drag.to && k < drag.from && k >= drag.to) return `translateY(${h}px)`;
    return undefined;
  };

  const done = async () => {
    const same = order.length === items.length && order.every((id, i) => items[i].id === id);
    if (same) return goBack();
    const removed = items.length - order.length;
    const snap = await snapshotWorkout(workoutId);
    await reorderWorkoutItems(workoutId, order);
    toast(removed > 0 ? `Ordem salva · ${removed} ${removed === 1 ? 'removido' : 'removidos'}` : 'Ordem salva', {
      action: {
        label: 'Desfazer',
        onClick: () => {
          if (snap) void restoreWorkout(snap);
        },
      },
    });
    goBack();
  };

  return (
    <main className="screen no-tabs with-dock">
      <TopBar
        left={
          <button type="button" className="glass pill accent-text" onClick={goBack}>
            Cancelar
          </button>
        }
        title="Reordenar"
      />
      <p className="small muted" style={{ margin: 0 }}>
        Arraste pelo <Icon name="lines" size={15} /> para mudar a ordem. O <span style={{ color: 'var(--danger)', fontWeight: 700 }}>⊖</span> tira o exercício.
      </p>

      <div className={`reorder-list ${drag ? 'dragging' : ''}`} ref={rowsRef}>
        {list.map((it, k) => {
          const ex = exerciseOrMissing(map, it.exerciseId);
          const moving = drag?.from === k;
          return (
            <div
              key={it.id}
              className={`reorder-row ${moving ? 'moving' : ''} ${inSuperset.has(it.id) ? 'ss' : ''}`}
              style={{ transform: shift(k) }}
            >
              <button
                type="button"
                className="reorder-minus"
                aria-label={`Tirar ${ex.name}`}
                onClick={() => setOrder(order.filter((id) => id !== it.id))}
              >
                <i />
              </button>
              <span className="ex-avatar">
                <ExerciseThumb exercise={ex} />
              </span>
              <span className="grow ellipsis" style={{ fontWeight: 600 }}>
                {ex.name}
              </span>
              <span
                className="reorder-grip"
                aria-label={`Arrastar ${ex.name}`}
                onPointerDown={onDown(k)}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              >
                <Icon name="lines" size={24} color="var(--text-2)" />
              </span>
            </div>
          );
        })}
        {list.length === 0 && <p className="muted small" style={{ padding: '16px 0' }}>Todos os exercícios foram tirados. Toque em Concluído para salvar ou Cancelar para voltar.</p>}
      </div>

      <div className="dock">
        <button type="button" className="btn primary block" onClick={done}>
          Concluído
        </button>
      </div>
    </main>
  );
}
