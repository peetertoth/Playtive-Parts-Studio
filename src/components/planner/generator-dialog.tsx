"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Check, Info, LoaderCircle, Shuffle, X } from "lucide-react";
import { PARTS } from "@/domain/catalog";
import type { GenerationFailure, GenerationLimits, GenerationOptions, GenerationStats, GeneratorRequest, GeneratorResponse } from "@/domain/generator";
import type { PlannerDocument } from "@/domain/planner";
import { analyzeAssembly } from "@/lib/assembly-analysis";
import { remainingInventory } from "@/lib/assembly-engine";
import { useI18n } from "@/i18n/provider";
import { generatorMessages } from "@/i18n/generator-messages";

type LimitKey = keyof GenerationLimits;
type LimitFields = Record<LimitKey, string>;
type DialogState =
  | { status: "idle" | "busy" | "cancelled" }
  | { status: "error"; kind: "invalidLimits" | "workerError" | "rejected" }
  | { status: "no-solution"; reason: GenerationFailure; attempts: number }
  | { status: "success"; stats: GenerationStats };

export interface GeneratorDialogProps {
  document: PlannerDocument;
  onClose: () => void;
  onApply: (candidate: PlannerDocument, options: GenerationOptions, baseSnapshot: PlannerDocument, stats: GenerationStats) => boolean;
}

const LIMIT_FIELDS = [
  { key: "widthMm", label: "width" },
  { key: "heightMm", label: "height" },
  { key: "depthMm", label: "depth" },
] as const;
const STRUCTURAL_PARTS = PARTS.filter((part) => part.category !== "accessory");

