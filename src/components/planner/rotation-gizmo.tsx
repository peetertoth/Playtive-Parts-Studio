"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type SyntheticEvent } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { CatmullRomCurve3, Matrix4, OrthographicCamera, PerspectiveCamera, Quaternion, Vector3, type Camera, type Group, type Object3D } from "three";
import { ROTATION_AXES } from "@/domain/rotation-controls";
import type { Axis, PlacedPart, PlannerDocument } from "@/domain/planner";
import { getPartDefinition, rotatePlacedPart } from "@/lib/assembly-engine";
import { PartModel } from "@/components/3d/part-model";
import { useI18n } from "@/i18n/provider";
import { plannerErrorMessage } from "@/i18n/planner-errors";
import { sceneMessages } from "@/i18n/scene-messages";
import { orientationQuaternion, scenePosition } from "./scene-math";
import { clampRotationControlPosition, perspectiveGizmoRadius, ROTATION_PLANES, rotationArc, rotationGizmoFrame } from "./rotation-gizmo-math";

const AXES = ["x", "y", "z"] as const;
const TURNS = [1, -1] as const;
const UP = new Vector3(0, 1, 0);
const noRaycast = () => {};
function controlPosition(object: Object3D, camera: Camera, size: { width: number; height: number }) {
  const projected = new Vector3().setFromMatrixPosition(object.matrixWorld).project(camera);
  return clampRotationControlPosition((projected.x + 1) * size.width / 2, (1 - projected.y) * size.height / 2, size.width, size.height);
}
const stop = (event: SyntheticEvent) => { event.stopPropagation(); };
const stopKey = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) return;
  stop(event);
};
type Turn = { axis: Axis; quarterTurns: 1 | -1 };

function RotationArrow({ axis, quarterTurns }: Turn) {
  const { curve, tip, quaternion } = useMemo(() => {
    const arc = rotationArc(axis, quarterTurns);
    return {
      curve: new CatmullRomCurve3(arc.points.map((point) => new Vector3(...point))),
      // The cone's apex is exactly the quarter-circle endpoint.
      tip: new Vector3(...arc.tip).addScaledVector(new Vector3(...arc.tangent), -0.075),
      quaternion: new Quaternion().setFromUnitVectors(UP, new Vector3(...arc.tangent)),
    };
  }, [axis, quarterTurns]);
  const color = ROTATION_AXES[axis].color;
  return <group>
    <mesh raycast={noRaycast} renderOrder={20}>
      <tubeGeometry args={[curve, 32, 0.018, 6, false]} />
      <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
    </mesh>
    <mesh position={tip} quaternion={quaternion} raycast={noRaycast} renderOrder={21}>
      <coneGeometry args={[0.065, 0.15, 10]} />
      <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
    </mesh>
  </group>;
}

function RotationRing({ axis }: { axis: Axis }) {
  const quaternion = useMemo(() => {
    const { u, v, normal } = ROTATION_PLANES[axis];
    return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(...u), new Vector3(...v), new Vector3(...normal)));
  }, [axis]);
  return <mesh quaternion={quaternion} raycast={noRaycast} renderOrder={19}>
    <torusGeometry args={[1, 0.008, 5, 80]} />
    <meshBasicMaterial color={ROTATION_AXES[axis].color} depthTest={false} depthWrite={false} transparent opacity={0.45} />
  </mesh>;
}

