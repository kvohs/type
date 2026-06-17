// kept/platen.jsx — KeptRoll: kept pages on a roll. Pages travel horizontally as
// preview cards; TAP the focused card to open it full, HOLD it to burn it.
// A horizontal red index line lives at the bottom (the thumb rest): it travels
// left→right with how far through the archive you are, and scrubs the whole roll.
// A haptic detent ticks once per page. Exposes window.KeptRoll.
const { useRef, useState, useEffect, useCallback } = React;

const PITCH = 300;        // px between page centers
const FRICTION = 0.935;
const SNAP = 0.18;
const CULL = 640;
const HOLD_MS = 820;      // press-and-hold a card this long to burn it

function buzz() { try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {} }

function pageCurl(dx) {
  const a = Math.abs(dx);
  const sc = 1 - Math.min(a / 1500, 0.26);
  const ry = Math.max(-26, Math.min(26, -dx * 0.05));
  const tz = -Math.min(a * 0.34, 320);
  const op = Math.max(0.16, 1 - Math.min(a / 720, 0.84));
  return { transform:
    `translate(-50%,-50%) translateX(${dx}px) translateZ(${tz}px) rotateY(${ry}deg) scale(${sc})`,
    opacity: op, zIndex: 1000 - Math.round(a) };
}

function PageFace({ note }) {
  const lines = note.body.split('\n');
  const { fullStamp } = window.keptData;
  return (
    <>
      <div className="page-stamp stamp-date ribbon">{fullStamp(note.date)}</div>
      <div className="page-rule" />
      <div className="page-body ribbon">
        {lines.map((ln, i) => <p key={i} className={i === 0 ? 'lede' : ''}>{ln}</p>)}
      </div>
    </>
  );
}

function OpenedPage({ note, onClose, onShare }) {
  const { fullStamp, keptLine } = window.keptData;
  const lines = note.body.split('\n');
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(() => onClose && onClose(), 240); };
  return (
    <div className={'opened' + (closing ? ' closing' : '')} onClick={close}>
      <div className="opened-sheet" onClick={(e) => e.stopPropagation()}>
        <button className="opened-share" onClick={onShare} aria-label="share">
          <svg viewBox="0 0 18 18" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11.5V2.5" /><path d="M5.5 6L9 2.5 12.5 6" /><path d="M4 9v5.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" />
          </svg>
        </button>
        <div className="opened-scroll">
          <div className="page-stamp stamp-date ribbon">{fullStamp(note.date)}</div>
          <div className="page-rule" />
          <div className="opened-body ribbon">
            {lines.map((ln, i) => <p key={i} className={i === 0 ? 'lede' : ''}>{ln}</p>)}
            <div className="page-meta">{note.words} words · {keptLine(note.date)}</div>
          </div>
        </div>
      </div>
      <button className="opened-close" onClick={close}><span className="k">↓</span></button>
    </div>
  );
}

