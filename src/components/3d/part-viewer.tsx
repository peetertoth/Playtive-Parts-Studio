"use client";

import { Component, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, GizmoHelper, GizmoViewport, Grid, OrbitControls } from "@react-three/drei";
import { Box, RotateCcw } from "lucide-react";
import { Box3, PerspectiveCamera, Vector3, type Group } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { MM_PER_SCENE_UNIT, type PartDefinition } from "@/domain/parts";
import { useI18n } from "@/i18n/provider";
import { viewerMessages } from "@/i18n/viewer-messages";
import { PartModel } from "./part-model";
import { centerCamera, framingDistance } from "./part-framing";

const INITIAL_CAMERA = { fov: 38, position: [4, 3, 5] as [number, number, number], near: 0.01, far: 1000 };

export type CameraView = "isometric" | "front" | "top";
export interface CameraCommand {
  action: CameraView | "reset" | "zoom-in" | "zoom-out" | "rotate-left" | "rotate-right" | "rotate-up" | "rotate-down";
  sequence: number;
}

interface PartViewerProps {
  part: PartDefinition;
  wireframe: boolean;
  showPorts: boolean;
  autoRotate: boolean;
  reducedMotion: boolean;
  command: CameraCommand;
  onInteract: () => void;
}

function ViewerFallback({ onRetry }: { onRetry?: () => void }) {
  const { locale } = useI18n();
  const m = viewerMessages[locale];
  return <div className="viewer-message viewer-fallback" role="status"><div className="loading-mark"><Box size={30} strokeWidth={1.4} /></div><strong>{m.unavailable}</strong><span>{m.webglRequired}<br />{m.libraryAvailable}</span>{onRetry && <button onClick={onRetry}><RotateCcw size={14} /> {m.retry}</button>}</div>;
}

class ViewerErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <ViewerFallback onRetry={this.props.onRetry} /> : this.props.children; }
}

function CameraRig({ part, command, autoRotate, reducedMotion, onInteract, body, focus }: PartViewerProps & { body: RefObject<Group | null>; focus: RefObject<Vector3> }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const frame = useRef<{ radius: number; distance: number } | null>(null);
  const appliedCommand = useRef<number | null>(null);
  const { camera, size, invalidate } = useThree();
  const { length, width, height } = part.dimensionsMm;
  const radius = Math.max(0.18, Math.hypot(length, width, height) / MM_PER_SCENE_UNIT / 2);

  useLayoutEffect(() => {
    const orbit = controls.current;
    if (!(camera instanceof PerspectiveCamera) || !orbit || !body.current || !size.width || !size.height) return;
    const initial = frame.current === null;
    if (initial) {
      // Measure only the visible body, after its millimeter-to-scene transform.
      // Floor, contact shadows, connection markers and the HUD never affect framing.
      body.current.updateWorldMatrix(true, true);
      const bounds = new Box3().setFromObject(body.current, true);
      if (!bounds.isEmpty()) bounds.getCenter(focus.current);
      frame.current = { radius: bounds.isEmpty() ? radius : Math.max(0.18, bounds.getSize(new Vector3()).length() / 2), distance: 0 };
    }
    const framing = frame.current!;
    camera.aspect = size.width / size.height;
    const distance = framingDistance(camera, framing.radius, camera.aspect);
    orbit.minDistance = framing.radius * 1.12;
    orbit.maxDistance = Math.max(framing.radius * 12, distance * 2);
    const isCommand = appliedCommand.current !== command.sequence;
    const action = isCommand ? command.action : null;
    const offset = camera.position.clone().sub(orbit.target);
    if (initial || action === "isometric" || action === "front" || action === "top" || action === "reset") {
      const direction = action === "front" ? new Vector3(0, 0, 1) : action === "top" ? new Vector3(0.001, 1, 0.001) : new Vector3(1.15, 0.8, 1.35);
      centerCamera(camera, orbit, focus.current, direction, distance);
    } else if (action === "zoom-in" || action === "zoom-out") {
      const nextLength = Math.min(orbit.maxDistance, Math.max(orbit.minDistance, offset.length() * (action === "zoom-in" ? 0.8 : 1.25)));
      centerCamera(camera, orbit, focus.current, offset, nextLength);
    } else if (action?.startsWith("rotate")) {
      if (action === "rotate-left" || action === "rotate-right") orbit.setAzimuthalAngle(orbit.getAzimuthalAngle() + (action === "rotate-left" ? 0.18 : -0.18));
      else orbit.setPolarAngle(Math.min(Math.PI * 0.82, Math.max(0.01, orbit.getPolarAngle() + (action === "rotate-up" ? -0.15 : 0.15))));
    } else {
      // Resize preserves the user's orientation and zoom instead of replaying a command.
      const zoom = framing.distance ? offset.length() / framing.distance : 1;
      centerCamera(camera, orbit, focus.current, offset, Math.min(orbit.maxDistance, Math.max(orbit.minDistance, distance * zoom)));
    }
    framing.distance = distance;
    appliedCommand.current = command.sequence;
    camera.near = Math.max(0.001, framing.radius / 100);
    camera.far = Math.max(100, orbit.maxDistance * 4);
    camera.updateProjectionMatrix();
    invalidate();
  }, [body, camera, command.action, command.sequence, focus, invalidate, radius, size.width, size.height]);

  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping={!reducedMotion} dampingFactor={0.08} minDistance={radius * 1.12} maxDistance={radius * 12} minPolarAngle={0.001} maxPolarAngle={Math.PI * 0.82} autoRotate={autoRotate} autoRotateSpeed={0.7} rotateSpeed={0.7} zoomSpeed={0.7} onStart={onInteract} />;
}

