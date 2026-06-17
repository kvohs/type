// kept/app.jsx — writing + kept screens, the roll-down/roll-up transition, the
// archive (keep adds, burn removes), search, a settings drawer, and Tweaks.
// type. (top-left) → a fresh draft.  hamburger (top-right) → settings.
// Exposes window.KeptApp.
const { useState: useStateA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light"
}/*EDITMODE-END*/;

function mkNote(text, helpers) {
  const dt = new Date();
  return {
    id: 'u' + Date.now(), date: dt, body: text,
    first: helpers.firstLine(text), words: helpers.wordsOf(text),
    slipDay: helpers.slipDay(dt), month: helpers.monthMark(dt),
  };
}

function KeptApp() {
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const { IOSDevice, KeptRoll, WritingScreen, keptData } = window;
  const [archive, setArchive] = useStateA(keptData.KEPT_NOTES);
  const [screen, setScreen] = useStateA('write');     // 'write' | 'kept'
  const [rollKey, setRollKey] = useStateA(0);
  const [draftKey, setDraftKey] = useStateA(0);
  const [drawer, setDrawer] = useStateA(false);
  const [searching, setSearching] = useStateA(false);
  const [query, setQuery] = useStateA('');

  const isDark = t.theme === 'dark' || t.theme === 'amber';
  const q = query.trim().toLowerCase();
  const visible = q ? archive.filter((n) => (n.body + ' ' + n.slipDay + ' ' + n.month).toLowerCase().includes(q)) : archive;
  const closeSearch = () => { setSearching(false); setQuery(''); };

  const goKept = () => setScreen('kept');
  const goWrite = () => { setDraftKey((k) => k + 1); closeSearch(); setScreen('write'); };  // a fresh draft

  const onKeep = (text) => {
    setArchive((A) => [mkNote(text, keptData), ...A]);
    setRollKey((k) => k + 1);          // roll back to the newest (the one just kept)
    setScreen('kept');
  };
  const onBurn = (note) => setArchive((A) => A.filter((x) => x.id !== note.id));

  return (
    <>
      <IOSDevice dark={isDark}>
        <div className={'screen' + (screen === 'kept' ? ' show-kept' : '')} data-theme={t.theme}>

          {/* ---- writing leaf ---- */}
          <div className="leaf write-leaf">
            <WritingScreen key={draftKey} onHold={goKept} onKeep={onKeep} onSettings={() => setDrawer(true)} />
          </div>

          {/* ---- kept leaf ---- */}
          <div className="leaf kept-leaf">
            <div className="kept-head">
              <button className="kept-mark wordmark" onClick={goWrite}>type<span className="period">.</span></button>
              <div className="kept-actions">
                <button className="kept-icon" onClick={() => setSearching(true)} aria-label="search">
                  <svg viewBox="0 0 18 18" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                    <circle cx="8" cy="8" r="5.2" /><path d="M11.8 11.8l4 4" />
                  </svg>
                </button>
                <button className="kept-icon" onClick={() => setDrawer(true)} aria-label="settings">
                  <svg viewBox="0 0 18 18" width="17" height="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2.5 5h13M2.5 9h13M2.5 13h13" />
                  </svg>
                </button>
              </div>
            </div>

            {searching && (
              <div className="kept-search">
                <svg className="ks-glass" viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <circle cx="8" cy="8" r="5.2" /><path d="M11.8 11.8l4 4" />
                </svg>
                <input className="ks-input" autoFocus placeholder="search what you've kept"
                  value={query} onChange={(e) => setQuery(e.target.value)} />
                {q && <span className="ks-count">{visible.length}</span>}
                <button className="ks-close" onClick={closeSearch} aria-label="close search">&#215;</button>
              </div>
            )}

            <KeptRoll key={'roll-' + rollKey + '-' + (q || 'all')} notes={visible} searching={!!q} onBurn={onBurn} />
          </div>

          <SettingsDrawer open={drawer} t={t} setTweak={setTweak} onClose={() => setDrawer(false)} />
        </div>
      </IOSDevice>

      <Tweaks t={t} setTweak={setTweak} />
    </>
  );
}

function SettingsDrawer({ open, t, setTweak, onClose }) {
  return (
    <div className={'drawer-scrim' + (open ? ' show' : '')} onClick={onClose} aria-hidden={!open}>
      <div className="drawer right" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-title eyebrow">settings</div>
        <div className="drawer-group eyebrow">paper</div>
        <div className="swatches">
          {[['dispatch','Dispatch'],['light','Light'],['dark','Dark'],['amber','Amber']].map(([v, lbl]) => (
            <button key={v} className={'swatch t-' + v + (t.theme === v ? ' on' : '')} onClick={() => setTweak('theme', v)}>
              <span className="chip" /><span className="slbl">{lbl}</span>
            </button>
          ))}
        </div>
        <div className="drawer-note ribbon">tap a page to open it · hold a page to burn it · drag the red line to travel</div>
        <button className="drawer-done" onClick={onClose}>done</button>
      </div>
    </div>
  );
}

function Tweaks({ t, setTweak }) {
  const { TweaksPanel, TweakSection, TweakSelect } = window;
  return (
    <TweaksPanel>
      <TweakSection label="Paper" />
      <TweakSelect label="Theme" value={t.theme}
        options={['dispatch', 'light', 'dark', 'amber']}
        onChange={(v) => setTweak('theme', v)} />
    </TweaksPanel>
  );
}

window.KeptApp = KeptApp;
