"use client";

import { Component, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges, Grid, OrbitControls } from "@react-three/drei";
import { PerspectiveCamera, Plane, Quaternion, Raycaster, Vector2, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MM_PER_SCENE_UNIT, type Vec3 } from "@/domain/parts";
import type { PlacedPart, PlacementResult, PlannerDraft, PlannerSceneProps, WorldPort } from "@/domain/planner";
import { evaluatePlacement, getPartDefinition, groundedPosition } from "@/lib/assembly-engine";
import { PartModel } from "@/components/3d/part-model";
import { centerCamera, framingDistance } from "@/components/3d/part-framing";
import { assemblyFrame, availableConnectionPorts, orientationQuaternion, pointerPortTarget, scenePosition } from "./scene-math";
import { RotationGizmo } from "./rotation-gizmo";
import { isRotationControlEvent } from "./rotation-gizmo-math";
import { useI18n } from "@/i18n/provider";
import { sceneMessages } from "@/i18n/scene-messages";

const CAMERA = { position: [14, 12, 17] as [number, number, number], fov: 40, near: 0.01, far: 3000 };
const GREEN = "#138966";
const RED = "#d43b43";
const DRAG_THRESHOLD = 5;
const PLACEMENT_STEP_MM = 5;
const UP = new Vector3(0, 1, 0);
const PLACEMENT_OPTIONS = { magnetic: true, autoOrient: true } as const;

function Failure({ onRetry }: { onRetry: () => void }) {
  const { locale } = useI18n();
  const t = sceneMessages[locale];
  return <div role="status" className="viewer-message" style={{ height: "100%", display: "grid", alignContent: "center", justifyItems: "center", gap: 12, padding: 28, textAlign: "center" }}>
    <strong>{t.unavailable}</strong>
    <span>{t.webglRequired}</span>
    <button type="button" onClick={onRetry}>{t.retry}</button>
  </div>;
}

class SceneBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Failure onRetry={this.props.onRetry} /> : this.props.children; }
}

function PartOutline({ partId, color }: { partId: string; color: string }) {
  const { length, height, width } = getPartDefinition(partId).dimensionsMm;
  return <mesh raycast={() => {}}>
    <boxGeometry args={[length / MM_PER_SCENE_UNIT + 0.06, height / MM_PER_SCENE_UNIT + 0.06, width / MM_PER_SCENE_UNIT + 0.06]} />
    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    <Edges color={color} />
  </mesh>;
}

const PlacedMesh = memo(function PlacedMesh({ part, selected, onGrab, onHover }: {
  part: PlacedPart;
  selected: boolean;
  onGrab: (part: PlacedPart, event: ThreeEvent<PointerEvent>) => void;
  onHover: (hovering: boolean) => void;
}) {
  const definition = getPartDefinition(part.partId);
  const position = useMemo(() => scenePosition(part.positionMm), [part.positionMm]);
  return <group position={position} quaternion={orientationQuaternion(part.orientation)}
    onPointerDown={(event) => onGrab(part, event)}
    onPointerOver={() => onHover(true)} onPointerOut={() => onHover(false)}>
    <PartModel part={definition} />
    {selected && <PartOutline partId={part.partId} color="#3769ad" />}
  </group>;
});

const PreviewMesh = memo(function PreviewMesh({ result }: { result: PlacementResult }) {
  const color = result.valid ? GREEN : RED;
  const definition = useMemo(() => ({ ...getPartDefinition(result.part.partId), color }), [color, result.part.partId]);
  // Only the uncommitted wire ghost is tinted; placed meshes retain the retail colors.
  return <group position={scenePosition(result.part.positionMm)} quaternion={orientationQuaternion(result.part.orientation)} raycast={() => {}}>
    <PartModel part={definition} wireframe />
    <PartOutline partId={result.part.partId} color={color} />
    <mesh position={[0, 0, 0]} raycast={() => {}} renderOrder={5}>
      <sphereGeometry args={[0.075, 12, 8]} />
      <meshBasicMaterial color={color} depthTest={false} />
    </mesh>
  </group>;
});

