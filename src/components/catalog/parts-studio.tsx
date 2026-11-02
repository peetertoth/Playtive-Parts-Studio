"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Box, Boxes,
  Check, ChevronRight, CircleHelp, Copy, Expand, Grid2X2, Info,
  LoaderCircle, Maximize2, Mouse, Move3D, Pause, Play, RotateCcw,
  Search, SlidersHorizontal, Target, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { PARTS } from "@/domain/catalog";
import type { PartCategory } from "@/domain/parts";
import type { CameraCommand, CameraView } from "@/components/3d/part-viewer";
import { catalogMessages } from "@/i18n/catalog-messages";
import { categoryLabels } from "@/i18n/parts";
import { useI18n } from "@/i18n/provider";
import { LanguageSwitcher } from "@/i18n/language-switcher";
import { PartGlyph } from "./part-glyph";

const MANUAL_URL = "https://www.manuals.co.uk/playtive/ian-369527/manual";
function ViewerLoading() {
  const { locale } = useI18n();
  const m = catalogMessages[locale];
  return (
    <div className="viewer-message" role="status">
      <div className="loading-mark"><Box size={30} strokeWidth={1.4} /></div>
      <strong>{m.loadingTitle}</strong>
      <span><LoaderCircle size={13} className="spinner" /> {m.loadingModel}</span>
    </div>
  );
}

const PartViewer = dynamic(() => import("@/components/3d/part-viewer"), {
  ssr: false,
  loading: () => <ViewerLoading />,
});

