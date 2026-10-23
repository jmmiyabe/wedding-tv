// Delicate botanical line art, generated as inline SVG (no image requests).
// Purely decorative: every piece is aria-hidden.

type Point = [number, number];

interface SprigSpec {
  start: Point;
  control: Point;
  end: Point;
  leaves: number;
  leafLength: number;
  /** Leaf width relative to length: ~0.5 for eucalyptus, ~0.22 for olive. */
  roundness: number;
}

function bezier(spec: SprigSpec, t: number): { point: Point; angle: number } {
  const [p0, p1, p2] = [spec.start, spec.control, spec.end];
  const u = 1 - t;
  const point: Point = [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
  const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
  const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
  return { point, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

function buildSprig(spec: SprigSpec) {
  const stem = `M${spec.start.join(",")} Q${spec.control.join(",")} ${spec.end.join(",")}`;
  const leaves = Array.from({ length: spec.leaves }, (_, i) => {
    const t = 0.1 + (i / spec.leaves) * 0.86;
    const { point, angle } = bezier(spec, t);
    const side = i % 2 === 0 ? 1 : -1;
    const length = spec.leafLength * (1 - 0.45 * t);
    const width = length * spec.roundness;
    return {
      transform: `translate(${point[0].toFixed(1)} ${point[1].toFixed(1)}) rotate(${(angle + side * 48).toFixed(1)})`,
      d: `M0,0 Q${(length * 0.42).toFixed(1)},${(-width).toFixed(1)} ${length.toFixed(1)},0 Q${(length * 0.42).toFixed(1)},${width.toFixed(1)} 0,0Z`,
      rib: `M0,0 L${(length * 0.8).toFixed(1)},0`,
    };
  });
  const tip = bezier(spec, 1);
  const tipLeaf = {
    transform: `translate(${tip.point[0].toFixed(1)} ${tip.point[1].toFixed(1)}) rotate(${tip.angle.toFixed(1)})`,
    d: `M0,0 Q${(spec.leafLength * 0.22).toFixed(1)},${(-spec.leafLength * 0.13).toFixed(1)} ${(spec.leafLength * 0.5).toFixed(1)},0 Q${(spec.leafLength * 0.22).toFixed(1)},${(spec.leafLength * 0.13).toFixed(1)} 0,0Z`,
    rib: "",
  };
  return { stem, leaves: [...leaves, tipLeaf] };
}

const EUCALYPTUS = buildSprig({ start: [20, 230], control: [40, 90], end: [150, 20], leaves: 11, leafLength: 34, roundness: 0.55 });
const OLIVE = buildSprig({ start: [10, 120], control: [110, 120], end: [230, 40], leaves: 14, leafLength: 30, roundness: 0.2 });

function SprigArt({ sprig, viewBox, className }: { sprig: ReturnType<typeof buildSprig>; viewBox: string; className?: string }) {
  return (
    <svg viewBox={viewBox} className={className} aria-hidden="true" focusable="false" fill="none">
      <path d={sprig.stem} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      {sprig.leaves.map((leaf, i) => (
        <g key={i} transform={leaf.transform}>
          <path d={leaf.d} fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
          {leaf.rib && <path d={leaf.rib} stroke="currentColor" strokeWidth="0.6" strokeOpacity="0.6" strokeLinecap="round" />}
        </g>
      ))}
    </svg>
  );
}

/** Upright eucalyptus branch. */
export function EucalyptusSprig({ className }: { className?: string }) {
  return <SprigArt sprig={EUCALYPTUS} viewBox="0 0 180 240" className={className} />;
}

/** Horizontal olive branch. */
export function OliveSprig({ className }: { className?: string }) {
  return <SprigArt sprig={OLIVE} viewBox="0 0 240 140" className={className} />;
}

/** Small centred ornament: two mirrored olive sprigs around a gold diamond. */
export function FloralDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 text-sage ${className}`} aria-hidden="true">
      <OliveSprig className="h-6 w-auto -scale-x-100 opacity-80" />
      <svg viewBox="0 0 12 12" className="size-2.5 text-accent">
        <path d="M6 0 L12 6 L6 12 L0 6Z" fill="currentColor" />
      </svg>
      <OliveSprig className="h-6 w-auto opacity-80" />
    </div>
  );
}