function Scene(props: PartViewerProps) {
  const { part, wireframe, showPorts } = props;
  const body = useRef<Group>(null);
  const focus = useRef(new Vector3());
  const size = useThree((state) => state.size);
  const span = Math.max(part.dimensionsMm.length, part.dimensionsMm.width, part.dimensionsMm.height) / MM_PER_SCENE_UNIT;
  const floor = -part.dimensionsMm.height / MM_PER_SCENE_UNIT / 2 - Math.max(0.06, span * 0.07);
  const gridScale = Math.max(0.5, span);
  return <>
    <color attach="background" args={["#f0f1ed"]} />
    <ambientLight intensity={1.5} />
    <hemisphereLight args={["#ffffff", "#9fa8b9", 1.3]} />
    <directionalLight position={[4, 7, 5]} intensity={3.2} color="#fff9ec" />
    <directionalLight position={[-4, 3, -3]} intensity={1.8} color="#ccdfff" />
    <Suspense fallback={null}><PartModel part={part} wireframe={wireframe} showPorts={showPorts} bodyRef={body} /></Suspense>
    <Grid position={[0, floor - 0.005, 0]} args={[gridScale * 30, gridScale * 30]} cellSize={gridScale / 6} sectionSize={gridScale} cellColor="#cbd0c9" sectionColor="#bfc6bf" cellThickness={0.5} sectionThickness={0.7} fadeDistance={gridScale * 8} fadeStrength={2.5} infiniteGrid />
    <ContactShadows key={part.id} position={[0, floor, 0]} opacity={0.25} scale={Math.max(3, span * 5)} blur={2.6} far={Math.max(2, span * 2)} color="#34405f" resolution={256} frames={1} />
    <CameraRig {...props} body={body} focus={focus} />
    <GizmoHelper key={`${props.command.sequence}:${size.width}:${size.height}`} onTarget={() => focus.current} alignment="bottom-right" margin={[43, 49]}><GizmoViewport axisColors={["#b17d77", "#7b9b81", "#7c96b6"]} labelColor="#fff" hideNegativeAxes /></GizmoHelper>
  </>;
}

export default function PartViewer(props: PartViewerProps) {
  const { locale } = useI18n();
  const m = viewerMessages[locale];
  const [attempt, setAttempt] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let supported = false;
    try {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("webgl2");
      supported = Boolean(context);
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { supported = false; }
    setAvailable(supported);
  }, [attempt]);

  function retry() { setContextLost(false); setAvailable(null); setAttempt((value) => value + 1); }

  if (available === false || contextLost) return <ViewerFallback onRetry={retry} />;
  if (available === null) return <div className="viewer-message" role="status"><Box size={29} strokeWidth={1.4} /><strong>{m.starting}</strong></div>;

  return <ViewerErrorBoundary key={attempt} onRetry={retry}><Canvas dpr={[1, 1.75]} camera={INITIAL_CAMERA} gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }} fallback={<ViewerFallback onRetry={retry} />} onCreated={({ gl }) => { gl.domElement.addEventListener("webglcontextlost", (event) => { event.preventDefault(); setContextLost(true); }, { once: true }); }}><Scene key={props.part.id} {...props} /></Canvas></ViewerErrorBoundary>;
}