const categories: readonly ("all" | PartCategory)[] = ["all", "structure", "connector", "accessory"];
const normalize = (value: string, locale: string) => value.toLocaleLowerCase(locale).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function PartsStudio() {
  const { locale, formatNumber, localizePart } = useI18n();
  const m = catalogMessages[locale];
  const [selectedId, setSelectedId] = useState(() => (PARTS.find((part) => part.kind === "corner3") ?? PARTS[0])?.id ?? "");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | PartCategory>("all");
  const [wireframe, setWireframe] = useState(false);
  const [showPorts, setShowPorts] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeView, setActiveView] = useState<CameraView | null>("isometric");
  const [command, setCommand] = useState<CameraCommand>({ action: "isometric", sequence: 0 });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const helpRef = useRef<HTMLDialogElement>(null);
  const localizedParts = useMemo(() => PARTS.map(localizePart), [localizePart]);
  const selected = localizedParts.find((part) => part.id === selectedId);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReducedMotion(media.matches); if (media.matches) setAutoRotate(false); };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!copied && !copyFailed) return;
    const timeout = window.setTimeout(() => { setCopied(false); setCopyFailed(false); }, 2200);
    return () => window.clearTimeout(timeout);
  }, [copied, copyFailed]);

  const filtered = useMemo(() => localizedParts.filter((part) => (
    (category === "all" || category === part.category) &&
    normalize(`${part.name} ${part.code} ${part.description}`, locale).includes(normalize(query.trim(), locale))
  )), [query, category, locale, localizedParts]);

  function issue(action: CameraCommand["action"]) {
    if (action === "isometric" || action === "front" || action === "top") setActiveView(action);
    else if (action === "reset") { setActiveView("isometric"); setAutoRotate(false); }
    else if (action.startsWith("rotate")) setActiveView(null);
    setCommand((previous) => ({ action, sequence: previous.sequence + 1 }));
  }

  function selectPart(id: string) {
    setSelectedId(id);
    setActiveView("isometric");
    setCommand((previous) => ({ action: "isometric", sequence: previous.sequence + 1 }));
    setAutoRotate(false);
    setCopied(false);
  }

  function handleViewerKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const actions: Record<string, CameraCommand["action"]> = {
      ArrowLeft: "rotate-left", ArrowRight: "rotate-right", ArrowUp: "rotate-up", ArrowDown: "rotate-down",
      "+": "zoom-in", "=": "zoom-in", "-": "zoom-out", "0": "reset",
    };
    const action = actions[event.key];
    if (action) { event.preventDefault(); issue(action); }
  }

  async function copyCode() {
    if (!selected) return;
    try { await navigator.clipboard.writeText(selected.code); setCopied(true); }
    catch { setCopyFailed(true); }
  }

  return (
    <div className="studio-app">
      <a className="skip-link" href="#workspace">{m.skipToWorkspace}</a>
      <header className="site-header">
        <Link href="/" className="brand" aria-label={m.brandHome}>
          <span className="brand-mark"><Boxes size={25} strokeWidth={1.7} /></span>
          <span className="brand-name">{m.brand}<span className="brand-dot">{m.period}</span></span>
          <span className="brand-divider" />
          <span className="brand-product">{m.brandProduct}</span>
        </Link>
        <div className="header-actions">
          <span className="workspace-status"><span /> {m.localWorkspace}</span>
          <Link className="help-button" href="/planner" aria-label={m.openPlanner}><Boxes size={16} /><span>{m.planner}</span></Link>
          <button className="help-button" onClick={() => helpRef.current?.showModal()}><CircleHelp size={16} /><span>{m.help}</span></button>
          <LanguageSwitcher />
          <span className="version-tag">{m.version}</span>
        </div>
      </header>

      <main className="studio-main">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> {m.productGroup} <span className="eyebrow-separator">/</span> {m.productNumber}</div>
            <h1 id="page-title">{m.title}<span>{m.period}</span></h1>
            <p>{m.introduction}</p>
          </div>
          <div className="intro-stat"><span className="stat-icon"><Box size={22} strokeWidth={1.5} /></span><div><strong>{formatNumber(PARTS.length, { minimumIntegerDigits: 2 })}</strong><span>{m.partTypes(PARTS.length)}</span></div></div>
        </section>

        <div className="studio-workspace" id="workspace">
          <aside className="library-panel" aria-label={m.library}>
            <div className="library-header">
              <div className="panel-title"><h2>{m.library}</h2><span>{formatNumber(PARTS.length)}</span></div>
              <label className="search-field"><Search size={16} /><span className="sr-only">{m.searchLabel}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={m.searchPlaceholder} type="search" />{query && <button aria-label={m.clearSearch} onClick={() => setQuery("")}><X size={13} /></button>}</label>
              <div className="category-filters" aria-label={m.categories}>
                {categories.map((item) => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item === "all" ? m.allCategories : categoryLabels[locale][item]}</button>)}
              </div>
            </div>
            <div className="library-list" aria-label={m.parts}>
              {filtered.length ? filtered.map((part) => (
                <button key={part.id} className={`part-card ${selectedId === part.id ? "selected" : ""}`} aria-pressed={selectedId === part.id} onClick={() => selectPart(part.id)}>
                  <span className="part-thumbnail"><PartGlyph kind={part.kind} color={part.color} /></span>
                  <span className="part-card-text"><span className="part-card-code">{part.code}</span><span className="part-card-name">{part.name}</span></span>
                  {selectedId === part.id && <span className="selected-indicator"><ChevronRight size={14} /></span>}
                </button>
              )) : <div className="empty-library"><Search size={27} strokeWidth={1.3} /><strong>{m.noResults}</strong><p>{m.noResultsHint}</p><button onClick={() => { setQuery(""); setCategory("all"); }}>{m.clearFilters}</button></div>}
            </div>
            <div className="library-footer"><SlidersHorizontal size={13} /><span aria-live="polite">{m.visibleParts(formatNumber(filtered.length), formatNumber(PARTS.length), PARTS.length)}</span><span className="library-footer-dot" /></div>
          </aside>

          <section className="viewport-panel" aria-label={m.interactiveView}>
            <div className="viewport-heading"><span className="view-label"><span /> {m.viewLabel}</span><span className="viewport-reference">{m.individualPart}</span></div>
            <div className="canvas-container" tabIndex={0} onKeyDown={handleViewerKey} aria-label={selected ? m.viewDescription(selected.name) : m.chooseFromLibrary}>
              {selected ? <PartViewer part={selected} wireframe={wireframe} showPorts={showPorts} autoRotate={autoRotate && !reducedMotion} reducedMotion={reducedMotion} command={command} onInteract={() => setActiveView(null)} /> : <div className="viewer-message"><Box size={32} /><strong>{m.choosePart}</strong><span>{m.modelAppearsHere}</span></div>}
            </div>
            {selected && <div className="viewport-part-label"><span className="part-code-label">{selected.code}</span><div><strong>{selected.name}</strong><span>{categoryLabels[locale][selected.category]}</span></div></div>}

            <div className="viewport-zoom" aria-label={m.zoomAndReset}>
              <button onClick={() => issue("zoom-in")} title={m.zoomInTitle} aria-label={m.zoomIn}><ZoomIn size={17} /></button>
              <button onClick={() => issue("zoom-out")} title={m.zoomOutTitle} aria-label={m.zoomOut}><ZoomOut size={17} /></button>
              <span />
              <button onClick={() => issue("reset")} title={m.resetViewTitle} aria-label={m.resetView}><Maximize2 size={16} /></button>
            </div>

            <div className="viewport-toolbar">
              <div className="view-presets" aria-label={m.cameraViews}>
                <button aria-pressed={activeView === "isometric"} onClick={() => issue("isometric")} title={m.isometricTitle}><Box size={15} /><span>{m.isometric}</span></button>
                <button aria-pressed={activeView === "front"} onClick={() => issue("front")} title={m.frontTitle}><Expand size={15} /><span>{m.front}</span></button>
                <button aria-pressed={activeView === "top"} onClick={() => issue("top")} title={m.topTitle}><Grid2X2 size={15} /><span>{m.top}</span></button>
              </div>
              <span className="toolbar-divider" />
              <button className={`tool-icon ${wireframe ? "active" : ""}`} aria-pressed={wireframe} onClick={() => setWireframe(!wireframe)} title={m.wireframe} aria-label={m.showWireframe}><Boxes size={17} /></button>
              <button className={`tool-icon ${showPorts ? "active" : ""}`} aria-pressed={showPorts} onClick={() => setShowPorts(!showPorts)} title={m.connectionPoints} aria-label={m.showConnectionPoints}><Target size={17} /></button>
              <button className={`tool-icon ${autoRotate ? "active" : ""}`} aria-pressed={autoRotate} disabled={reducedMotion} onClick={() => setAutoRotate(!autoRotate)} title={reducedMotion ? m.autoRotateReducedMotion : m.autoRotate} aria-label={m.autoRotate}>{autoRotate ? <Pause size={17} /> : <Play size={16} />}</button>
              <span className="toolbar-divider" />
              <button className="tool-icon" onClick={() => issue("reset")} title={m.reset} aria-label={m.resetCamera}><RotateCcw size={16} /></button>
            </div>
            <div className="viewport-hint"><Mouse size={13} /><span>{m.dragToRotate}</span><span className="hint-dot">{m.middleDot}</span><span>{m.scrollToZoom}</span></div>
          </section>

          <aside className="details-panel" aria-label={m.selectedPartDetails}>
            <div className="details-panel-label">{m.dataSheet} <Info size={14} /></div>
            {selected ? <>
              <div className="details-title"><span className="detail-category">{categoryLabels[locale][selected.category]}</span><h2>{selected.name}</h2><div className="detail-code-row"><span>{selected.code}</span><button aria-label={m.copyPartCode} title={m.copyCode} onClick={copyCode}>{copied ? <Check size={13} /> : <Copy size={13} />}</button><span className="copy-status" role="status">{copied ? m.copied : copyFailed ? m.copyFailed : ""}</span></div></div>
              <p className="part-description">{selected.description}</p>
              <div className="detail-section"><h3>{m.dimensions} <span>{m.approximateMillimeters}</span></h3><div className="dimension-grid"><div><span>{m.lengthAxis}</span><strong>{formatNumber(selected.dimensionsMm.length)}</strong></div><div><span>{m.widthAxis}</span><strong>{formatNumber(selected.dimensionsMm.width)}</strong></div><div><span>{m.heightAxis}</span><strong>{formatNumber(selected.dimensionsMm.height)}</strong></div></div><p className="dimension-caption">{selected.dimensionLabel}</p></div>
              <dl className="part-properties"><div><dt>{m.portCount}</dt><dd>{formatNumber(selected.ports.length, { minimumIntegerDigits: 2 })} <span>{m.portUnit(selected.ports.length)}</span></dd></div><div><dt>{m.modelStatus}</dt><dd><span className="estimate-badge"><span />{selected.accuracy === "estimated" ? m.estimated : m.verified}</span></dd></div><div><dt>{m.appearance}</dt><dd className="color-value"><span style={{ backgroundColor: selected.color }} />{selected.colorName}</dd></div></dl>
              <div className="inspection-card"><span><Move3D size={19} strokeWidth={1.5} /></span><strong>{m.inspectionTitle}</strong><p>{m.inspectionHint}</p><button aria-pressed={showPorts} onClick={() => setShowPorts(!showPorts)}>{showPorts ? m.hidePoints : m.connectionPoints}<ArrowUpRight size={14} /></button></div>
              <div className="details-bottom"><Box size={13} /><span>{m.standaloneModel}</span></div>
            </> : <div className="empty-library"><Box size={28} /><strong>{m.noSelection}</strong><p>{m.noSelectionHint}</p></div>}
          </aside>
        </div>

        <footer className="studio-footer"><p><Info size={14} /><span>{m.sourceIntro}<a href={MANUAL_URL} target="_blank" rel="noreferrer">{m.sourceManual} <ArrowUpRight size={11} /></a>{m.sourceConclusion}</span></p><span className="footer-signature">{m.footerSignature} <span>{m.footerNumber}</span></span></footer>
      </main>

      <dialog ref={helpRef} className="help-dialog" aria-labelledby="help-title" onClick={(event) => { if (event.target === event.currentTarget) helpRef.current?.close(); }}>
        <div className="dialog-heading"><span className="eyebrow">{m.helpEyebrow}</span><button className="tool-icon" aria-label={m.closeHelp} onClick={() => helpRef.current?.close()}><X size={19} /></button></div>
        <h2 id="help-title">{m.helpTitle}</h2><p>{m.helpIntroduction}</p>
        <div className="help-controls"><div><Mouse size={19} /><strong>{m.rotation}</strong><span>{m.rotationHelp}</span></div><div><ZoomIn size={19} /><strong>{m.zoomIn}</strong><span>{m.zoomHelp}</span></div><div><Target size={19} /><strong>{m.connections}</strong><span>{m.connectionsHelp}</span></div></div>
        <div className="keyboard-help"><span>{m.keyboardIntroduction}</span><div><kbd><ArrowLeft size={12} /></kbd><kbd><ArrowUp size={12} /></kbd><kbd><ArrowDown size={12} /></kbd><kbd><ArrowRight size={12} /></kbd><span>{m.keyboardRotation}</span><kbd>+</kbd><kbd>−</kbd><span>{m.keyboardZoom}</span><kbd>0</kbd><span>{m.keyboardReset}</span></div></div>
        <button className="dialog-done" onClick={() => helpRef.current?.close()}>{m.explore} <ArrowRight size={16} /></button>
      </dialog>
    </div>
  );
}