export function RotationGizmo({ document, part, onRotate }: {
  document: PlannerDocument;
  part: PlacedPart;
  onRotate: (axis: Axis, quarterTurns: number) => void;
}) {
  const { camera, size } = useThree();
  const { locale } = useI18n();
  const t = sceneMessages[locale];
  const ring = useRef<Group>(null);
  const [active, setActive] = useState<Turn | null>(null);
  const frame = useMemo(() => rotationGizmoFrame(part), [part]);
  const pivot = useMemo(() => new Vector3(...scenePosition(frame.pivotMm)), [frame]);
  const cameraPosition = useMemo(() => new Vector3(), []);
  const radius = () => {
    if (camera instanceof PerspectiveCamera) {
      camera.getWorldPosition(cameraPosition);
      return perspectiveGizmoRadius(frame.radius, cameraPosition.distanceTo(pivot), camera.fov, size.height, camera.zoom);
    }
    if (camera instanceof OrthographicCamera) return Math.max(frame.radius, (camera.top - camera.bottom) / camera.zoom / Math.max(1, size.height) * 104);
    return frame.radius;
  };
  // Ring graphics follow zoom without changing the camera or planner document.
  useFrame(() => { ring.current?.scale.setScalar(radius()); });
  const result = useMemo(() => active ? rotatePlacedPart(document, part.id, active.axis, active.quarterTurns).result : null,
    [active, document, part.id]);
  const previewDefinition = useMemo(() => result ? { ...getPartDefinition(part.partId), color: result.valid ? "#138966" : "#d43b43" } : null, [part.partId, result]);

  return <>
    {result && previewDefinition && <group position={scenePosition(result.part.positionMm)} quaternion={orientationQuaternion(result.part.orientation)} raycast={noRaycast}>
      <PartModel part={previewDefinition} wireframe />
    </group>}
    <group position={pivot}>
      <group ref={ring} scale={radius()}>
        {AXES.map((axis) => <RotationRing key={axis} axis={axis} />)}
        {AXES.flatMap((axis) => TURNS.map((quarterTurns) => {
          const { tip } = rotationArc(axis, quarterTurns);
          const color = ROTATION_AXES[axis].color;
          const label = `${ROTATION_AXES[axis].label} ${quarterTurns > 0 ? "+" : "−"}90°`;
          const current = active?.axis === axis && active.quarterTurns === quarterTurns;
          const blocked = current && result && !result.valid;
          return <group key={`${axis}:${quarterTurns}`}>
            <RotationArrow axis={axis} quarterTurns={quarterTurns} />
            <Html center position={tip.map((value) => value * 1.3) as [number, number, number]} calculatePosition={controlPosition} zIndexRange={[32, 20]} style={{ pointerEvents: "none" }}>
              <button type="button" data-rotation-control="true" aria-label={t.rotationAria(ROTATION_AXES[axis].label, quarterTurns > 0 ? "+" : "−")}
                title={blocked ? plannerErrorMessage(result, locale) : t.rotationTitle(label)}
                onPointerDown={stop} onPointerUp={stop} onPointerCancel={(event) => { stop(event); setActive(null); }} onDoubleClick={stop} onContextMenu={(event) => { event.preventDefault(); stop(event); }}
                onKeyDown={stopKey} onKeyUp={stopKey}
                onPointerEnter={() => setActive({ axis, quarterTurns })} onPointerLeave={() => setActive(null)}
                onFocus={() => setActive({ axis, quarterTurns })} onBlur={() => setActive(null)}
                onClick={(event) => { stop(event); setActive(null); onRotate(axis, quarterTurns); }}
                style={{ pointerEvents: "auto", touchAction: "manipulation", cursor: "pointer", width: 56, minWidth: 56, height: 44, minHeight: 44,
                  display: "grid", placeContent: "center", gap: 1, padding: "3px 4px", border: `2px solid ${color}`, borderRadius: 12,
                  color, background: current ? "#f1f5ef" : "#fffffff2", boxShadow: "0 2px 8px #172d352b", font: "700 12px/1.1 system-ui, sans-serif", outlineOffset: 3 }}>
                <span aria-hidden="true" style={{ fontSize: 11 }}>{ROTATION_AXES[axis].label}</span>
                <span aria-hidden="true">{quarterTurns > 0 ? "+" : "−"}90°</span>
              </button>
              {current && result && <span role="status" style={{ position: "absolute", top: 50, left: "50%", transform: "translateX(-50%)", width: 180,
                padding: "5px 7px", borderRadius: 6, color: result.valid ? "#0c654c" : "#a8212b", background: "#fffffff5", font: "600 11px/1.35 system-ui, sans-serif", textAlign: "center", pointerEvents: "none" }}>
                {result.valid ? t.rotationPreview(label) : plannerErrorMessage(result, locale)}
              </span>}
            </Html>
          </group>;
        }))}
      </group>
    </group>
  </>;
}
