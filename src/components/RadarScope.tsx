import { useMemo, useState } from 'react';
import type { Scored, Source } from '../lib/types';
import { navigate } from '../lib/router';
import { RING_NOW, RING_TODAY } from '../lib/scoring';
import { SOURCE_META } from './bits';

const SIZE = 400;
const C = SIZE / 2;
const R = 176;

// Each source owns a quadrant. Angles are in SVG degrees (0 = east, clockwise).
const QUADRANTS: Record<Source, number> = { jira: -90, github: 0, email: 90, slack: 180 };
const ORDER: Source[] = ['jira', 'github', 'email', 'slack'];

function radiusFor(score: number) {
  // Inner ring = needs attention now; the higher the score, the closer to the centre.
  if (score >= RING_NOW) return R * (0.08 + ((100 - score) / (100 - RING_NOW)) * 0.25);
  if (score >= RING_TODAY) return R * (0.38 + ((RING_NOW - 1 - score) / (RING_NOW - 1 - RING_TODAY)) * 0.26);
  return R * (0.7 + ((RING_TODAY - 1 - Math.max(0, score)) / (RING_TODAY - 1)) * 0.24);
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
};

/**
 * The radar: every open item is a blip. Distance from the centre is urgency (score),
 * the quadrant is the source, colour is state (blocked, waiting on you, other).
 */
export function RadarScope({ ranked }: { ranked: Scored[] }) {
  const [hover, setHover] = useState<Scored | null>(null);

  const blips = useMemo(() => {
    const out: { s: Scored; x: number; y: number; r: number; tone: string }[] = [];
    for (const src of ORDER) {
      const list = ranked.filter((s) => s.item.source === src).slice(0, 14);
      list.forEach((s, i) => {
        const span = 90 - 16;
        const angle = QUADRANTS[src] + 8 + ((i + 0.5) / list.length) * span + ((hash(s.item.id) % 7) - 3);
        const rad = radiusFor(s.score) + ((hash(s.item.id) % 9) - 4);
        const { x, y } = polar(rad, angle);
        const impact = s.factors.find((f) => f.key === 'impact')?.value ?? 0.4;
        const tone = s.item.status === 'blocked' ? 'blocked' : s.item.signals.waitingOnMe || (!s.item.assignee && s.ring === 'now') ? 'you' : 'other';
        out.push({ s, x, y, r: 4 + impact * 5, tone });
      });
    }
    return out;
  }, [ranked]);

  const now = ranked.filter((s) => s.ring === 'now').length;
  const counts = Object.fromEntries(ORDER.map((src) => [src, ranked.filter((s) => s.item.source === src).length])) as Record<Source, number>;
  const corner: Record<Source, { x: number; y: number; anchor: 'start' | 'end' }> = {
    jira: { x: SIZE - 10, y: 22, anchor: 'end' },
    github: { x: SIZE - 10, y: SIZE - 12, anchor: 'end' },
    email: { x: 10, y: SIZE - 12, anchor: 'start' },
    slack: { x: 10, y: 22, anchor: 'start' },
  };

  return (
    <figure className="scope" aria-label={`Radar of ${ranked.length} open items, ${now} need attention now`}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="scope-svg" role="group">
        <defs>
          <radialGradient id="scopeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--scope-glow)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--scope-glow)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={R} fill="url(#scopeGlow)" />
        {/* Rings: Later (outer), Today, Now (inner) */}
        {[1, 0.66, 0.35].map((k, i) => (
          <circle key={k} cx={C} cy={C} r={R * k} className={`scope-ring scope-ring-${i}`} />
        ))}
        <line x1={C - R} y1={C} x2={C + R} y2={C} className="scope-axis" />
        <line x1={C} y1={C - R} x2={C} y2={C + R} className="scope-axis" />
        <text x={C + 6} y={C - R * 0.35 + 14} className="scope-ring-label">Now</text>
        <text x={C + 6} y={C - R * 0.66 + 14} className="scope-ring-label">Today</text>
        <text x={C + 6} y={C - R + 14} className="scope-ring-label">Later</text>

        <g className="scope-sweep">
          {Array.from({ length: 14 }, (_, i) => {
            const a0 = polar(R, -i * 3);
            const a1 = polar(R, -(i + 1) * 3 - 0.4);
            return <path key={i} d={`M ${C} ${C} L ${a0.x} ${a0.y} A ${R} ${R} 0 0 0 ${a1.x} ${a1.y} Z`} className="scope-sweep-slice" style={{ opacity: 0.26 * (1 - i / 14) }} />;
          })}
          <line x1={C} y1={C} x2={C + R} y2={C} className="scope-sweep-line" />
        </g>

        {ORDER.map((src) => (
          <text key={src} x={corner[src].x} y={corner[src].y} textAnchor={corner[src].anchor} className="scope-quad-label">
            {SOURCE_META[src].label} {counts[src]}
          </text>
        ))}

        {blips.map(({ s, x, y, r, tone }) => (
          <a
            key={s.item.id}
            href={`#/item/${s.item.id}`}
            className={`blip blip-${tone}${hover?.item.id === s.item.id ? ' is-hover' : ''}`}
            aria-label={`${s.item.ref}: ${s.item.title}. Score ${s.score}.`}
            onMouseEnter={() => setHover(s)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(s)}
            onBlur={() => setHover(null)}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/item/${s.item.id}`);
            }}
          >
            <circle cx={x} cy={y} r={r + 7} className="blip-hit" />
            {s.ring === 'now' && <circle cx={x} cy={y} r={r + 3.5} className="blip-halo" />}
            <circle cx={x} cy={y} r={r} className="blip-dot" />
          </a>
        ))}
        <circle cx={C} cy={C} r={3} className="scope-center" />
      </svg>
      <figcaption className="scope-caption" aria-live="polite">
        {hover ? (
          <>
            <span className="scope-caption-ref">{hover.item.ref}</span>
            <span className="scope-caption-title">{hover.item.title}</span>
            <span className="scope-caption-score">{hover.score}</span>
          </>
        ) : (
          <span className="scope-legend">
            <span><i className="dot dot-blocked" />Blocked</span>
            <span><i className="dot dot-you" />Waiting on you</span>
            <span><i className="dot dot-other" />Everything else</span>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
