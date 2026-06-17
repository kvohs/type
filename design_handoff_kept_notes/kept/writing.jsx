// kept/writing.jsx — the clean writing sheet. Wordmark "type." sits at the
// bottom: tap it to write (lines roll up the page, can't be edited), or
// press-and-hold to roll the sheet down and bring up the kept-notes platen.
// Exposes window.WritingScreen.
const { useRef: useRefW, useState: useStateW, useEffect: useEffectW } = React;

const HOLD_MS = 440;

function WritingScreen({ onHold, onKeep, onSettings }) {
  const [writing, setWriting] = useStateW(false);
  const [locked, setLocked] = useStateW([]);
  const [current, setCurrent] = useStateW('');
  const [holdP, setHoldP] = useStateW(0);
  const holdRaf = useRefW(null);
  const firedRef = useRefW(false);
  const lockedRef = useRefW([]); const curRef = useRefW('');
  lockedRef.current = locked; curRef.current = current;

  // ---- wordmark press: tap = write, hold = kept ----
  const onMarkDown = (e) => {
    e.preventDefault();
    firedRef.current = false;
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / HOLD_MS);
      setHoldP(p);
      if (p >= 1) { firedRef.current = true; setHoldP(0); onHold && onHold(); return; }
      holdRaf.current = requestAnimationFrame(step);
    };
    holdRaf.current = requestAnimationFrame(step);
  };
  const onMarkUp = () => {
    cancelAnimationFrame(holdRaf.current);
    if (!firedRef.current) { setHoldP(0); if (!writing) setWriting(true); }
  };
  const onMarkLeave = () => { cancelAnimationFrame(holdRaf.current); setHoldP(0); };

  // ---- minimal real typing while in writing mode (mirrors the app) ----
  useEffectW(() => {
    if (!writing) return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); setLocked((L) => [...L, curRef.current]); setCurrent(''); }
      else if (e.key === 'Backspace') { e.preventDefault(); setCurrent((c) => c.slice(0, -1)); }
      else if (e.key === 'Escape') { e.preventDefault(); abandon(); }
      else if (e.key.length === 1) { e.preventDefault(); setCurrent((c) => c + e.key); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [writing]);

  const hasText = locked.join('').length + current.length > 0;
  const abandon = () => { setWriting(false); setLocked([]); setCurrent(''); };
  const keep = () => {
    const text = [...locked, current].join('\n').replace(/\s+$/, '');
    abandon();
    if (text) onKeep && onKeep(text);
    else if (onHold) onHold();
  };

  return (
    <div className={'writing' + (writing ? ' is-writing' : '')}>
      {!writing && (
        <button className="write-gear" onClick={onSettings} aria-label="settings">
          <svg viewBox="0 0 18 18" width="17" height="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2.5 5h13M2.5 9h13M2.5 13h13" /></svg>
        </button>
      )}
      {/* the rolled-up, uneditable lines + active line at the strike point */}
      <div className="write-feed">
        {locked.map((ln, i) => <div key={i} className="wline">{ln || '\u00a0'}</div>)}
        <div className="wline active">
          {current}<span className="wcaret" />
        </div>
      </div>

      {!writing && <div className="welcome" />}

      {/* edge hints when writing */}
      {writing && (
        <div className="write-hints">
          <button className="wh keep" onClick={keep} disabled={!hasText}><span className="l">keep</span></button>
          <button className="wh" onClick={abandon}><span className="l">{hasText ? 'burn' : 'done'}</span></button>
        </div>
      )}

      {/* the wordmark — landmark at the bottom */}
      <div className="mark-zone">
        <button className="type-mark wordmark"
          onPointerDown={onMarkDown} onPointerUp={onMarkUp}
          onPointerLeave={onMarkLeave} onPointerCancel={onMarkLeave}
          style={{ opacity: writing ? 0 : 1, pointerEvents: writing ? 'none' : 'auto' }}>
          type<span className="period">.</span>
          <span className="mark-hold" style={{ transform: `scaleX(${holdP})` }} />
        </button>
      </div>
    </div>
  );
}

window.WritingScreen = WritingScreen;