const PortMarker = memo(function PortMarker({ port, snapped }: { port: WorldPort; snapped: boolean }) {
  const quaternion = useMemo(() => new Quaternion().setFromUnitVectors(UP, new Vector3(...port.direction)), [port.direction]);
  return <group position={scenePosition(port.positionMm)} quaternion={quaternion}>
    <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={5} raycast={() => {}}>
      <torusGeometry args={[port.kind === "tube" ? 0.28 : 0.33, snapped ? 0.025 : 0.015, 5, 24]} />
      <meshBasicMaterial color={snapped ? GREEN : "#2aa8a2"} depthTest={false} transparent opacity={snapped ? 1 : 0.8} />
    </mesh>
    <mesh renderOrder={5} raycast={() => {}}><sphereGeometry args={[snapped ? 0.065 : 0.04, 10, 6]} /><meshBasicMaterial color={snapped ? GREEN : "#2aa8a2"} depthTest={false} /></mesh>
  </group>;
});

function previewSignature(result: PlacementResult | null) {
  if (!result) return "";
  return [result.part.id, result.part.orientation, ...result.part.positionMm, result.valid, result.reason,
    result.snap?.source.portId, result.snap?.target.instanceId, result.snap?.target.portId].join("|");
}

type Point = { x: number; y: number };
type Grab = {
  part: PlacedPart;
  origin: Point;
  pointerId: number;
  offsetMm: Vec3;
  started: boolean;
};
type PaletteDrag = { origin: Point; pointerId: number | null; moved: boolean };

