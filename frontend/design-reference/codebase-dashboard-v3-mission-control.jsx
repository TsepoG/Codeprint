import React, { useState, useEffect, useMemo } from "react";
import {
  Radar,
  GitBranch,
  Bug,
  ShieldAlert,
  FileCode2,
  Copy,
  Server,
  X,
  AlertTriangle,
  Crosshair,
  Orbit,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const REPO = { name: "acme/storefront-web", branch: "main", commit: "a3f9c21", elapsed: "T+00:04:12" };
const HEALTH_SCORE = 78;

const SEV = { high: "#ff5c5c", medium: "#ffb84d", low: "#4fe8a0" };
const SEV_LABEL = { high: "CRITICAL", medium: "CAUTION", low: "NOMINAL" };
const SEV_DESC = {
  high: "Critical — an active risk: a security vulnerability, a circular dependency, or complexity far past a safe threshold. Fix before adding more code here.",
  medium: "Caution — above a healthy threshold but not breaking anything today. Worth cleaning up next time you're in this file.",
  low: "Nominal — within healthy thresholds for this project. No action needed.",
};
const HEALTH_DESC = "A single score built from bugs, vulnerabilities, code smells, duplication and test coverage across the repo. Calculation: start at 100, subtract 6 points per critical finding and 2 per caution finding, subtract 1 point per percentage of duplication above 5%, and subtract up to 15 points for coverage under 70%.";

const CHIPS = [
  { id: "bugs", label: "Bugs", icon: Bug, value: 6, severity: "high" },
  { id: "vulns", label: "Vulnerabilities", icon: ShieldAlert, value: 11, severity: "high" },
  { id: "smells", label: "Code smells", icon: FileCode2, value: 23, severity: "medium" },
  { id: "dup", label: "Duplication", icon: Copy, value: "6.2%", severity: "medium" },
  { id: "infra", label: "Infra findings", icon: Server, value: 4, severity: "low" },
];

const HOTSPOTS = [
  { path: "src/checkout/Checkout.jsx", complexity: 24, coveragePct: 41, duplicationPct: 3.1, loc: 412, severity: "high" },
  { path: "src/product/ProductList.jsx", complexity: 19, coveragePct: 38, duplicationPct: 11.4, loc: 356, severity: "high" },
  { path: "src/context/CartContext.jsx", complexity: 15, coveragePct: 52, duplicationPct: 2.0, loc: 210, severity: "medium" },
  { path: "src/user/UserProfile.jsx", complexity: 12, coveragePct: 67, duplicationPct: 4.6, loc: 188, severity: "medium" },
  { path: "src/orders/OrderHistory.jsx", complexity: 11, coveragePct: 74, duplicationPct: 1.2, loc: 165, severity: "medium" },
  { path: "src/utils/validators.js", complexity: 9, coveragePct: 88, duplicationPct: 0.4, loc: 96, severity: "low" },
  { path: "src/api/orders.js", complexity: 7, coveragePct: 91, duplicationPct: 0.0, loc: 74, severity: "low" },
];

const FINDINGS_BY_FILE = {
  "src/context/CartContext.jsx": ["Circular import with ProductList.jsx — both modules import each other's exports"],
  "src/product/ProductList.jsx": ["Circular import with CartContext.jsx", "Cognitive complexity 19 exceeds threshold of 15"],
  "src/checkout/Checkout.jsx": ["Cognitive complexity 24 exceeds threshold of 15", "Missing null check on `order.items` before reduce"],
};

const CENTER = { x: 300, y: 300 };
function polar(angleDeg, r) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER.x + r * Math.cos(rad), y: CENTER.y - r * Math.sin(rad) };
}