export function GeneratorDialog({ document, onClose, onApply }: GeneratorDialogProps) {
  const { locale, formatNumber } = useI18n();
  const t = generatorMessages[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  const worker = useRef<Worker | null>(null);
  const closed = useRef(false);
  const lastSeed = useRef<number | null>(null);
  const latest = useRef({ document, onApply });
  useLayoutEffect(() => { latest.current = { document, onApply }; }, [document, onApply]);
  const [mode, setMode] = useState<GenerationOptions["mode"]>(() => document.parts.length ? "continue" : "new");
  const [fields, setFields] = useState<LimitFields>({ widthMm: "", heightMm: "", depthMm: "" });
  const [allowFloating, setAllowFloating] = useState(false);
  const [state, setState] = useState<DialogState>({ status: "idle" });
  const busy = state.status === "busy";

  const terminate = useCallback(() => {
    const running = worker.current;
    worker.current = null;
    if (running) {
      running.onmessage = null;
      running.onerror = null;
      running.onmessageerror = null;
      running.terminate();
    }
  }, []);

  useEffect(() => {
    dialog.current?.showModal();
    return terminate;
  }, [terminate]);

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    terminate();
    onClose();
  }, [onClose, terminate]);

  function cancelSearch() {
    terminate();
    setState({ status: "cancelled" });
  }

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (worker.current || closed.current) return;
    const limits: GenerationLimits = {};
    for (const { key } of LIMIT_FIELDS) {
      const text = fields[key].trim();
      const input = dialog.current?.querySelector<HTMLInputElement>(`#generator-${key}`);
      if (!text && !input?.validity.badInput) continue;
      const value = Number(text);
      if (input?.validity.badInput || !Number.isFinite(value) || value <= 0) {
        setState({ status: "error", kind: "invalidLimits" });
        dialog.current?.querySelector<HTMLInputElement>(`#generator-${key}`)?.focus();
        return;
      }
      limits[key] = value;
    }

    const baseSnapshot = latest.current.document;
    try {
      // getRandomValues remains available on local-network HTTP origins.
      const randomSeed = crypto.getRandomValues(new Uint32Array(1))[0];
      const seed = randomSeed === lastSeed.current ? (randomSeed + 1) >>> 0 : randomSeed;
      lastSeed.current = seed;
      const options: GenerationOptions = { mode, limits, seed, allowFloating };
      const running = new Worker(new URL("../../workers/assembly-generator.worker.ts", import.meta.url), { type: "module" });
      worker.current = running;
      setState({ status: "busy" });
      const fail = () => {
        if (worker.current !== running || closed.current) return;
        terminate();
        setState({ status: "error", kind: "workerError" });
      };
      running.onerror = (error) => { error.preventDefault(); fail(); };
      running.onmessageerror = fail;
      running.onmessage = ({ data }: MessageEvent<GeneratorResponse>) => {
        if (worker.current !== running || closed.current) return;
        terminate();
        try {
          if (data?.type !== "result") { setState({ status: "error", kind: "workerError" }); return; }
          const result = data.result;
          if (result.status === "no-solution") {
            if (!Object.hasOwn(t.reasons, result.reason)) { setState({ status: "error", kind: "workerError" }); return; }
            setState({ status: "no-solution", reason: result.reason, attempts: result.attempts });
            return;
          }
          if (result.status !== "success") { setState({ status: "error", kind: "workerError" }); return; }
          // Summaries count frame parts only; screws, tools and anchors are supplies.
          const analysis = analyzeAssembly(result.document.parts);
          const remaining = remainingInventory(result.document);
          const stats: GenerationStats = {
            ...result.stats,
            usedParts: result.document.parts.length,
            addedParts: result.document.parts.length - (options.mode === "continue" ? baseSnapshot.parts.length : 0),
            remainingParts: STRUCTURAL_PARTS.reduce((total, part) => total + remaining[part.kind], 0),
            connections: analysis.connections,
            bounds: analysis.bounds,
          };
          if (!latest.current.onApply(result.document, options, baseSnapshot, stats)) {
            setState({ status: "error", kind: "rejected" });
            return;
          }
          setState({ status: "success", stats });
        } catch {
          setState({ status: "error", kind: "workerError" });
        }
      };
      const request: GeneratorRequest = { type: "generate", document: baseSnapshot, options };
      running.postMessage(request);
    } catch {
      terminate();
      setState({ status: "error", kind: "workerError" });
    }
  }

  return <dialog ref={dialog} className="pl-dialog pl-generator-dialog" aria-labelledby="generator-title" aria-describedby="generator-intro"
    onCancel={(event) => { event.preventDefault(); close(); }} onClose={close}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <form noValidate onSubmit={generate}>
      <div className="pl-dialog-top"><span className="pl-kicker">{t.kicker}</span><button type="button" className="pl-icon-button" onClick={close} aria-label={t.close}><X size={19} /></button></div>
      <h2 id="generator-title">{t.title}</h2>
      <p id="generator-intro">{t.intro}</p>
      <fieldset className="pl-generator-modes" disabled={busy}><legend>{t.mode}</legend><div>
        <label className={mode === "continue" ? "is-active" : ""}><input type="radio" name="generator-mode" value="continue" checked={mode === "continue"} disabled={!document.parts.length}
          onChange={() => setMode("continue")} /><span><strong>{t.continue}</strong><small>{t.continueHint}</small></span></label>
        <label className={mode === "new" ? "is-active" : ""}><input type="radio" name="generator-mode" value="new" checked={mode === "new"}
          onChange={() => setMode("new")} /><span><strong>{t.new}</strong><small>{t.newHint}</small></span></label>
      </div></fieldset>
      <fieldset className="pl-generator-limits" disabled={busy} aria-describedby="generator-limits-hint"><legend>{t.limits}</legend>
        <p id="generator-limits-hint">{t.limitsHint}</p>
        <div>{LIMIT_FIELDS.map(({ key, label }) => <label key={key} htmlFor={`generator-${key}`}><span>{t[label]}</span><span className="pl-generator-input"><input id={`generator-${key}`} type="number" inputMode="decimal" min={0} step="any" aria-invalid={state.status === "error" && state.kind === "invalidLimits" || undefined} aria-describedby="generator-limits-hint" placeholder={t.uncapped} value={fields[key]}
          onChange={(event) => { setFields((current) => ({ ...current, [key]: event.target.value })); if (state.status === "error" && state.kind === "invalidLimits") setState({ status: "idle" }); }} /><span>mm</span></span></label>)}</div>
      </fieldset>
      <div className="pl-generator-floating">
        <label htmlFor="generator-allow-floating"><input id="generator-allow-floating" type="checkbox" checked={allowFloating} disabled={busy} aria-describedby="generator-floating-hint"
          onChange={(event) => setAllowFloating(event.target.checked)} /><span>{t.allowFloating}</span></label>
        <p id="generator-floating-hint">{t.allowFloatingHint}</p>
      </div>
      <p className="pl-generator-note"><Info size={15} /><span>{t.searchNote}</span></p>
      {busy && <div className="pl-generator-progress" role="status" aria-live="polite"><LoaderCircle size={20} className="spinner" /><div><strong>{t.busy}</strong><p>{t.busyHint}</p></div></div>}
      {state.status === "error" && <div className="pl-form-error" role="alert"><Info size={16} /><span>{t[state.kind]}</span></div>}
      {state.status === "no-solution" && <div className="pl-generator-no-solution" role="status"><strong>{t.noSolution}</strong><p>{t.reasons[state.reason]}</p><small>{t.attempts(formatNumber(state.attempts))}</small></div>}
      {state.status === "cancelled" && <p className="pl-generator-cancelled" role="status">{t.cancelled}</p>}
      {state.status === "success" && <section className="pl-generator-result" role="status" aria-live="polite" aria-label={t.success}>
        <h3><Check size={17} />{t.success}</h3>
        <dl className="pl-generator-counts"><div><dt>{t.used}</dt><dd>{formatNumber(state.stats.usedParts)}</dd></div><div><dt>{t.remaining}</dt><dd>{formatNumber(state.stats.remainingParts)}</dd></div><div><dt>{t.added}</dt><dd>{formatNumber(state.stats.addedParts)}</dd></div></dl>
        <dl className="pl-generator-dimensions">{LIMIT_FIELDS.map(({ key, label }) => <div key={key}><dt>{t[label]}</dt><dd>{formatNumber(state.stats.bounds[key])} mm</dd></div>)}</dl>
        <p className="pl-generator-closed"><Check size={14} />{t.zeroFreePorts}</p><p>{t.resultHint}</p>
      </section>}
      <div className="pl-dialog-actions"><button type="button" onClick={busy ? cancelSearch : close}>{busy ? t.cancelSearch : t.done}</button><button className="pl-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spinner" /> : <Shuffle size={16} />}{state.status === "idle" ? t.generate : t.generateAgain}</button></div>
    </form>
  </dialog>;
}