function Scene(props: PlannerSceneProps & { report: (result: PlacementResult | null) => void; onFailure: () => void }) {
  const { document: plan, draft, selectedId, showPorts } = props;
  const { camera, gl, size, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; }, [props]);
  const [preview, setPreview] = useState<PlacementResult | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const signatureRef = useRef("");
  const lastPoint = useRef<Point | null>(null);
  const grab = useRef<Grab | null>(null);
  const localDraft = useRef<PlannerDraft | null>(null);
  const paletteDrag = useRef<PaletteDrag | null>(null);
  const paletteOriginSeen = useRef<Point | null>(null);
  const stagePress = useRef<number | null>(null);
  const capturedPointer = useRef<number | null>(null);
  const consumedDraft = useRef<PlannerDraft | null>(null);
  const candidateIdentity = useRef<{ partId: string; movingId?: string; id: string } | null>(null);
  const evaluation = useRef<{ document: PlannerSceneProps["document"]; key: string; result: PlacementResult } | null>(null);
  const portCache = useRef<{ document: PlannerSceneProps["document"]; movingId?: string; ports: WorldPort[] } | null>(null);
  const animationFrame = useRef<number | null>(null);
  const pendingMove = useRef<PointerEvent | null>(null);
  const raycaster = useMemo(() => new Raycaster(), []);
  const plane = useMemo(() => new Plane(UP, 0), []);
  const pointer = useMemo(() => new Vector2(), []);
  const intersection = useMemo(() => new Vector3(), []);
  const cameraDirection = useMemo(() => new Vector3(), []);
  const planeAnchor = useMemo(() => new Vector3(), []);
  const frame = useMemo(() => assemblyFrame(plan.parts), [plan.parts]);
  const appliedFrame = useRef<{ frame: number; view: number } | null>(null);

  const activeDraft = useCallback(() => {
    const current = latest.current.draft;
    return current && current !== consumedDraft.current ? current : localDraft.current;
  }, []);

  const availablePorts = useCallback((document: PlannerSceneProps["document"], movingId?: string) => {
    if (portCache.current?.document !== document || portCache.current.movingId !== movingId) {
      portCache.current = { document, movingId, ports: availableConnectionPorts(document.parts, movingId) };
    }
    return portCache.current.ports;
  }, []);

  const releaseCapture = useCallback(() => {
    const id = capturedPointer.current;
    capturedPointer.current = null;
    if (id !== null && gl.domElement.hasPointerCapture(id)) {
      try { gl.domElement.releasePointerCapture(id); } catch { /* The browser may already have ended a touch. */ }
    }
  }, [gl]);

  const capture = useCallback((pointerId: number) => {
    try { gl.domElement.setPointerCapture(pointerId); capturedPointer.current = pointerId; } catch { /* Global listeners also work without pointer capture. */ }
  }, [gl]);

  const publish = useCallback((result: PlacementResult | null) => {
    const signature = previewSignature(result);
    if (signatureRef.current === signature) return;
    signatureRef.current = signature;
    setPreview(result);
    latest.current.report(result);
    invalidate();
  }, [invalidate]);

  const inside = useCallback((point: Point) => {
    const rect = gl.domElement.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  }, [gl]);

  const groundPoint = useCallback((point: Point): Vec3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set((point.x - rect.left) / rect.width * 2 - 1, -(point.y - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    camera.getWorldDirection(cameraDirection);
    if (Math.abs(cameraDirection.y) < 0.12) {
      // Front views use a vertical workplane through the grabbed part or orbit target.
      // Choosing by camera direction (rather than individual ray) keeps the whole screen continuous.
      const anchor = grab.current?.part.positionMm;
      if (anchor) planeAnchor.set(...scenePosition(anchor));
      else planeAnchor.copy(controls.current?.target ?? new Vector3());
      plane.normal.set(cameraDirection.x, 0, cameraDirection.z).normalize();
      plane.setFromNormalAndCoplanarPoint(plane.normal, planeAnchor);
    } else {
      plane.set(UP, -latest.current.placementHeightMm / MM_PER_SCENE_UNIT);
    }
    if (!raycaster.ray.intersectPlane(plane, intersection)) return null;
    return [intersection.x * MM_PER_SCENE_UNIT, intersection.y * MM_PER_SCENE_UNIT, intersection.z * MM_PER_SCENE_UNIT];
  }, [camera, cameraDirection, gl, intersection, plane, planeAnchor, pointer, raycaster]);

  const updatePreview = useCallback((point: Point): PlacementResult | null => {
    const currentDraft = activeDraft();
    if (!currentDraft || !inside(point)) { publish(null); return null; }
    let identity = candidateIdentity.current;
    if (!identity || identity.partId !== currentDraft.partId || identity.movingId !== currentDraft.movingId) {
      identity = { partId: currentDraft.partId, movingId: currentDraft.movingId, id: currentDraft.movingId ?? `part-${crypto.randomUUID()}` };
      candidateIdentity.current = identity;
    }
    camera.updateMatrixWorld();
    camera.getWorldDirection(cameraDirection);
    const target = pointerPortTarget(availablePorts(latest.current.document, currentDraft.movingId), currentDraft.partId,
      camera, point, gl.domElement.getBoundingClientRect());
    // A visible endpoint keeps its actual height. The plane is only the free-placement fallback.
    const hit = target?.positionMm ?? groundPoint(point);
    if (!hit) { publish(null); return null; }
    const offset = grab.current?.started ? grab.current.offsetMm : [0, 0, 0];
    const rounded = (value: number) => Math.round(value / PLACEMENT_STEP_MM) * PLACEMENT_STEP_MM;
    const placementHeightMm = !currentDraft.movingId && Math.abs(cameraDirection.y) >= 0.12
      ? latest.current.placementHeightMm : undefined;
    const requestedPosition: Vec3 = [rounded(hit[0] + offset[0]), hit[1] + offset[1], rounded(hit[2] + offset[2])];
    const positionMm = target ? target.positionMm : placementHeightMm === undefined
      ? groundedPosition(currentDraft.partId, requestedPosition, currentDraft.orientation) : requestedPosition;
    const candidate: PlacedPart = { id: identity.id, partId: currentDraft.partId, orientation: currentDraft.orientation, positionMm };
    const snapTarget = target ? { instanceId: target.instanceId, portId: target.portId } : undefined;
    const key = [candidate.id, candidate.partId, candidate.orientation, ...candidate.positionMm, placementHeightMm,
      snapTarget?.instanceId, snapTarget?.portId].join("|");
    const previous = evaluation.current;
    const result = previous?.document === latest.current.document && previous.key === key
      ? previous.result
      : evaluatePlacement(latest.current.document, candidate, { ...PLACEMENT_OPTIONS, placementHeightMm, snapTarget });
    evaluation.current = { document: latest.current.document, key, result };
    publish(result);
    return result;
  }, [activeDraft, availablePorts, camera, cameraDirection, gl, groundPoint, inside, publish]);

  const resetGesture = useCallback(() => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
    pendingMove.current = null;
    grab.current = null;
    paletteDrag.current = null;
    stagePress.current = null;
    localDraft.current = null;
    releaseCapture();
    setGrabbing(false);
    if (controls.current) controls.current.enabled = !latest.current.draft;
  }, [releaseCapture]);

  const cancel = useCallback(() => {
    consumedDraft.current = latest.current.draft;
    resetGesture();
    publish(null);
    latest.current.onCancel();
  }, [publish, resetGesture]);

  // Keep the camera fixed through edits. Only explicit frame/view requests reframe the assembly.
  // Three.js owns this mutable camera; projection changes belong in this external-system effect.
  /* eslint-disable react-hooks/immutability */
  useLayoutEffect(() => {
    const orbit = controls.current;
    if (!(camera instanceof PerspectiveCamera) || !orbit || !size.width || !size.height) return;
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    const previous = appliedFrame.current;
    const viewChanged = !previous || previous.view !== props.viewRequest;
    if (!previous || previous.frame !== props.frameRequest || viewChanged) {
      const direction = viewChanged
        ? props.view === "top" ? new Vector3(0, 1, 0.001) : props.view === "front" ? new Vector3(0, 0.001, 1) : new Vector3(1.15, 0.85, 1.35)
        : camera.position.clone().sub(orbit.target);
      orbit.minDistance = Math.max(0.3, frame.radius * 0.15);
      orbit.maxDistance = Math.max(150, frame.radius * 16);
      centerCamera(camera, orbit, frame.center, direction, framingDistance(camera, frame.radius, camera.aspect));
      camera.near = Math.max(0.005, frame.radius / 1000);
      camera.far = Math.max(3000, orbit.maxDistance * 4);
      camera.updateProjectionMatrix();
      appliedFrame.current = { frame: props.frameRequest, view: props.viewRequest };
    }
    invalidate();
  }, [camera, frame, invalidate, props.frameRequest, props.view, props.viewRequest, size.height, size.width]);
  /* eslint-enable react-hooks/immutability */

  // A parent cancellation must clear the local ghost and capture before the next pointer event.
  /* eslint-disable react-hooks/set-state-in-effect */
  useLayoutEffect(() => {
    if (draft === null) {
      consumedDraft.current = null;
      candidateIdentity.current = null;
      paletteOriginSeen.current = null;
      evaluation.current = null;
      resetGesture();
      publish(null);
    } else if (draft !== consumedDraft.current) {
      const origin = draft.dragOrigin;
      if (origin && paletteOriginSeen.current !== origin) {
        paletteOriginSeen.current = origin;
        paletteDrag.current = { origin, pointerId: null, moved: false };
      }
      if (lastPoint.current) updatePreview(lastPoint.current);
    }
    gl.domElement.style.setProperty("cursor", draft ? "crosshair" : "grab");
  }, [draft, gl, plan, props.placementHeightMm, publish, resetGesture, updatePreview]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onGrab = useCallback((part: PlacedPart, event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || activeDraft()) return;
    event.stopPropagation();
    const origin = { x: event.clientX, y: event.clientY };
    const hit = groundPoint(origin);
    if (!hit) return;
    latest.current.onSelect(part.id);
    grab.current = {
      part, origin, pointerId: event.pointerId, started: false,
      offsetMm: [part.positionMm[0] - hit[0], part.positionMm[1] - hit[1], part.positionMm[2] - hit[2]],
    };
    if (controls.current) controls.current.enabled = false;
    setGrabbing(true);
    capture(event.pointerId);
    gl.domElement.style.setProperty("cursor", "grabbing");
  }, [activeDraft, capture, gl, groundPoint]);

  const onHover = useCallback((hovering: boolean) => {
    if (!activeDraft() && !grab.current) gl.domElement.style.setProperty("cursor", hovering ? "grab" : "auto");
  }, [activeDraft, gl]);

  useEffect(() => {
    const canvas = gl.domElement;
    const stage = canvas.closest(".pl-scene-canvas");
    const keyboardPoint = () => {
      if (lastPoint.current && inside(lastPoint.current)) return lastPoint.current;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const processMove = (event: PointerEvent) => {
      if (isRotationControlEvent(event)) return;
      const point = { x: event.clientX, y: event.clientY };
      lastPoint.current = point;
      const currentGrab = grab.current;
      if (currentGrab) {
        if (event.pointerId !== currentGrab.pointerId) return;
        if (!currentGrab.started && Math.hypot(point.x - currentGrab.origin.x, point.y - currentGrab.origin.y) >= DRAG_THRESHOLD) {
          currentGrab.started = true;
          localDraft.current = { partId: currentGrab.part.partId, orientation: currentGrab.part.orientation, movingId: currentGrab.part.id };
          latest.current.onMoveStart(currentGrab.part.id);
        }
        if (!currentGrab.started) return;
      }
      const drag = paletteDrag.current;
      if (drag) {
        if (drag.pointerId !== null && event.pointerId !== drag.pointerId) return;
        drag.pointerId = event.pointerId;
        if (Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) >= DRAG_THRESHOLD) drag.moved = true;
      }
      if (activeDraft()) updatePreview(point);
    };
    const pointerMove = (event: PointerEvent) => {
      if (isRotationControlEvent(event)) return;
      if (event.pointerType === "touch" && (grab.current || paletteDrag.current || stagePress.current !== null)) event.preventDefault();
      pendingMove.current = event;
      if (animationFrame.current !== null) return;
      animationFrame.current = requestAnimationFrame(() => {
        animationFrame.current = null;
        const pending = pendingMove.current;
        pendingMove.current = null;
        if (pending) processMove(pending);
      });
    };
    const pointerDown = (event: PointerEvent) => {
      if (isRotationControlEvent(event)) return;
      if (event.button === 2 && (activeDraft() || grab.current)) { event.preventDefault(); cancel(); return; }
      const point = { x: event.clientX, y: event.clientY };
      lastPoint.current = point;
      if (event.button !== 0 || !activeDraft() || !inside(point)) return;
      stagePress.current = event.pointerId;
      capture(event.pointerId);
      updatePreview(point);
    };
    const pointerUp = (event: PointerEvent) => {
      if (isRotationControlEvent(event)) return;
      if (event.button !== 0) return;
      // Process the release synchronously: React props and the last animation frame can lag a fast drop.
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
      pendingMove.current = null;
      const point = { x: event.clientX, y: event.clientY };
      const currentGrab = grab.current;
      const drag = paletteDrag.current;
      if (currentGrab && currentGrab.pointerId !== event.pointerId) return;
      if (stagePress.current !== null && stagePress.current !== event.pointerId) return;
      if (drag?.pointerId !== null && drag?.pointerId !== undefined && drag.pointerId !== event.pointerId) return;
      processMove(event);
      const wasDrag = Boolean(currentGrab?.started || (drag && (drag.moved || Math.hypot(point.x - drag.origin.x, point.y - drag.origin.y) >= DRAG_THRESHOLD)));
      const placing = Boolean(activeDraft()) && (wasDrag || stagePress.current !== null);
      if (placing && !inside(point)) { cancel(); return; }
      const result = placing ? updatePreview(point) : null;
      if (result?.valid) {
        consumedDraft.current = latest.current.draft;
        resetGesture();
        publish(null);
        latest.current.onCommit(result.part);
      } else {
        // A palette click arms click-to-place; an invalid drop remains available for correction.
        resetGesture();
        if (!activeDraft()) publish(null);
      }
      gl.domElement.style.setProperty("cursor", activeDraft() ? "crosshair" : "grab");
    };
    const pointerCancel = (event: Event) => { if (!isRotationControlEvent(event) && (activeDraft() || grab.current)) cancel(); };
    const keyDown = (event: KeyboardEvent) => {
      if (isRotationControlEvent(event)) return;
      if (event.key === "Escape" && (activeDraft() || grab.current)) { event.preventDefault(); cancel(); }
      if (!activeDraft() || (event.target !== stage && event.target !== canvas)) return;
      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
        const point = keyboardPoint();
        const step = event.shiftKey ? 50 : 10;
        const rect = canvas.getBoundingClientRect();
        lastPoint.current = {
          x: Math.min(rect.right - 1, Math.max(rect.left + 1, point.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0))),
          y: Math.min(rect.bottom - 1, Math.max(rect.top + 1, point.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0))),
        };
        updatePreview(lastPoint.current);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const result = updatePreview(keyboardPoint());
        if (!result?.valid) return;
        consumedDraft.current = latest.current.draft;
        resetGesture();
        publish(null);
        latest.current.onCommit(result.part);
      }
    };
    const focusIn = (event: FocusEvent) => {
      if (isRotationControlEvent(event)) return;
      if (activeDraft() && (event.target === stage || event.target === canvas)) {
        lastPoint.current = keyboardPoint();
        updatePreview(lastPoint.current);
      }
    };
    const contextMenu = (event: MouseEvent) => {
      if (isRotationControlEvent(event)) return;
      if (activeDraft() || grab.current || inside({ x: event.clientX, y: event.clientY })) {
        event.preventDefault();
        if (activeDraft() || grab.current) cancel();
      }
    };
    const lostContext = (event: Event) => { event.preventDefault(); cancel(); latest.current.onFailure(); };
    window.addEventListener("pointermove", pointerMove, { capture: true, passive: false });
    window.addEventListener("pointerdown", pointerDown, true);
    window.addEventListener("pointerup", pointerUp, true);
    window.addEventListener("pointercancel", pointerCancel, true);
    window.addEventListener("keydown", keyDown);
    stage?.addEventListener("focusin", focusIn as EventListener);
    window.addEventListener("contextmenu", contextMenu, true);
    window.addEventListener("blur", pointerCancel);
    canvas.addEventListener("webglcontextlost", lostContext);
    return () => {
      window.removeEventListener("pointermove", pointerMove, true);
      window.removeEventListener("pointerdown", pointerDown, true);
      window.removeEventListener("pointerup", pointerUp, true);
      window.removeEventListener("pointercancel", pointerCancel, true);
      window.removeEventListener("keydown", keyDown);
      stage?.removeEventListener("focusin", focusIn as EventListener);
      window.removeEventListener("contextmenu", contextMenu, true);
      window.removeEventListener("blur", pointerCancel);
      canvas.removeEventListener("webglcontextlost", lostContext);
      if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
      releaseCapture();
      canvas.style.removeProperty("cursor");
    };
  }, [activeDraft, cancel, capture, gl, inside, publish, releaseCapture, resetGesture, updatePreview]);

  const movingId = draft?.movingId;
  const selectedPart = !draft && !grabbing ? plan.parts.find((part) => part.id === selectedId) : null;
  const freePorts = useMemo(() => availableConnectionPorts(plan.parts, movingId), [movingId, plan.parts]);
  const visiblePorts = useMemo(() => {
    const sourcePartId = draft?.partId ?? preview?.part.partId;
    const sourceKind = sourcePartId ? getPartDefinition(sourcePartId).kind : null;
    return freePorts.filter((port) => {
      if (sourceKind && ((sourceKind === "tube") === (port.kind === "tube"))) return false;
      // Placement hints include upper layers even before the ghost reaches their height.
      return showPorts || sourceKind !== null;
    });
  }, [draft, freePorts, preview, showPorts]);

  return <>
    <color attach="background" args={["#edf0eb"]} />
    <ambientLight intensity={1.4} />
    <hemisphereLight args={["#fffdfa", "#98a6ae", 1.25]} />
    <directionalLight position={[8, 14, 9]} intensity={3} color="#fff6e6" />
    <directionalLight position={[-7, 6, -8]} intensity={1.4} color="#d6e8ff" />
    <Grid position={[frame.center.x, -0.015, frame.center.z]} args={[frame.gridSize, frame.gridSize]} cellSize={1} sectionSize={5}
      cellColor="#ced6ce" sectionColor="#aab9ac" cellThickness={0.6} sectionThickness={0.9} fadeDistance={frame.gridSize} fadeStrength={1.5} infiniteGrid={false} />
    {draft && props.placementHeightMm > 0 && <Grid position={[frame.center.x, props.placementHeightMm / MM_PER_SCENE_UNIT, frame.center.z]} args={[frame.gridSize, frame.gridSize]}
      cellSize={1} sectionSize={5} cellColor="#bdd5d1" sectionColor="#8aada7" cellThickness={0.3} sectionThickness={0.5} fadeDistance={frame.gridSize / 2} fadeStrength={2} infiniteGrid={false} />}
    {plan.parts.map((part) => movingId === part.id && preview ? null : <PlacedMesh key={part.id} part={part} selected={part.id === selectedId} onGrab={onGrab} onHover={onHover} />)}
    {preview && <PreviewMesh result={preview} />}
    {selectedPart && <RotationGizmo key={selectedPart.id} document={plan} part={selectedPart} onRotate={props.onRotate} />}
    {visiblePorts.map((port) => <PortMarker key={`${port.instanceId}:${port.portId}`} port={port}
      snapped={preview?.snap?.target.instanceId === port.instanceId && preview.snap.target.portId === port.portId} />)}
    <OrbitControls ref={controls} makeDefault enabled={!draft && !grabbing} enableDamping={false} minDistance={0.3} maxDistance={3000}
      minPolarAngle={0.001} maxPolarAngle={Math.PI / 2 - 0.001} rotateSpeed={0.7} zoomSpeed={0.8} panSpeed={0.7} />
  </>;
}