function KeptRoll({ notes, searching = false, onBurn }) {
  const posRef = useRef(0);
  const velRef = useRef(0);
  const rafRef = useRef(null);
  const settleRef = useRef(false);
  const draggingRef = useRef(false);
  const pageRefs = useRef([]);
  const markRef = useRef(null);
  const dateRef = useRef(null);
  const speedRef = useRef(0);
  const centerRef = useRef(0);
  const [centerIdx, setCenterIdx] = useState(0);
  const [opened, setOpened] = useState(null);
  const [burningId, setBurningId] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const holdRaf = useRef(null);

  const N = notes.length;

  const applyLayout = useCallback(() => {
    const pos = posRef.current;
    for (let i = 0; i < N; i++) {
      const el = pageRefs.current[i];
      if (!el) continue;
      const dx = (i - pos) * PITCH;
      if (Math.abs(dx) > CULL) { el.style.display = 'none'; continue; }
      el.style.display = '';
      const c = pageCurl(dx);
      el.style.transform = c.transform;
      el.style.opacity = c.opacity;
      el.style.zIndex = c.zIndex;
      el.classList.toggle('is-focus', Math.abs(dx) < PITCH * 0.5);
    }
    const frac = N > 1 ? Math.max(0, Math.min(1, pos / (N - 1))) : 0;   // newest left, oldest right
    const leftPct = (4 + frac * 92) + '%';
    if (markRef.current) markRef.current.style.left = leftPct;
    const ci = Math.max(0, Math.min(N - 1, Math.round(pos)));
    if (ci !== centerRef.current) {
      if (draggingRef.current || rafRef.current != null) buzz();   // detent tick per page
      centerRef.current = ci;
    }
    // date affordance above the tick: month at rest, just the year when you move fast
    const speed = Math.abs(pos - speedRef.current); speedRef.current = pos;
    const moving = draggingRef.current || (rafRef.current != null && !settleRef.current);
    const note = notes[ci];
    if (dateRef.current && note) {
      const fast = speed > 0.5;
      dateRef.current.textContent = fast ? String(note.date.getFullYear()) : note.month;
      dateRef.current.classList.toggle('fast', fast);
      dateRef.current.style.left = leftPct;
      dateRef.current.style.opacity = moving ? 0.92 : 0.4;
    }
    setCenterIdx((p) => (p === ci ? p : ci));
  }, [N, notes]);

  const tick = useCallback(() => {
    if (draggingRef.current) { rafRef.current = requestAnimationFrame(tick); return; }
    let pos = posRef.current, vel = velRef.current;
    if (!settleRef.current) {
      pos += vel; vel *= FRICTION;
      if (pos < 0) { pos += (0 - pos) * 0.25; vel *= 0.5; }
      if (pos > N - 1) { pos += (N - 1 - pos) * 0.25; vel *= 0.5; }
      if (Math.abs(vel) < 0.0016) settleRef.current = true;
      velRef.current = vel; posRef.current = pos;
    } else {
      const target = Math.max(0, Math.min(N - 1, Math.round(pos)));
      pos += (target - pos) * SNAP; posRef.current = pos;
      if (Math.abs(target - pos) < 0.001) { posRef.current = target; applyLayout(); rafRef.current = null; return; }
    }
    applyLayout();
    rafRef.current = requestAnimationFrame(tick);
  }, [N, applyLayout]);
  const startLoop = useCallback(() => { if (rafRef.current == null) rafRef.current = requestAnimationFrame(tick); }, [tick]);

  const glideTo = (target) => {
    cancelAnimationFrame(rafRef.current); rafRef.current = null;
    const step = () => {
      const p = posRef.current, np = p + (target - p) * 0.2;
      posRef.current = np; applyLayout();
      if (Math.abs(target - np) < 0.004) { posRef.current = target; applyLayout(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // ----- hold-to-burn on the focused card -----
  const emberEl = () => { const el = pageRefs.current[centerRef.current]; return el && el.querySelector('.ember-hold'); };
  const cancelHold = () => { cancelAnimationFrame(holdRaf.current); holdRaf.current = null; const e = emberEl(); if (e) e.style.opacity = 0; };
  const armHold = (idx) => {
    if (idx !== centerRef.current) return;       // only the focused card burns
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / HOLD_MS);
      const e = emberEl(); if (e) e.style.opacity = (p * 0.85).toFixed(3);
      if (p >= 1) { ignite(notes[centerRef.current]); return; }
      holdRaf.current = requestAnimationFrame(step);
    };
    holdRaf.current = requestAnimationFrame(step);
  };
  const ignite = (note) => {
    cancelAnimationFrame(holdRaf.current); holdRaf.current = null;
    setBurningId(note.id);
    const el = pageRefs.current[centerRef.current];
    if (el) {
      const host = el.querySelector('.spark-host');
      if (host) for (let i = 0; i < 18; i++) {
        const s = document.createElement('i'); s.className = 'spark';
        s.style.left = (10 + Math.random() * 80) + '%';
        s.style.setProperty('--rise', '-' + (80 + Math.random() * 150) + 'px');
        s.style.setProperty('--drift', ((Math.random() - 0.5) * 70) + 'px');
        s.style.animationDelay = (Math.random() * 380) + 'ms';
        host.appendChild(s);
      }
    }
    try { if (navigator.vibrate) navigator.vibrate([10, 40, 16]); } catch (e) {}
    setTimeout(() => { setBurningId(null); onBurn && onBurn(note); }, 1350);
  };

  // ----- drag the pages (scroll) + tap (open / center) + hold (burn) -----
  const drag = useRef({ active: false });
  const onStageDown = (e) => {
    if (burningId || opened) return;
    cancelAnimationFrame(rafRef.current); rafRef.current = null;
    settleRef.current = false; draggingRef.current = true;
    const t = e.target.closest('[data-idx]');
    const idx = t ? +t.dataset.idx : -1;
    drag.current = { active: true, startX: e.clientX, startPos: posRef.current, lastX: e.clientX, lastT: performance.now(), moved: 0, idx };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    if (idx === Math.round(posRef.current)) armHold(idx);
  };
  const onStageMove = (e) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(dx));
    if (drag.current.moved > 7) cancelHold();          // a scroll, not a hold
    posRef.current = drag.current.startPos - dx / PITCH;
    const now = performance.now();
    drag.current.vx = (e.clientX - drag.current.lastX) / Math.max(1, now - drag.current.lastT);
    drag.current.lastX = e.clientX; drag.current.lastT = now;
    applyLayout();
  };
  const endStage = (e) => {
    if (!drag.current.active) return;
    drag.current.active = false; draggingRef.current = false;
    cancelHold();
    if (holdRaf.current === null && burningId) return;   // already igniting
    let vel = -(drag.current.vx || 0) * 16 / PITCH;
    if (Math.abs(vel) > 0.4) vel *= 1.7;
    velRef.current = vel; settleRef.current = false; startLoop();
    if (drag.current.moved < 7) {
      const ci = Math.round(posRef.current);
      const i = drag.current.idx;
      if (i >= 0 && i === ci) { velRef.current = 0; setOpened(notes[i]); }
      else if (i >= 0) { velRef.current = 0; glideTo(i); }
    }
  };

  // ----- the bottom line: horizontal scrubber over the whole archive -----
  const ldrag = useRef({ active: false });
  const onLineDown = (e) => {
    if (burningId || opened) return;
    cancelAnimationFrame(rafRef.current); rafRef.current = null;
    settleRef.current = false; draggingRef.current = true;
    ldrag.current = { active: true, startX: e.clientX, startPos: posRef.current, w: e.currentTarget.getBoundingClientRect().width };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  };
  const onLineMove = (e) => {
    if (!ldrag.current.active) return;
    const dx = e.clientX - ldrag.current.startX;
    const travel = (ldrag.current.w || 280) * 0.88;
    posRef.current = ldrag.current.startPos + (dx / travel) * Math.max(1, N - 1);
    applyLayout();
  };
  const onLineUp = () => {
    if (!ldrag.current.active) return;
    ldrag.current.active = false; draggingRef.current = false;
    velRef.current = 0; settleRef.current = true; startLoop();
  };

  const doShare = (label) => { setShareOpen(false); setToast(label); setTimeout(() => setToast(null), 1500); };

  useEffect(() => { applyLayout(); }, [applyLayout]);
  useEffect(() => () => { cancelAnimationFrame(rafRef.current); cancelAnimationFrame(holdRaf.current); }, []);

  if (N === 0) {
    return (
      <div className="roll-wrap empty">
        <div className="empty-page">
          <div className="empty-line ribbon">{searching ? <>no kept page matches.<br /><span>try another word or date.</span></> : <>nothing kept yet.<br /><span>the pages you keep roll onto here.</span></>}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="roll-wrap">
      <div className="roll-stage" onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={endStage} onPointerCancel={endStage}>
        <div className="roll-plane">
          {notes.map((n, i) => (
            <div key={n.id} data-idx={i} ref={(el) => (pageRefs.current[i] = el)}
              className={'page' + (burningId === n.id ? ' burning' : '')}>
              <PageFace note={n} />
              <div className="ember-hold" aria-hidden="true" />
              <div className="ember-sweep" aria-hidden="true" />
              <div className="spark-host" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>

      {/* the red index line — bottom, horizontal: position + scrubber + thumb rest */}
      <div className="bottom-line" onPointerDown={onLineDown} onPointerMove={onLineMove} onPointerUp={onLineUp} onPointerCancel={onLineUp}>
        <div className="bl-track" />
        <div ref={dateRef} className="bl-date" />
        <div ref={markRef} className="bl-mark" />
      </div>

      {opened && <OpenedPage note={opened} onClose={() => setOpened(null)} onShare={() => setShareOpen(true)} />}

      {shareOpen && (
        <div className="share-scrim" onClick={() => setShareOpen(false)}>
          <div className="share-card" onClick={(e) => e.stopPropagation()}>
            <div className="share-title eyebrow">share this page</div>
            <button className="share-row" onClick={() => doShare('sent the .md file')}>send the .md file<span>›</span></button>
            <button className="share-row" onClick={() => doShare('copied as text')}>copy as plain text<span>›</span></button>
            <button className="share-row" onClick={() => doShare('messaged')}>messages<span>›</span></button>
            <button className="share-cancel" onClick={() => setShareOpen(false)}>cancel</button>
          </div>
        </div>
      )}
      {toast && <div className="reader-toast eyebrow">{toast}</div>}
    </div>
  );
}

window.KeptRoll = KeptRoll;
