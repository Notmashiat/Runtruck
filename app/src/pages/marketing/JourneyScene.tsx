import { useState } from 'react';
import { JOURNEY, stepAt } from '../../data/site';
import { useScrollProgress } from '../../lib/scrollFx';

// The scroll scene: one load from booked to paid. The section is several
// screens tall and the scene inside it stays pinned, so scrolling drives the
// truck: the road, the hills and the stops move past it, its wheels turn,
// day turns to night, and the caption and the load card step through the
// load's statuses. Everything is driven by one number, `--p` (0 at the
// start of the section, 1 at the end), which lib/scrollFx.ts keeps up to
// date; the positions are worked out from it in styles/site.css.

// Where things stand along the road, in screen-widths from the start.
const STOPS = [
  { at: 26, label: 'Your yard', kind: 'yard' },
  { at: 180, label: 'Pickup · Fresno, CA', kind: 'dock' },
  { at: 352, label: 'Delivery · Reno, NV', kind: 'dock' },
  { at: 548, label: 'Home terminal', kind: 'yard' },
] as const;
const SIGNS = [
  { at: 112, text: 'FRESNO 12' },
  { at: 268, text: 'RENO 186' },
  { at: 452, text: 'HOME 240' },
];
const TREES = [62, 84, 138, 152, 226, 244, 300, 318, 408, 426, 486, 506, 600, 616];