export default function PlannerScene(props: PlannerSceneProps) {
  const { locale } = useI18n();
  const t = sceneMessages[locale];
  const [available, setAvailable] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const ignoreMissedUntil = useRef(0);
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; }, [props]);

  useEffect(() => {
    const request = requestAnimationFrame(() => {
      let supported = false;
      try {
        const canvas = window.document.createElement("canvas");
        const context = canvas.getContext("webgl2");
        supported = Boolean(context);
        context?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch { supported = false; }
      setAvailable(supported);
    });
    return () => cancelAnimationFrame(request);
  }, [attempt]);

  const report = useCallback((result: PlacementResult | null) => { latest.current.onPreview(result); }, []);
  const failure = useCallback(() => { setContextLost(true); }, []);
  const retry = useCallback(() => { setAvailable(null); setContextLost(false); setAttempt((value) => value + 1); }, []);
  const commit = useCallback((part: PlacedPart) => {
    // Fiber emits pointer-missed on the click following a successful drop onto empty grid.
    ignoreMissedUntil.current = performance.now() + 250;
    latest.current.onCommit(part);
  }, []);
  const missed = useCallback((event: MouseEvent) => { if (!isRotationControlEvent(event) && !latest.current.draft && performance.now() >= ignoreMissedUntil.current) latest.current.onSelect(null); }, []);

  if (available === false || contextLost) return <Failure onRetry={retry} />;
  if (available === null) return <div className="viewer-message" role="status" style={{ height: "100%", display: "grid", placeContent: "center" }}>{t.starting}</div>;

  return <div className="pl-scene-canvas" tabIndex={0} role="region" aria-label={t.workspaceAria}
    aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space Escape" style={{ width: "100%", height: "100%", position: "relative", touchAction: "none" }}>
    <SceneBoundary key={attempt} onRetry={retry}>
      <Canvas frameloop="demand" dpr={[1, 1.5]} camera={CAMERA} gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%", touchAction: "none" }} onPointerMissed={missed} fallback={<Failure onRetry={retry} />}>
        <Scene {...props} onCommit={commit} report={report} onFailure={failure} />
      </Canvas>
    </SceneBoundary>
  </div>;
}
