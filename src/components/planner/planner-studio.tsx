"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import {
  ArrowUpRight, Box, Boxes, Check, CircleHelp,
  Download, Expand, Grid2X2, Grip, HardDrive, Info, Layers3, LoaderCircle,
  Magnet, Maximize2, Minus, MousePointer2, Move3D, Plus, Redo2, RotateCcw,
  RotateCw, Settings2, Target, Trash2, Undo2, Upload, X,
} from "lucide-react";
import { PARTS } from "@/domain/catalog";
import type { PartKind } from "@/domain/parts";
import { PLANNER_STORAGE_KEY, type Axis, type Inventory, type PlacedPart, type PlacementResult, type PlannerDocument, type PlannerDraft } from "@/domain/planner";
import { ROTATION_AXES } from "@/domain/rotation-controls";
import {
  commitPlacement, deriveConnections, inventoryUsage, makeEmptyDocument,
  remainingInventory, removePlacedPart, rotateOrientation, rotatePlacedPart,
  validateDocument,
} from "@/lib/assembly-engine";
import { PartGlyph } from "@/components/catalog/part-glyph";
import type { Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/provider";
import { LanguageSwitcher } from "@/i18n/language-switcher";
import { plannerErrorMessage } from "@/i18n/planner-errors";
import { plannerMessages } from "@/i18n/planner-messages";

function PlannerLoading() {
  const { locale } = useI18n();
  return <div className="pl-loading" role="status"><LoaderCircle size={28} className="spinner" /><strong>{plannerMessages[locale].loading}</strong></div>;
}

const PlannerScene = dynamic(() => import("./planner-scene"), {
  ssr: false,
  loading: PlannerLoading,
});

const STRUCTURAL_PARTS = PARTS.filter((part) => part.category !== "accessory");
const MANUAL_URL = "https://www.manuals.co.uk/playtive/ian-369527/manual?p=38";
const AXES: readonly Axis[] = ["x", "y", "z"];
type History = { past: PlannerDocument[]; present: PlannerDocument; future: PlannerDocument[] };
type LocalizedMessage = (locale: Locale) => string;
type Notice = { tone: "info" | "error"; message: LocalizedMessage } | null;
type InventoryError =
  | { kind: "invalidCount"; partId: string }
  | { kind: "minimum"; partId: string; count: number }
  | { kind: "engine"; error: unknown }
  | null;
type InventoryFields = Record<PartKind, string>;

function inventoryFields(inventory: Inventory): InventoryFields {
  return Object.fromEntries(PARTS.map((part) => [part.kind, String(inventory[part.kind])])) as InventoryFields;
}

function downloadText(contents: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isEditing(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function PlannerStudio() {
  const { locale, formatNumber, localizePart } = useI18n();
  const t = plannerMessages[locale];
  const number = (value: number) => formatNumber(value, { maximumFractionDigits: 1 });
  const [history, setHistory] = useState<History>(() => ({ past: [], present: makeEmptyDocument(), future: [] }));
  const historyRef = useRef(history);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlannerDraft | null>(null);
  const draftRef = useRef<PlannerDraft | null>(null);
  const [preview, setPreview] = useState<PlacementResult | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [placementHeightMm, setPlacementHeightMm] = useState(0);
  const [showPorts, setShowPorts] = useState(true);
  const [view, setView] = useState<"isometric" | "top" | "front">("isometric");
  const [viewRequest, setViewRequest] = useState(0);
  const [frameRequest, setFrameRequest] = useState(0);
  const [storageReady, setStorageReady] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const hydrated = useRef(false);
  const inventoryDialog = useRef<HTMLDialogElement>(null);
  const helpDialog = useRef<HTMLDialogElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [inventoryEdit, setInventoryEdit] = useState<InventoryFields>(() => inventoryFields(history.present.inventory));
  const [inventoryError, setInventoryError] = useState<InventoryError>(null);
  const document = history.present;
  const usage = useMemo(() => inventoryUsage(document), [document]);
  const connections = useMemo(() => deriveConnections(document.parts), [document.parts]);
  const remaining = useMemo(() => remainingInventory(document), [document]);
  const selected = document.parts.find((part) => part.id === selectedId);
  const activePart = PARTS.find((part) => part.id === (draft?.partId ?? selected?.partId));
  const activeDefinition = activePart ? localizePart(activePart) : undefined;
  const activeOrientation = draft?.orientation ?? selected?.orientation;
  const selectedConnectionCount = selected ? connections.filter((connection) => connection.a.instanceId === selected.id || connection.b.instanceId === selected.id).length : 0;

  const resetInteraction = useCallback(() => { draftRef.current = null; setDraft(null); setPreview(null); }, []);

  const applyDocument = useCallback((next: PlannerDocument, message?: LocalizedMessage) => {
    const current = historyRef.current;
    if (next === current.present || JSON.stringify(next) === JSON.stringify(current.present)) return false;
    const updated: History = { past: [...current.past.slice(-79), current.present], present: next, future: [] };
    historyRef.current = updated;
    setHistory(updated);
    if (message) setNotice({ tone: "info", message });
    return true;
  }, []);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(PLANNER_STORAGE_KEY);
      if (stored !== null) {
        const restored = validateDocument(JSON.parse(stored));
        const next: History = { past: [], present: restored, future: [] };
        historyRef.current = next;
        setHistory(next);
        setFrameRequest((value) => value + 1);
      }
    } catch (error) {
      setSaveBlocked(true);
      setRecovery(stored);
      setNotice({ tone: "error", message: (locale) => stored !== null
        ? plannerMessages[locale].recoveryNotice(plannerErrorMessage(error, locale))
        : plannerMessages[locale].storageUnavailable });
    }
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady || saveBlocked) return;
    try {
      window.localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(document));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
      setNotice({ tone: "error", message: (locale) => plannerMessages[locale].saveFailedNotice });
    }
  }, [document, storageReady, saveBlocked]);

  const undo = useCallback(() => {
    const current = historyRef.current;
    const previous = current.past.at(-1);
    if (!previous) return;
    const next = { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] };
    historyRef.current = next;
    setHistory(next);
    setSelectedId(null);
    resetInteraction();
    setNotice({ tone: "info", message: (locale) => plannerMessages[locale].undoNotice });
  }, [resetInteraction]);

  const redo = useCallback(() => {
    const current = historyRef.current;
    const nextDocument = current.future[0];
    if (!nextDocument) return;
    const next = { past: [...current.past, current.present], present: nextDocument, future: current.future.slice(1) };
    historyRef.current = next;
    setHistory(next);
    setSelectedId(null);
    resetInteraction();
    setNotice({ tone: "info", message: (locale) => plannerMessages[locale].redoNotice });
  }, [resetInteraction]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    applyDocument(removePlacedPart(historyRef.current.present, selectedId), (locale) => plannerMessages[locale].deleteNotice);
    setSelectedId(null);
    resetInteraction();
  }, [selectedId, applyDocument, resetInteraction]);

  const rotate = useCallback((axis: Axis, quarterTurns: number) => {
    const currentDraft = draftRef.current;
    if (currentDraft) {
      const nextDraft = { ...currentDraft, orientation: rotateOrientation(currentDraft.orientation, axis, quarterTurns) };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setPreview(null);
      return;
    }
    if (!selectedId) return;
    const result = rotatePlacedPart(historyRef.current.present, selectedId, axis, quarterTurns);
    if (result.result.valid) applyDocument(result.document, (locale) => plannerMessages[locale].rotated(axis.toUpperCase(), quarterTurns > 0 ? "+" : "−"));
    else setNotice({ tone: "error", message: (locale) => (result.result.reason || result.result.issue) ? plannerErrorMessage(result.result, locale) : plannerMessages[locale].rotationBlocked });
  }, [selectedId, applyDocument]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditing(event.target) || inventoryDialog.current?.open || helpDialog.current?.open) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (key === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
        else if (key === "y") { event.preventDefault(); redo(); }
        return;
      }
      if (event.altKey) return;
      if (event.key === "Escape") { resetInteraction(); setNotice(null); }
      else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) { event.preventDefault(); deleteSelected(); }
      else if ((key === "x" || key === "y" || key === "z") && (draft || selectedId)) { event.preventDefault(); rotate(key, event.shiftKey ? -1 : 1); }
      else if (key === "f") { event.preventDefault(); setFrameRequest((value) => value + 1); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo, resetInteraction, selectedId, deleteSelected, draft, rotate]);

  const handleCommit = useCallback((part: PlacedPart) => {
    const current = historyRef.current.present;
    const movingId = draftRef.current?.movingId;
    if (movingId && movingId !== part.id) {
      setNotice({ tone: "error", message: (locale) => plannerMessages[locale].moveUnidentified });
      resetInteraction();
      return;
    }
    const candidate = { ...part, id: movingId ?? `part-${crypto.randomUUID()}` };
    const committed = commitPlacement(current, candidate, { magnetic: true, autoOrient: false });
    if (!committed.result.valid) {
      setPreview(committed.result);
      setNotice({ tone: "error", message: (locale) => (committed.result.reason || committed.result.issue) ? plannerErrorMessage(committed.result, locale) : plannerMessages[locale].placementBlocked });
      return;
    }
    applyDocument(committed.document);
    if (current.parts.length === 0) setFrameRequest((value) => value + 1);
    setSelectedId(committed.result.part.id);
    resetInteraction();
    setNotice(null);
  }, [applyDocument, resetInteraction]);

  const handleMoveStart = useCallback((id: string) => {
    const part = historyRef.current.present.parts.find((item) => item.id === id);
    if (!part) return;
    setSelectedId(id);
    const nextDraft = { partId: part.partId, orientation: part.orientation, movingId: id };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setPreview(null);
    setNotice(null);
  }, []);

  const handlePreview = useCallback((result: PlacementResult | null) => { setPreview(result); }, []);

  function armPart(partId: string, dragOrigin?: { x: number; y: number }) {
    const definition = PARTS.find((part) => part.id === partId);
    if (!definition || remainingInventory(historyRef.current.present)[definition.kind] <= 0) return;
    const nextDraft = { partId, orientation: 0, ...(dragOrigin ? { dragOrigin } : {}) };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setSelectedId(null);
    setPreview(null);
    setNotice(null);
  }

  function openInventory() {
    resetInteraction();
    setInventoryEdit(inventoryFields(historyRef.current.present.inventory));
    setInventoryError(null);
    inventoryDialog.current?.showModal();
  }

  function saveInventory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = historyRef.current.present;
    const used = inventoryUsage(current);
    const next = { ...current.inventory };
    for (const part of PARTS) {
      const text = inventoryEdit[part.kind].trim();
      const count = Number(text);
      if (!/^\d+$/.test(text) || !Number.isSafeInteger(count)) {
        setInventoryError({ kind: "invalidCount", partId: part.id });
        return;
      }
      if (count < used[part.kind]) {
        setInventoryError({ kind: "minimum", partId: part.id, count: used[part.kind] });
        return;
      }
      next[part.kind] = count;
    }
    try {
      const valid = validateDocument({ ...current, inventory: next });
      applyDocument(valid, (locale) => plannerMessages[locale].inventoryUpdated);
      inventoryDialog.current?.close();
    } catch (error) { setInventoryError({ kind: "engine", error }); }
  }

  async function importDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) {
        setNotice({ tone: "error", message: (locale) => plannerMessages[locale].importFailed(plannerMessages[locale].fileTooLarge) });
        return;
      }
      const imported = validateDocument(JSON.parse(await file.text()));
      applyDocument(imported);
      resetInteraction();
      setSelectedId(null);
      setFrameRequest((value) => value + 1);
      setNotice({ tone: "info", message: (locale) => plannerMessages[locale].imported(file.name) });
    } catch (error) {
      setNotice({ tone: "error", message: (locale) => plannerMessages[locale].importFailed(plannerErrorMessage(error, locale)) });
    }
  }

  function exportDocument() {
    downloadText(JSON.stringify(historyRef.current.present, null, 2), `${t.planFilename}-${new Date().toISOString().slice(0, 10)}.json`);
    setNotice({ tone: "info", message: (locale) => plannerMessages[locale].exportedNotice });
  }

  function changeHeight(value: number) {
    if (Number.isFinite(value)) setPlacementHeightMm(Math.min(3000, Math.max(0, Math.round(value))));
  }

  const inventoryErrorPart = inventoryError && inventoryError.kind !== "engine"
    ? PARTS.find((part) => part.id === inventoryError.partId) : undefined;
  const inventoryErrorName = inventoryErrorPart ? localizePart(inventoryErrorPart).name : "";
  const inventoryErrorText = !inventoryError ? "" : inventoryError.kind === "engine"
    ? plannerErrorMessage(inventoryError.error, locale)
    : inventoryError.kind === "invalidCount" ? t.invalidInventoryCount(inventoryErrorName)
      : t.minimumInventory(inventoryErrorName, number(inventoryError.count));

  const statusText = draft
    ? preview
      ? !preview.valid ? (preview.reason || preview.issue) ? plannerErrorMessage(preview, locale) : t.previewBlocked
        : preview.snap ? t.statusSnapped
          : view === "front" ? t.statusFront
            : t.statusFree
      : t.statusDraft
    : selected ? t.statusSelected
      : t.statusIdle;

  return (
    <div className="planner-app">
      <a className="skip-link" href="#planner-workspace">{t.skip}</a>
      <header className="site-header pl-header">
        <a href="/" className="brand" aria-label={t.brandHome}><span className="brand-mark"><Boxes size={25} strokeWidth={1.7} /></span><span className="brand-name">playtive<span className="brand-dot">.</span></span><span className="brand-divider" /><span className="brand-product">Parts Studio</span></a>
        <nav className="pl-header-nav" aria-label={t.workspaceNavigation}><a href="/" aria-label={t.openInspector}><Box size={15} /><span>{t.inspector}</span></a><a href="/planner" aria-current="page"><Boxes size={15} /><span>{t.planner}</span></a></nav>
        <LanguageSwitcher />
        <button className="pl-help-button" onClick={() => helpDialog.current?.showModal()} aria-label={t.helpAria}><CircleHelp size={18} /><span>{t.help}</span></button>
      </header>

      <main className="pl-main">
        <section className="pl-intro" aria-labelledby="planner-title"><div><div className="eyebrow"><span className="eyebrow-line" /> {t.product} <span className="eyebrow-separator">/</span> 383000</div><h1 id="planner-title">{t.headline}<span>.</span></h1><p>{t.intro}</p></div><div className="pl-intro-badges"><span><Magnet size={15} /> {t.magnetic}</span><span><RotateCw size={15} /> {t.quarterTurns}</span></div></section>

        <div className="pl-actionbar" aria-label={t.planActions}><div className="pl-action-group"><button onClick={undo} aria-label={t.undoAria} disabled={!history.past.length} title={t.undoTitle}><Undo2 size={17} /><span>{t.undo}</span></button><button onClick={redo} aria-label={t.redoAria} disabled={!history.future.length} title={t.redoTitle}><Redo2 size={17} /><span>{t.redo}</span></button><span className="pl-separator" /><button onClick={() => { applyDocument({ ...historyRef.current.present, parts: [] }, (locale) => plannerMessages[locale].clearedNotice); setSelectedId(null); resetInteraction(); }} aria-label={t.clearAria} disabled={!document.parts.length}><Trash2 size={16} /><span>{t.clear}</span></button></div><div className="pl-action-group pl-file-actions"><span className={`pl-save-state ${saveBlocked || saveFailed ? "is-warning" : ""}`} role="status"><HardDrive size={13} /><span>{!storageReady ? t.loadingSave : saveBlocked ? t.savingPaused : saveFailed ? t.savingFailed : t.saved}</span></span><button onClick={() => importInput.current?.click()} aria-label={t.importAria}><Upload size={16} /><span>{t.import}</span></button><button onClick={exportDocument} className="pl-primary" aria-label={t.exportAria}><Download size={16} /><span>{t.export}</span></button><input className="sr-only" ref={importInput} type="file" accept=".json,application/json" onChange={importDocument} aria-label={t.chooseFile} /></div></div>

        {notice && <div className={`pl-notice ${notice.tone === "error" ? "is-error" : ""}`} role={notice.tone === "error" ? "alert" : "status"}><Info size={16} /><span>{notice.message(locale)}</span><button onClick={() => setNotice(null)} aria-label={t.closeNotice}><X size={16} /></button></div>}
        {saveBlocked && <div className="pl-recovery"><span>{t.recoveryHint}</span>{recovery !== null && <button onClick={() => downloadText(recovery, t.recoveryFilename)}>{t.downloadRecovery}</button>}<button onClick={() => { setSaveBlocked(false); setRecovery(null); setNotice({ tone: "info", message: (locale) => plannerMessages[locale].saveEnabledNotice }); }}>{t.enableSaving}</button></div>}

        <div className="pl-workspace" id="planner-workspace">
          <aside className="pl-palette" aria-label={t.paletteAria}><div className="pl-panel-heading"><div><span className="pl-kicker">{t.buildingParts}</span><h2>{t.yourStock}</h2></div><button className="pl-icon-button" onClick={openInventory} aria-label={t.editStockAria} title={t.editStock}><Settings2 size={17} /></button></div><div className="pl-palette-caption"><span>{t.dragToWorkspace}</span><span>{t.stockCaption}</span></div><div className="pl-part-list">{STRUCTURAL_PARTS.map(localizePart).map((part) => <button key={part.id} type="button" className={`pl-part-card ${draft?.partId === part.id && !draft.movingId ? "is-active" : ""}`} disabled={remaining[part.kind] <= 0} aria-pressed={draft?.partId === part.id && !draft.movingId} aria-label={t.palettePart(part.name, number(remaining[part.kind]), number(document.inventory[part.kind]))} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); armPart(part.id, { x: event.clientX, y: event.clientY }); }} onClick={(event) => { if (event.detail === 0) armPart(part.id); }}><span className="pl-part-image"><PartGlyph kind={part.kind} color={part.color} /></span><span className="pl-part-copy"><span className="pl-part-code">{part.code}<i style={{ backgroundColor: part.color }} /></span><strong>{part.name}</strong><span className="pl-stock"><b>{number(remaining[part.kind])}</b> / {number(document.inventory[part.kind])} {t.pieces}{remaining[part.kind] <= 0 && <em>{t.exhausted}</em>}</span></span><Grip size={12} className="pl-grip" /></button>)}</div><div className="pl-supplies"><div><span>{t.screw}</span><strong>{number(remaining.screw)}<small> / {number(document.inventory.screw)}</small></strong></div><p>{t.suppliesNote}</p><button onClick={openInventory}>{t.manualInventory} <Settings2 size={13} /></button></div></aside>

          <section className="pl-viewport" aria-label={t.viewportAria}><div className="pl-scene-fill"><PlannerScene document={document} selectedId={selectedId} draft={draft} placementHeightMm={placementHeightMm} showPorts={showPorts} frameRequest={frameRequest} view={view} viewRequest={viewRequest} onSelect={setSelectedId} onMoveStart={handleMoveStart} onRotate={rotate} onPreview={handlePreview} onCommit={handleCommit} onCancel={resetInteraction} /></div><div className="pl-view-heading"><span><i /> {t.viewportTitle}</span><span className="pl-view-count">{t.partCount(number(document.parts.length))} <i /> {t.connectionCount(number(usage.screw))}</span></div>{!document.parts.length && !draft && <div className="pl-empty-intro"><span className="pl-empty-mark"><Boxes size={33} strokeWidth={1.3} /></span><span className="pl-kicker">{t.emptyKicker}</span><h2>{t.emptyTitle}<span>.</span></h2><p>{t.emptyIntro}</p><div><span><MousePointer2 size={13} /> {t.dragOrClick}</span><span><Magnet size={13} /> {t.snapToPorts}</span></div></div>}<div className={`pl-live-status ${preview && !preview.valid && draft ? "is-invalid" : preview?.snap && draft ? "is-snapped" : ""}`} role="status" aria-live="polite" aria-atomic="true"><span className="pl-live-icon">{draft ? preview && !preview.valid ? <X size={16} /> : preview?.snap ? <Magnet size={16} /> : <Move3D size={16} /> : <MousePointer2 size={16} />}</span><span>{statusText}</span>{draft && <button onClick={resetInteraction} aria-label={t.cancelPlacement}><X size={16} /><span>Esc</span></button>}</div><div className="pl-viewport-bottom"><span><MousePointer2 size={12} /> {t.cameraHint}</span><span>mm</span></div></section>

          <aside className="pl-properties" aria-label={t.propertiesAria}><div className="pl-property-heading"><span className="pl-kicker">{draft ? draft.movingId ? t.moving : t.placing : selected ? t.selectedPart : t.yourWorkshop}</span><Move3D size={15} /></div>{activeDefinition ? <div className="pl-active-part"><span className="pl-active-swatch" style={{ backgroundColor: activeDefinition.color }} /><span className="pl-part-code">{activeDefinition.code} · {activeDefinition.colorName}</span><h2>{activeDefinition.name}</h2><p>{draft ? t.draftHint : t.selectedHint}</p></div> : <div className="pl-selection-placeholder"><span><Move3D size={27} strokeWidth={1.3} /></span><h2>{t.selectionTitle}</h2><p>{t.selectionHint}</p></div>}

            {selected && !draft && activeDefinition && <div className="pl-position" role="status" aria-label={t.selectedConnectionsAria}><span>{t.connections}</span><div><span>{t.connected} <b>{number(selectedConnectionCount)}</b></span><span>{t.free} <b>{number(activeDefinition.ports.length - selectedConnectionCount)}</b></span><span>{t.total} <b>{number(activeDefinition.ports.length)}</b></span></div></div>}
            <section className="pl-control-section">
              <div className="pl-section-title"><h3>{t.rotation}</h3><span>{t.rotationStep}</span></div>
              <div className="pl-rotation-controls" role="group" aria-label={t.rotationAria} aria-describedby="pl-rotation-hint">
                {AXES.map((axis) => <div key={axis} className={`pl-axis pl-axis-${axis}`} style={{ "--pl-axis-color": ROTATION_AXES[axis].color } as CSSProperties}>
                  <span>{ROTATION_AXES[axis].label}</span>
                  <button disabled={!activeDefinition} onClick={() => rotate(axis, -1)} aria-label={t.rotateNegative(ROTATION_AXES[axis].label)} title={t.rotateNegativeTitle(ROTATION_AXES[axis].label)}><RotateCcw size={14} />−90°</button>
                  <button disabled={!activeDefinition} onClick={() => rotate(axis, 1)} aria-label={t.rotatePositive(ROTATION_AXES[axis].label)} title={t.rotatePositiveTitle(ROTATION_AXES[axis].label)}><RotateCw size={14} />+90°</button>
                </div>)}
              </div>
              <p className="pl-control-note pl-rotation-hint" id="pl-rotation-hint">{t.rotationHint} <span className="pl-axis-legend">{AXES.map((axis, index) => <span key={axis} style={{ color: ROTATION_AXES[axis].color }}><i aria-hidden="true" />{ROTATION_AXES[axis].label}: {t.axisColors[axis]}{index < AXES.length - 1 ? ", " : "."}</span>)}</span></p>
              <p className="pl-control-note">{activeOrientation !== undefined ? t.orientation(number(activeOrientation + 1)) : t.rotationKeyboard}</p>
              {selected && !draft && <><div className="pl-position"><span>{t.position}</span><div>{AXES.map((axis, index) => <span key={axis}>{axis.toUpperCase()} <b>{number(selected.positionMm[index])}</b></span>)}</div></div><div className="pl-selected-actions"><button onClick={() => handleMoveStart(selected.id)}><Move3D size={15} /> {t.move}</button><button onClick={deleteSelected} className="pl-delete" aria-label={t.deleteSelected}><Trash2 size={15} /></button></div><p className="pl-control-note">{t.moveHint}</p></>}
            </section>

            <section className="pl-control-section"><div className="pl-section-title"><h3><Layers3 size={14} /> {t.placementPlane}</h3><button onClick={() => changeHeight(0)} className="pl-text-button">{t.ground}</button></div><div className="pl-height-control"><button onClick={() => changeHeight(placementHeightMm - 250)} disabled={placementHeightMm <= 0} aria-label={t.lowerPlane}><Minus size={15} /></button><label><span className="sr-only">{t.planeHeightMm}</span><input type="number" min={0} max={3000} step={25} value={placementHeightMm} onChange={(event) => { if (event.target.value !== "") changeHeight(Number(event.target.value)); }} /><span>mm</span></label><button onClick={() => changeHeight(placementHeightMm + 250)} disabled={placementHeightMm >= 3000} aria-label={t.raisePlane}><Plus size={15} /></button></div><input className="pl-height-range" type="range" min={0} max={3000} step={25} value={placementHeightMm} onChange={(event) => changeHeight(Number(event.target.value))} aria-label={t.planeHeight} /><p className="pl-control-note">{t.planeHint}</p></section>

            <section className="pl-control-section pl-camera-section"><div className="pl-section-title"><h3>{t.view}</h3><button className="pl-text-button" onClick={() => setFrameRequest((value) => value + 1)} title={t.fitTitle}><Maximize2 size={13} /> {t.fit}</button></div><div className="pl-camera-presets" aria-label={t.cameraViews}>{([{ id: "isometric", label: t.isometric, Icon: Box }, { id: "front", label: t.front, Icon: Expand }, { id: "top", label: t.top, Icon: Grid2X2 }] as const).map(({ id, label, Icon }) => <button key={id} aria-pressed={view === id} onClick={() => { setView(id); setViewRequest((value) => value + 1); }}><Icon size={15} /><span>{label}</span></button>)}</div><button className={`pl-ports-toggle ${showPorts ? "is-active" : ""}`} aria-pressed={showPorts} onClick={() => setShowPorts((value) => !value)}><Target size={15} /><span>{t.ports}</span><span className="pl-toggle-track"><i /></span></button></section>
            <div className="pl-workshop-note"><Magnet size={17} /><p>{t.workshopNote}</p></div>
          </aside>
        </div>
        <footer className="pl-footer"><p><Info size={14} /><span>{t.disclaimer} <button onClick={openInventory}>{t.stockSource} <ArrowUpRight size={11} /></button></span></p><span>{t.localWorkspace} <i /> {t.planVersion}</span></footer>
      </main>

      <dialog className="pl-dialog pl-inventory-dialog" ref={inventoryDialog} aria-labelledby="inventory-title" onClick={(event) => { if (event.target === event.currentTarget) inventoryDialog.current?.close(); }}><form noValidate onSubmit={saveInventory}><div className="pl-dialog-top"><span className="pl-kicker">{t.manualStockKicker}</span><button type="button" className="pl-icon-button" onClick={() => inventoryDialog.current?.close()} aria-label={t.closeInventory}><X size={19} /></button></div><h2 id="inventory-title">{t.inventoryTitle}</h2><p>{t.inventoryIntro}</p><div className="pl-inventory-table"><div className="pl-inventory-table-heading"><span>{t.part}</span><span>{t.used}</span><span>{t.stockTotal}</span></div>{PARTS.map(localizePart).map((part) => <div className="pl-inventory-row" key={part.id}><label htmlFor={`stock-${part.kind}`}><i style={{ backgroundColor: part.color }} /><span>{part.name}{part.category === "accessory" && <small>{part.kind === "screw" ? t.forConnections : t.supply}</small>}</span></label><span>{number(usage[part.kind])} {t.pieces}</span><input id={`stock-${part.kind}`} type="number" inputMode="numeric" min={usage[part.kind]} step={1} required value={inventoryEdit[part.kind]} onChange={(event) => { setInventoryEdit((current) => ({ ...current, [part.kind]: event.target.value })); setInventoryError(null); }} aria-label={t.inventoryTotal(part.name)} /></div>)}</div>{inventoryError && <div className="pl-form-error" role="alert"><Info size={15} />{inventoryErrorText}</div>}<div className="pl-inventory-source"><Info size={15} /><p>{t.inventorySource}. {t.sourceCaveat} <a href={MANUAL_URL} target="_blank" rel="noreferrer">{t.relatedManual} <ArrowUpRight size={11} /></a></p></div><div className="pl-dialog-actions"><button type="button" onClick={() => inventoryDialog.current?.close()}>{t.cancel}</button><button className="pl-primary" type="submit"><Check size={16} /> {t.applyInventory}</button></div></form></dialog>

      <dialog className="pl-dialog pl-help-dialog" ref={helpDialog} aria-labelledby="planner-help-title" onClick={(event) => { if (event.target === event.currentTarget) helpDialog.current?.close(); }}><div className="pl-dialog-top"><span className="pl-kicker">{t.helpKicker}</span><button className="pl-icon-button" onClick={() => helpDialog.current?.close()} aria-label={t.closeHelp}><X size={19} /></button></div><h2 id="planner-help-title">{t.helpTitle}</h2><div className="pl-help-steps"><div><span>01</span><div><strong>{t.helpChooseTitle}</strong><p>{t.helpChoose}</p></div></div><div><span>02</span><div><strong>{t.helpRotateTitle}</strong><p>{t.helpRotate}</p></div></div><div><span>03</span><div><strong>{t.helpEditTitle}</strong><p>{t.helpEdit}</p></div></div></div><div className="pl-key-help"><span><kbd>Esc</kbd> {t.keyCancel}</span><span><kbd>Del</kbd> {t.keyDelete}</span><span><kbd>Ctrl Z</kbd> {t.keyUndo}</span><span><kbd>F</kbd> {t.keyFit}</span></div><p className="pl-help-save"><HardDrive size={16} /> {t.helpSave}</p><button className="pl-primary pl-dialog-done" onClick={() => helpDialog.current?.close()}>{t.helpDone} <ArrowUpRight size={16} /></button></dialog>
    </div>
  );
}