const NODES = [
  { id: "app", label: "App.jsx", x: CENTER.x, y: CENTER.y, core: true, severity: "low", dependents: [], dependencies: ["router"] },
  { id: "router", label: "Router", ...polar(90, 90), severity: "low", dependents: ["app"], dependencies: ["auth", "checkout", "userprofile"] },
  { id: "auth", label: "AuthContext", ...polar(50, 170), severity: "low", dependents: ["router"], dependencies: ["checkout"] },
  { id: "cart", label: "CartContext", ...polar(150, 170), severity: "high", circular: true, dependents: [], dependencies: ["checkout", "productlist"] },
  { id: "checkout", label: "Checkout", ...polar(15, 170), severity: "high", dependents: ["router", "auth", "cart"], dependencies: ["apiorders", "validators"] },
  { id: "userprofile", label: "UserProfile", ...polar(175, 170), severity: "medium", dependents: ["router"], dependencies: ["formatters"] },
  { id: "productlist", label: "ProductList", ...polar(120, 250), severity: "high", circular: true, dependents: ["cart"], dependencies: ["cart", "apiproducts"] },
  { id: "apiorders", label: "api/orders.js", ...polar(-20, 250), severity: "low", dependents: ["checkout"], dependencies: [] },
  { id: "validators", label: "utils/validators.js", ...polar(35, 250), severity: "low", dependents: ["checkout"], dependencies: [] },
  { id: "formatters", label: "utils/formatters.js", ...polar(195, 250), severity: "low", dependents: ["userprofile"], dependencies: [] },
  { id: "apiproducts", label: "api/products.js", ...polar(145, 250), severity: "low", dependents: ["productlist"], dependencies: [] },
];

const EDGES = [
  { from: "app", to: "router" },
  { from: "router", to: "auth" },
  { from: "router", to: "checkout" },
  { from: "router", to: "userprofile" },
  { from: "auth", to: "checkout" },
  { from: "cart", to: "checkout" },
  { from: "cart", to: "productlist", circular: true },
  { from: "productlist", to: "cart", circular: true },
  { from: "productlist", to: "apiproducts" },
  { from: "checkout", to: "apiorders" },
  { from: "checkout", to: "validators" },
  { from: "userprofile", to: "formatters" },
];

const TABS = [
  { id: "overview", label: "Overview", icon: Crosshair },
  { id: "depmap", label: "Orbital map", icon: Orbit },
  { id: "hotspots", label: "Hotspots", icon: Radar },
];

// ---------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------