function Wheel({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 146)`}>
      <g className="mk-wheel">
        <circle r="22" fill="#1b2029" />
        <circle r="12" fill="#c9d0dc" />
        <path d="M0 -10V10M-10 0H10M-7 -7L7 7M-7 7L7 -7" stroke="#7d8798" strokeWidth="2" strokeLinecap="round" />
        <circle r="3.5" fill="#566074" />
      </g>
    </g>
  );
}

function Truck() {
  return (
    <svg className="mk-truck" viewBox="0 0 700 172" role="img" aria-label="A RunTruck tractor-trailer">
      {/* trailer */}
      <rect x="8" y="16" width="476" height="106" rx="8" fill="#ffffff" stroke="#cfd6e2" strokeWidth="2" />
      <rect x="8" y="102" width="476" height="7" fill="#1e5eff" />
      <rect x="34" y="44" width="24" height="24" rx="6" fill="#1e5eff" />
      <text x="70" y="64" fontFamily="Inter, system-ui, sans-serif" fontWeight="700" fontSize="24" letterSpacing="2" fill="#111827">RUNTRUCK</text>
      <rect x="20" y="122" width="390" height="7" fill="#5b6475" />
      <rect x="384" y="129" width="6" height="22" fill="#5b6475" />
      {/* tractor */}
      <rect x="432" y="124" width="246" height="9" rx="3" fill="#3f4756" />
      <rect x="486" y="22" width="6" height="100" rx="3" fill="#9aa3b2" />
      <path d="M494 124V44q0-10 10-10h66q10 0 15 9l21 39h52q16 0 16 16v26Z" fill="#1e5eff" />
      <path d="M494 34q4-15 28-15h22l10 15Z" fill="#164bd6" />
      <path d="M550 46h20q6 0 9 5l14 27h-43Z" fill="#d6e6ff" />
      <path d="M542 46v74" stroke="#164bd6" strokeWidth="2" />
      <rect x="526" y="126" width="46" height="15" rx="7" fill="#c9d0dc" />
      <rect x="664" y="110" width="15" height="14" rx="3" fill="#9aa3b2" />
      <rect x="667" y="94" width="8" height="9" rx="2" fill="#ffe9a8" />
      <Wheel x={70} /><Wheel x={120} /><Wheel x={452} /><Wheel x={502} /><Wheel x={636} />
    </svg>
  );
}

function Building({ kind }: { kind: 'yard' | 'dock' }) {
  return kind === 'dock' ? (
    <svg viewBox="0 0 300 150" aria-hidden="true">
      <rect x="0" y="34" width="300" height="116" fill="#e9edf4" stroke="#c3cbd9" strokeWidth="2" />
      <rect x="0" y="22" width="300" height="14" fill="#aab4c5" />
      {[24, 116, 208].map((x) => (
        <g key={x}>
          <rect x={x} y="72" width="68" height="78" fill="#55607a" />
          <path d={`M${x} 90h68M${x} 108h68M${x} 126h68`} stroke="#6b7690" strokeWidth="2" />
          <rect x={x + 24} y="54" width="20" height="10" rx="2" fill="#f2b45c" />
        </g>
      ))}
    </svg>
  ) : (
    <svg viewBox="0 0 300 150" aria-hidden="true">
      <rect x="20" y="58" width="150" height="92" fill="#e9edf4" stroke="#c3cbd9" strokeWidth="2" />
      <path d="M10 60 95 22l85 38Z" fill="#aab4c5" />
      <rect x="44" y="86" width="34" height="30" rx="2" fill="#bcd6ff" />
      <rect x="110" y="86" width="34" height="64" fill="#55607a" />
      <rect x="196" y="96" width="92" height="54" fill="#dfe4ed" stroke="#c3cbd9" strokeWidth="2" />
      <rect x="208" y="110" width="68" height="40" fill="#55607a" />
    </svg>
  );
}

export function JourneyScene() {
  const [step, setStep] = useState(0);
  const ref = useScrollProgress<HTMLElement>('through', (p) => setStep(stepAt(p)));

  // Jump to a step: scroll to where it starts.
  const goTo = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const travel = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (JOURNEY[i].from + 0.02) * travel, behavior: 'smooth' });
  };

  const now = JOURNEY[step];
  return (
    <section id="journey" className="mk-journey" ref={ref} aria-label="One load, from booked to paid">
      <div className="mk-scene">
        <div className="mk-art" aria-hidden="true">
          <div className="mk-sky" />
          <div className="mk-night" />
          <div className="mk-stars" />
          <div className="mk-sun" />
          <svg className="mk-hills mk-hills-far" viewBox="0 0 2400 300" preserveAspectRatio="none">
            <path d="M0 300V180Q150 80 300 170T600 150T900 180T1200 120T1500 170T1800 140T2100 180T2400 150V300Z" />
          </svg>
          <svg className="mk-hills mk-hills-near" viewBox="0 0 2400 300" preserveAspectRatio="none">
            <path d="M0 300V220Q200 140 400 215T800 205T1200 225T1600 195T2000 220T2400 200V300Z" />
          </svg>
          <div className="mk-world">
            {TREES.map((at) => (
              <svg key={at} className="mk-tree" style={{ left: `${at}vw` }} viewBox="0 0 40 80">
                <rect x="17" y="54" width="6" height="26" fill="#6b5a45" />
                <path d="M20 0 38 38H2ZM20 22 40 60H0Z" fill="#3f8f5f" />
              </svg>
            ))}
            {SIGNS.map((s) => (
              <div key={s.at} className="mk-sign" style={{ left: `${s.at}vw` }}><span>{s.text}</span></div>
            ))}
            {STOPS.map((s) => (
              <div key={s.at} className="mk-stop" style={{ left: `${s.at}vw` }}>
                <span className="mk-stop-label">{s.label}</span>
                <Building kind={s.kind} />
              </div>
            ))}
          </div>
          <div className="mk-road" />
          <div className="mk-beam" />
        </div>
        <Truck />

        <div className="mk-scene-ui">
          <div className="mk-scene-head">
            <p className="mk-eyebrow">One load, start to finish</p>
            <ol className="mk-rail">
              {JOURNEY.map((s, i) => (
                <li key={s.key} className={i === step ? 'is-on' : i < step ? 'is-done' : ''}>
                  <button type="button" onClick={() => goTo(i)} aria-current={i === step ? 'step' : undefined}>{s.status}</button>
                </li>
              ))}
            </ol>
          </div>
          <div className="mk-scene-body">
            <div className="mk-captions">
              {JOURNEY.map((s, i) => (
                <article key={s.key} className={`mk-caption${i === step ? ' is-on' : ''}`} aria-hidden={i === step ? undefined : true}>
                  <span className="mk-step-no">{String(i + 1).padStart(2, '0')}</span>
                  <h2>{s.title}</h2>
                  <p>{s.body}</p>
                </article>
              ))}
            </div>
            <aside className="mk-loadcard" aria-label="The load, as RunTruck shows it">
              <div className="mk-loadcard-head">
                <strong>L-40218</strong>
                <span className={`ui-chip ui-chip-${now.chip}`}>{now.status}</span>
              </div>
              <div className="mk-loadcard-route">Fresno, CA → Reno, NV · 300 mi</div>
              <dl>
                <div><dt>Line haul + fuel + accessorials</dt><dd>$2,390.00</dd></div>
              </dl>
              <ul>
                <li className={step >= 1 ? 'is-on' : ''}>Driver and truck assigned</li>
                <li className={step >= 3 ? 'is-on' : ''}>Proof of delivery attached</li>
                <li className={step >= 4 ? 'is-on' : ''}>Invoice sent</li>
                <li className={step >= 5 ? 'is-on' : ''}>Paid · counted in the pay run</li>
              </ul>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