function StyleSheet() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&display=swap');

      .mc{ --bg:#03060a; --panel:#0a121b; --panel-raised:#101c29; --cyan:#4dd8ff; --cyan-dim:#2a5a72;
        --ink:#d8ecfa; --ink-dim:#4f7189; --mint:#4fe8a0; --amber:#ffb84d; --red:#ff5c5c; --border:#122234;
        font-family:'Rajdhani',sans-serif; color:var(--ink); background:var(--bg);
        display:flex; min-height:680px; border:1px solid var(--border); border-radius:2px; overflow:hidden; }
      .mc-mono{font-family:'Share Tech Mono',monospace;}

      .mc-side{width:200px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--border);
        display:flex;flex-direction:column;padding:22px 14px;}
      .mc-brand{display:flex;align-items:center;gap:10px;padding:0 4px 18px;border-bottom:1px solid var(--border);margin-bottom:16px;}
      .mc-mark{width:22px;height:22px;border:2px solid var(--cyan);border-radius:50%;position:relative;flex-shrink:0;}
      .mc-mark::before{content:'';position:absolute;inset:6px;border-radius:50%;background:var(--cyan);}
      .mc-brand-name{font-weight:700;font-size:15px;letter-spacing:0.06em;}

      .mc-nav{display:flex;flex-direction:column;gap:3px;margin-bottom:18px;}
      .mc-navitem{display:flex;align-items:center;gap:10px;height:36px;padding:0 12px;
        border-left:2px solid transparent;font-size:13px;font-weight:600;letter-spacing:0.03em;
        color:var(--ink-dim);background:none;border-top:none;border-right:none;border-bottom:none;
        text-align:left;width:100%;cursor:pointer;transition:all 0.15s ease;text-transform:uppercase;}
      .mc-navitem.active{color:var(--cyan);border-left:2px solid var(--cyan);background:rgba(77,216,255,0.06);}
      .mc-navitem:hover:not(.active){color:var(--ink);}

      .mc-tblock{margin-top:auto;border:1px solid var(--border);font-size:10px;}
      .mc-tblock-row{display:flex;border-bottom:1px solid var(--border);}
      .mc-tblock-row:last-child{border-bottom:none;}
      .mc-tblock-cell{flex:1;padding:7px 9px;}
      .mc-tblock-label{display:block;color:var(--ink-dim);letter-spacing:0.06em;margin-bottom:2px;text-transform:uppercase;font-size:9px;}

      .mc-main{flex:1;display:flex;flex-direction:column;min-width:0;}
      .mc-top{display:flex;align-items:center;justify-content:space-between;padding:14px 26px;border-bottom:1px solid var(--border);}
      .mc-repo{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--ink-dim);letter-spacing:0.02em;}
      .mc-repo b{color:var(--ink);font-weight:700;}
      .mc-elapsed{font-size:11px;color:var(--ink-dim);}
      .mc-status{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:0.06em;
        color:var(--mint);text-transform:uppercase;}
      .mc-status-dot{width:6px;height:6px;border-radius:50%;background:var(--mint);box-shadow:0 0 6px var(--mint);}

      .mc-canvas{flex:1;padding:28px;overflow:auto;position:relative;}

      .mc-frame{position:relative;background:var(--panel);border:1px solid var(--border);}
      .mc-corner{position:absolute;width:15px;height:15px;pointer-events:none;}
      .mc-corner.tl{top:-1px;left:-1px;border-top:2px solid var(--cyan);border-left:2px solid var(--cyan);}
      .mc-corner.tr{top:-1px;right:-1px;border-top:2px solid var(--cyan);border-right:2px solid var(--cyan);}
      .mc-corner.bl{bottom:-1px;left:-1px;border-bottom:2px solid var(--cyan);border-left:2px solid var(--cyan);}
      .mc-corner.br{bottom:-1px;right:-1px;border-bottom:2px solid var(--cyan);border-right:2px solid var(--cyan);}

      .mc-hero{display:grid;grid-template-columns:220px 1fr;gap:32px;padding:28px;margin-bottom:18px;align-items:center;}
      .mc-dial-wrap{position:relative;width:180px;height:180px;}
      .mc-dial-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
      .mc-dial-val{font-size:40px;font-weight:700;font-family:'Share Tech Mono',monospace;}
      .mc-dial-lbl{font-size:10px;color:var(--ink-dim);letter-spacing:0.1em;margin-top:2px;}
      .mc-hero-status{font-size:17px;font-weight:700;letter-spacing:0.04em;margin-bottom:8px;text-transform:uppercase;}
      .mc-hero-sub{font-size:13.5px;color:var(--ink-dim);line-height:1.65;max-width:460px;margin-bottom:14px;}
      .mc-hero-item{display:flex;align-items:center;gap:9px;font-size:12.5px;margin-bottom:6px;}
      .mc-hero-item .mc-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
      .mc-hero-item span:last-child{color:var(--ink-dim);}

      .mc-chips{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:18px;}
      .mc-chip{background:var(--panel);border:1px solid var(--border);padding:13px 14px;
        cursor:pointer;transition:border-color 0.15s ease;text-align:left;}
      .mc-chip:hover{border-color:var(--cyan-dim);}
      .mc-chip-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;}
      .mc-chip-label{font-size:10.5px;color:var(--ink-dim);letter-spacing:0.05em;text-transform:uppercase;}
      .mc-chip-val{font-size:22px;font-weight:700;font-family:'Share Tech Mono',monospace;}

      .mc-panel-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;
        border-bottom:1px solid var(--border);font-size:11px;color:var(--ink-dim);letter-spacing:0.06em;text-transform:uppercase;}

      table.mc-table{width:100%;border-collapse:collapse;}
      .mc-table th{text-align:left;font-size:10.5px;color:var(--ink-dim);font-weight:600;letter-spacing:0.05em;
        text-transform:uppercase;padding:10px 18px;border-bottom:1px solid var(--border);}
      .mc-table td{padding:11px 18px;border-bottom:1px solid rgba(18,34,52,0.7);font-size:13px;}
      .mc-table tr:last-child td{border-bottom:none;}
      .mc-table tr{cursor:pointer;}
      .mc-table tr:hover td{background:rgba(77,216,255,0.04);}
      .mc-bar{display:inline-block;width:56px;height:3px;background:rgba(77,216,255,0.1);overflow:hidden;vertical-align:middle;margin-right:8px;}
      .mc-bar>span{display:block;height:100%;}
      .mc-sev{position:relative;display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;
        letter-spacing:0.04em;cursor:help;}
      .mc-sev .mc-dot{width:6px;height:6px;border-radius:50%;}

      .mc-tip-wrap{position:relative;display:inline-flex;align-items:center;gap:5px;cursor:help;}
      .mc-tip{position:absolute;left:50%;width:250px;background:#0c1622;border:1px solid var(--cyan-dim);
        padding:10px 12px;font-size:11.5px;line-height:1.55;color:var(--ink);z-index:20;opacity:0;
        pointer-events:none;transition:opacity 0.15s ease,transform 0.15s ease;font-weight:500;
        font-family:'Rajdhani',sans-serif;text-transform:none;letter-spacing:normal;}
      .mc-tip.below{top:100%;margin-top:10px;transform:translateX(-50%) translateY(4px);}
      .mc-tip.above{bottom:100%;margin-bottom:10px;transform:translateX(-50%) translateY(-4px);}
      .mc-sev:hover .mc-tip,.mc-tip-wrap:hover .mc-tip{opacity:1;transform:translateX(-50%) translateY(0);}
      .mc-tip.below::before{content:'';position:absolute;bottom:100%;left:50%;transform:translateX(-50%);
        border:5px solid transparent;border-bottom-color:var(--cyan-dim);}
      .mc-tip.above::before{content:'';position:absolute;top:100%;left:50%;transform:translateX(-50%);
        border:5px solid transparent;border-top-color:var(--cyan-dim);}

      .mc-node text{font-family:'Share Tech Mono',monospace;font-size:9.5px;fill:var(--ink-dim);}
      .mc-node{cursor:pointer;}
      .mc-node:hover text{fill:var(--ink);}
      .mc-edge{fill:none;stroke:var(--cyan-dim);stroke-width:1;opacity:0.55;}
      .mc-edge-circ{fill:none;stroke:var(--red);stroke-width:1.2;stroke-dasharray:3 3;opacity:0.8;}
      .mc-ring-guide{fill:none;stroke:var(--border);stroke-width:1;}
      .mc-axis{font-family:'Share Tech Mono',monospace;font-size:9.5px;fill:var(--ink-dim);}

      .mc-scrim{position:absolute;inset:0;background:rgba(2,4,7,0.6);z-index:5;animation:mcFade 0.15s ease-out;}
      .mc-drawer{position:absolute;top:0;right:0;bottom:0;width:340px;background:#0c1622;
        border-left:1px solid var(--cyan-dim);z-index:6;padding:22px;overflow-y:auto;
        animation:mcSlide 0.2s cubic-bezier(.16,1,.3,1);box-shadow:-18px 0 34px rgba(0,0,0,0.4);}
      .mc-drawer::before{content:'';display:block;height:2px;background:linear-gradient(90deg,var(--cyan),transparent);margin:-22px -22px 18px;}
      .mc-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;}
      .mc-drawer-title{font-size:15px;font-weight:700;font-family:'Share Tech Mono',monospace;word-break:break-word;padding-right:12px;}
      .mc-drawer-close{background:none;border:none;color:var(--ink-dim);cursor:pointer;padding:2px;flex-shrink:0;}
      .mc-drawer-close:hover{color:var(--cyan);}
      .mc-drawer-section{margin-bottom:18px;}
      .mc-drawer-label{font-size:10.5px;color:var(--ink-dim);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:9px;}
      .mc-drawer-finding{display:flex;gap:9px;font-size:12.5px;line-height:1.55;padding:9px 0;border-top:1px solid var(--border);}
      .mc-drawer-finding:first-child{border-top:none;}
      .mc-drawer-stat-row{display:flex;gap:20px;margin-bottom:18px;}
      .mc-drawer-stat{font-size:10.5px;color:var(--ink-dim);text-transform:uppercase;letter-spacing:0.04em;}
      .mc-drawer-stat b{display:block;font-size:18px;color:var(--ink);font-weight:700;font-family:'Share Tech Mono',monospace;text-transform:none;}
      .mc-drawer-linklist{display:flex;flex-direction:column;gap:7px;}
      .mc-drawer-link{font-size:12.5px;color:var(--cyan);cursor:pointer;font-family:'Share Tech Mono',monospace;}
      .mc-drawer-link:hover{text-decoration:underline;}
      .mc-drawer-empty{font-size:12.5px;color:var(--ink-dim);}
      .mc-circ-flag{display:flex;align-items:center;gap:8px;background:rgba(255,92,92,0.1);border:1px solid rgba(255,92,92,0.35);
        padding:10px 12px;font-size:12px;color:#ffb0ab;margin-bottom:16px;letter-spacing:0.02em;}

      @keyframes mcFade{from{opacity:0}to{opacity:1}}
      @keyframes mcSlide{from{transform:translateX(24px);opacity:0}to{transform:translateX(0);opacity:1}}
    `}</style>
  );
}

function useCountUp(target, duration = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const step = (ts) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function HudFrame({ children, style }) {
  return (
    <div className="mc-frame" style={style}>
      <div className="mc-corner tl" /><div className="mc-corner tr" />
      <div className="mc-corner bl" /><div className="mc-corner br" />
      {children}
    </div>
  );
}

function SevDot({ severity }) {
  return <span className="mc-dot" style={{ background: SEV[severity] }} />;
}

function SevBadge({ severity }) {
  return (
    <span className="mc-sev" style={{ color: SEV[severity] }}>
      <SevDot severity={severity} />{SEV_LABEL[severity]}
      <span className="mc-tip above" style={{ color: "var(--ink)" }}>{SEV_DESC[severity]}</span>
    </span>
  );
}

function HealthDial({ score }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 60); return () => clearTimeout(t); }, []);
  const animated = useCountUp(ready ? score : 0, 1100);
  const r = 74, circ = 2 * Math.PI * r;
  const offset = circ - (ready ? score / 100 : 0) * circ;
  const color = score >= 75 ? "var(--mint)" : score >= 50 ? "var(--amber)" : "var(--red)";
  const ticks = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * 360;
      const major = i % 6 === 0;
      const p1 = polarLocal(angle, major ? 60 : 64, 90, 90);
      const p2 = polarLocal(angle, 68, 90, 90);
      arr.push({ ...p1, x2: p2.x, y2: p2.y, major });
    }
    return arr;
  }, []);
  function polarLocal(angleDeg, r0, cx, cy) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r0 * Math.cos(rad), y: cy - r0 * Math.sin(rad) };
  }
  return (
    <div className="mc-dial-wrap">
      <svg viewBox="0 0 180 180" width="180" height="180">
        {ticks.map((t, i) => (
          <line key={i} x1={t.x} y1={t.y} x2={t.x2} y2={t.y2}
            stroke={t.major ? "var(--ink-dim)" : "var(--border)"} strokeWidth={t.major ? 1.4 : 1} />
        ))}
        <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(77,216,255,0.1)" strokeWidth="8" />
        <circle cx="90" cy="90" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 90 90)"
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)" }} />
      </svg>
      <div className="mc-dial-num">
        <div className="mc-dial-val">{Math.round(animated)}</div>
        <div className="mc-tip-wrap">
          <span className="mc-dial-lbl">CODE HEALTH</span>
          <Info size={10} color="var(--ink-dim)" />
          <span className="mc-tip below">{HEALTH_DESC}</span>
        </div>
      </div>
    </div>
  );
}

function Drawer({ title, onClose, children }) {
  return (
    <>
      <div className="mc-scrim" onClick={onClose} />
      <div className="mc-drawer">
        <div className="mc-drawer-head">
          <div className="mc-drawer-title">{title}</div>
          <button className="mc-drawer-close" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </>
  );
}

function OverviewView({ onOpenChip }) {
  const top3 = HOTSPOTS.slice(0, 3);
  return (
    <>
      <HudFrame style={{ marginBottom: 18 }}>
        <div className="mc-hero">
          <HealthDial score={HEALTH_SCORE} />
          <div>
            <div className="mc-hero-status" style={{ color: "var(--amber)" }}>Caution — attention required</div>
            <div className="mc-hero-sub">
              3 modules are carrying most of the risk this scan — a circular dependency between the cart
              and product list, and two components past the complexity threshold. Resolving those clears
              the path to a nominal reading.
            </div>
            {top3.map((f) => (
              <div className="mc-hero-item" key={f.path}>
                <span className="mc-dot" style={{ background: SEV[f.severity] }} />
                <span className="mc-mono">{f.path}</span>
                <span>cx {f.complexity} · {SEV_LABEL[f.severity]}</span>
              </div>
            ))}
          </div>
        </div>
      </HudFrame>

      <div className="mc-chips">
        {CHIPS.map((c) => {
          const Icon = c.icon;
          return (
            <button key={c.id} className="mc-chip" onClick={() => onOpenChip(c)}>
              <div className="mc-chip-top"><Icon size={14} color="var(--ink-dim)" /><SevDot severity={c.severity} /></div>
              <div className="mc-chip-val">{c.value}</div>
              <div className="mc-chip-label">{c.label}</div>
            </button>
          );
        })}
      </div>

      <div className="mc-frame">
        <div className="mc-panel-head"><span>Top hotspot targets</span></div>
        <table className="mc-table">
          <thead><tr><th>Module</th><th>Complexity</th><th>Coverage</th><th>Status</th></tr></thead>
          <tbody>
            {HOTSPOTS.slice(0, 5).map((f) => (
              <tr key={f.path}>
                <td className="mc-mono">{f.path}</td>
                <td><span className="mc-bar"><span style={{ width: `${(f.complexity / 30) * 100}%`, background: SEV[f.severity] }} /></span><span className="mc-mono">{f.complexity}</span></td>
                <td><span className="mc-bar"><span style={{ width: `${f.coveragePct}%`, background: "var(--cyan)" }} /></span><span className="mc-mono">{f.coveragePct}%</span></td>
                <td><SevBadge severity={f.severity} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function OrbitalMapView({ onOpenNode }) {
  const byId = useMemo(() => Object.fromEntries(NODES.map((n) => [n.id, n])), []);
  const arcPath = (from, to) => {
    const a = byId[from], b = byId[to];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const cx = mx + (CENTER.x - mx) * 0.25, cy = my + (CENTER.y - my) * 0.25;
    return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
  };
  return (
    <HudFrame>
      <div className="mc-panel-head">
        <span>Orbital dependency map — src/</span>
        <span className="mc-mono" style={{ fontSize: 10.5 }}>SCANNING…</span>
      </div>
      <div style={{ padding: 20 }}>
        <svg viewBox="0 0 600 600" width="100%" style={{ minHeight: 460, maxWidth: 600, display: "block", margin: "0 auto" }}>
          <defs>
            <radialGradient id="sweepGrad" gradientUnits="userSpaceOnUse" cx={CENTER.x} cy={CENTER.y} r="260">
              <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {[90, 170, 250].map((r) => (
            <circle key={r} className="mc-ring-guide" cx={CENTER.x} cy={CENTER.y} r={r} />
          ))}
          <line x1={CENTER.x - 260} y1={CENTER.y} x2={CENTER.x + 260} y2={CENTER.y} stroke="var(--border)" strokeWidth="1" />
          <line x1={CENTER.x} y1={CENTER.y - 260} x2={CENTER.x} y2={CENTER.y + 260} stroke="var(--border)" strokeWidth="1" />

          <g>
            <path d={`M ${CENTER.x} ${CENTER.y} L ${CENTER.x + 260} ${CENTER.y} A 260 260 0 0 0 ${CENTER.x + 260 * Math.cos(Math.PI / 6)} ${CENTER.y - 260 * Math.sin(Math.PI / 6)} Z`} fill="url(#sweepGrad)" />
            <line x1={CENTER.x} y1={CENTER.y} x2={CENTER.x + 260} y2={CENTER.y} stroke="var(--cyan)" strokeWidth="1.2" opacity="0.7" />
            <animateTransform attributeName="transform" type="rotate" from={`0 ${CENTER.x} ${CENTER.y}`} to={`360 ${CENTER.x} ${CENTER.y}`} dur="7s" repeatCount="indefinite" />
          </g>

          {EDGES.map((e, i) => (
            <path key={i} d={arcPath(e.from, e.to)} className={e.circular ? "mc-edge-circ" : "mc-edge"} />
          ))}

          {NODES.map((n) => (
            <g key={n.id} className="mc-node" onClick={() => onOpenNode(n)}>
              <circle cx={n.x} cy={n.y} r={n.core ? 12 : 7} fill={n.core ? "var(--cyan)" : "var(--panel-raised)"}
                stroke={SEV[n.severity]} strokeWidth={n.core ? 0 : 1.6}
                style={{ filter: n.severity === "high" ? `drop-shadow(0 0 5px ${SEV[n.severity]}88)` : "none" }} />
              <text x={n.x} y={n.y + (n.core ? 26 : 20)} textAnchor="middle">{n.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </HudFrame>
  );
}

function HotspotsView({ onOpenFile }) {
  const W = 800, H = 380, PAD = 48, MAXC = 30;
  const toX = (c) => PAD + (c / MAXC) * (W - PAD * 2);
  const toY = (cov) => H - PAD - (cov / 100) * (H - PAD * 2);
  const riskX = toX(15), riskY = toY(50);
  const riskW = toX(MAXC) - riskX, riskH = toY(0) - riskY;
  return (
    <>
      <HudFrame style={{ marginBottom: 16 }}>
        <div className="mc-panel-head"><span>Complexity / coverage plot</span></div>
        <div style={{ padding: "12px 18px 0", fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.6 }}>
          Each point is one file. Further right means the logic is harder to follow; lower means less of
          it is covered by tests. Files inside the shaded corner have both problems at once — start there.
        </div>
        <div style={{ padding: "14px 18px 4px" }}>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minHeight: 340 }}>
            <rect x={riskX} y={riskY} width={riskW} height={riskH} fill="rgba(255,92,92,0.06)" stroke="rgba(255,92,92,0.3)" strokeDasharray="4 3" />
            <text x={riskX + riskW - 8} y={riskY + 16} textAnchor="end"
              style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9.5, fill: "#ffb0ab", letterSpacing: "0.05em" }}>
              HARDER TO CHANGE, LESS TESTED
            </text>

            {[0, 25, 50, 75, 100].map((t) => (
              <g key={`h${t}`}>
                <line x1={PAD} x2={W - PAD} y1={toY(t)} y2={toY(t)} stroke="rgba(77,216,255,0.08)" />
                <text x={PAD - 8} y={toY(t) + 3} textAnchor="end" className="mc-axis">{t}</text>
              </g>
            ))}
            {[0, 10, 20, 30].map((t) => (
              <g key={`v${t}`}>
                <line y1={PAD} y2={H - PAD} x1={toX(t)} x2={toX(t)} stroke="rgba(77,216,255,0.08)" />
                <text x={toX(t)} y={H - PAD + 16} textAnchor="middle" className="mc-axis">{t}</text>
              </g>
            ))}
            <text x={(PAD + (W - PAD)) / 2} y={H - 8} textAnchor="middle" className="mc-axis" style={{ fontSize: 10, letterSpacing: "0.06em" }}>
              COMPLEXITY — higher means harder to follow →
            </text>
            <text x={14} y={H / 2} textAnchor="middle" className="mc-axis" style={{ fontSize: 10, letterSpacing: "0.06em" }}
              transform={`rotate(-90 14 ${H / 2})`}>
              TEST COVERAGE % — higher means safer to change →
            </text>

            {HOTSPOTS.map((f) => (
              <circle key={f.path} cx={toX(f.complexity)} cy={toY(f.coveragePct)} r={4 + f.loc / 70}
                fill={SEV[f.severity]} fillOpacity="0.85" stroke="var(--bg)" strokeWidth="1"
                style={{ cursor: "pointer" }} onClick={() => onOpenFile(f)} />
            ))}
          </svg>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22, padding: "8px 18px 16px", fontSize: 11.5, color: "var(--ink-dim)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="26" height="18"><circle cx="6" cy="9" r="3" fill="var(--cyan)" /><circle cx="19" cy="9" r="7" fill="var(--cyan)" /></svg>
            <span>Point size = file length (LOC)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><SevDot severity="low" />Nominal</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><SevDot severity="medium" />Caution</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><SevDot severity="high" />Critical</span>
          </div>
        </div>
      </HudFrame>
      <HudFrame>
        <div className="mc-panel-head"><span>All flagged modules</span></div>
        <table className="mc-table">
          <thead><tr><th>Module</th><th>Complexity</th><th>Duplication</th><th>Coverage</th><th>Status</th></tr></thead>
          <tbody>
            {HOTSPOTS.map((f) => (
              <tr key={f.path} onClick={() => onOpenFile(f)}>
                <td className="mc-mono">{f.path}</td>
                <td className="mc-mono">{f.complexity}</td>
                <td className="mc-mono">{f.duplicationPct}%</td>
                <td className="mc-mono">{f.coveragePct}%</td>
                <td><SevBadge severity={f.severity} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </HudFrame>
    </>
  );
}

export default function CodeprintMissionControl() {
  const [tab, setTab] = useState("overview");
  const [drawer, setDrawer] = useState(null);
  const byId = useMemo(() => Object.fromEntries(NODES.map((n) => [n.id, n])), []);

  const openChip = (chip) => setDrawer({ type: "chip", data: chip });
  const openNode = (node) => setDrawer({ type: "node", data: node });
  const openFile = (file) => setDrawer({ type: "file", data: file });

  return (
    <div className="mc">
      <StyleSheet />
      <aside className="mc-side">
        <div className="mc-brand"><div className="mc-mark" /><div className="mc-brand-name">CODEPRINT</div></div>
        <nav className="mc-nav">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={`mc-navitem ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                <Icon size={14} />{t.label}
              </button>
            );
          })}
        </nav>
        <div className="mc-tblock mc-mono">
          <div className="mc-tblock-row"><div className="mc-tblock-cell"><span className="mc-tblock-label">Mission</span>{REPO.name}</div></div>
          <div className="mc-tblock-row">
            <div className="mc-tblock-cell"><span className="mc-tblock-label">Branch</span>{REPO.branch}</div>
            <div className="mc-tblock-cell"><span className="mc-tblock-label">Commit</span>{REPO.commit}</div>
          </div>
          <div className="mc-tblock-row"><div className="mc-tblock-cell"><span className="mc-tblock-label">Elapsed</span>{REPO.elapsed}</div></div>
        </div>
      </aside>

      <div className="mc-main">
        <div className="mc-top">
          <div className="mc-repo"><GitBranch size={13} /><b>{REPO.name}</b><span>@ {REPO.branch}</span><span className="mc-elapsed mc-mono">// {REPO.elapsed}</span></div>
          <div className="mc-status"><span className="mc-status-dot" />Scan complete</div>
        </div>
        <div className="mc-canvas">
          {tab === "overview" && <OverviewView onOpenChip={openChip} />}
          {tab === "depmap" && <OrbitalMapView onOpenNode={openNode} />}
          {tab === "hotspots" && <HotspotsView onOpenFile={openFile} />}

          {drawer && drawer.type === "chip" && (
            <Drawer title={drawer.data.label} onClose={() => setDrawer(null)}>
              <div className="mc-drawer-section">
                <div className="mc-drawer-label">{drawer.data.value} detected</div>
                {["src/checkout/Checkout.jsx", "src/product/ProductList.jsx"].map((f, i) => (
                  <div className="mc-drawer-finding" key={i}>
                    <AlertTriangle size={13} color={SEV[drawer.data.severity]} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div><span className="mc-mono">{f}</span> — {FINDINGS_BY_FILE[f]?.[0] || "flagged in this scan"}</div>
                  </div>
                ))}
              </div>
            </Drawer>
          )}

          {drawer && drawer.type === "node" && (
            <Drawer title={drawer.data.label} onClose={() => setDrawer(null)}>
              {drawer.data.circular && <div className="mc-circ-flag"><AlertTriangle size={14} />Circular dependency detected</div>}
              <div className="mc-drawer-section">
                <div className="mc-drawer-label">Dependents ({drawer.data.dependents.length})</div>
                <div className="mc-drawer-linklist">
                  {drawer.data.dependents.length ? drawer.data.dependents.map((id) => (
                    <span key={id} className="mc-drawer-link" onClick={() => setDrawer({ type: "node", data: byId[id] })}>{byId[id].label}</span>
                  )) : <span className="mc-drawer-empty">Nothing imports this module.</span>}
                </div>
              </div>
              <div className="mc-drawer-section">
                <div className="mc-drawer-label">Dependencies ({drawer.data.dependencies.length})</div>
                <div className="mc-drawer-linklist">
                  {drawer.data.dependencies.length ? drawer.data.dependencies.map((id) => (
                    <span key={id} className="mc-drawer-link" onClick={() => setDrawer({ type: "node", data: byId[id] })}>{byId[id].label}</span>
                  )) : <span className="mc-drawer-empty">Imports nothing else in src/.</span>}
                </div>
              </div>
            </Drawer>
          )}

          {drawer && drawer.type === "file" && (
            <Drawer title={drawer.data.path} onClose={() => setDrawer(null)}>
              <div className="mc-drawer-stat-row">
                <div className="mc-drawer-stat"><b>{drawer.data.complexity}</b>Complexity</div>
                <div className="mc-drawer-stat"><b>{drawer.data.coveragePct}%</b>Coverage</div>
                <div className="mc-drawer-stat"><b>{drawer.data.duplicationPct}%</b>Duplication</div>
              </div>
              <div className="mc-drawer-section">
                <div className="mc-drawer-label">Findings</div>
                {(FINDINGS_BY_FILE[drawer.data.path] || []).length ? FINDINGS_BY_FILE[drawer.data.path].map((f, i) => (
                  <div className="mc-drawer-finding" key={i}>
                    <AlertTriangle size={13} color={SEV[drawer.data.severity]} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div>{f}</div>
                  </div>
                )) : <span className="mc-drawer-empty">No specific findings recorded for this module.</span>}
              </div>
            </Drawer>
          )}
        </div>
      </div>
    </div>
  );
}
