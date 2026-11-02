"use client";

import { useEffect, useMemo, type Ref } from "react";
import {
  BufferGeometry,
  CatmullRomCurve3,
  CurvePath,
  DoubleSide,
  Float32BufferAttribute,
  LineCurve3,
  Path,
  QuadraticBezierCurve3,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
  type Group,
} from "three";
import { MM_PER_SCENE_UNIT, type PartDefinition, type Vec3 } from "@/domain/parts";

interface PartModelProps {
  part: PartDefinition;
  wireframe?: boolean;
  showPorts?: boolean;
  /** Visible geometry only; excludes optional connection markers when framing the camera. */
  bodyRef?: Ref<Group>;
}

interface SurfaceProps {
  color: string;
  wireframe: boolean;
}

const UP = new Vector3(0, 1, 0);
const SOCKET_REACH = 75;
const SLEEVE_LENGTH = 59;

function Plastic({ color, wireframe }: SurfaceProps) {
  return <meshStandardMaterial color={color} roughness={0.36} metalness={0.035} wireframe={wireframe} />;
}

function useOwnedGeometry(factory: () => BufferGeometry, dependencies: readonly unknown[]) {
  // The primitive's lifetime follows the mesh, including selection changes in the viewer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(factory, dependencies);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

/** A thick cylindrical wall, including real side holes and the walls inside each hole. */
function hollowTubeGeometry(length: number, outer: number, inner: number, holeYs: readonly number[], holeRadius: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
  };
  const quad = (points: readonly Vector3[], normal: (p: Vector3) => Vector3, reverse = false) => {
    for (const index of reverse ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
      const p = points[index];
      const n = normal(p);
      vertex(p.x, p.y, p.z, n.x, n.y, n.z);
    }
  };

  for (const radius of [outer, inner]) {
    const inward = radius === inner;
    const angles = Array.from({ length: 129 }, (_, index) => (index / 128) * Math.PI * 2);
    if (holeYs.length) {
      const a = Math.asin(holeRadius / radius);
      angles.push(a, Math.PI - a, Math.PI + a, Math.PI * 2 - a);
    }
    angles.sort((a, b) => a - b);
    const levels = (angle: number) => {
      const x = radius * Math.sin(angle);
      const gap = holeYs.length ? Math.sqrt(Math.max(0, holeRadius ** 2 - x ** 2)) : 0;
      return [-length / 2, ...holeYs.flatMap((y) => [y - gap, y + gap]), length / 2];
    };
    for (let index = 0; index < angles.length - 1; index++) {
      const a = angles[index];
      const b = angles[index + 1];
      const ay = levels(a);
      const by = levels(b);
      for (let band = 0; band < ay.length - 1; band += 2) {
        quad([
          new Vector3(radius * Math.sin(a), ay[band], radius * Math.cos(a)),
          new Vector3(radius * Math.sin(b), by[band], radius * Math.cos(b)),
          new Vector3(radius * Math.sin(b), by[band + 1], radius * Math.cos(b)),
          new Vector3(radius * Math.sin(a), ay[band + 1], radius * Math.cos(a)),
        ], (p) => new Vector3(p.x, 0, p.z).normalize().multiplyScalar(inward ? -1 : 1), inward);
      }
    }
  }

  for (const sign of [-1, 1]) {
    const y = (length / 2) * sign;
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      const b = ((i + 1) / 128) * Math.PI * 2;
      quad([
        new Vector3(outer * Math.sin(a), y, outer * Math.cos(a)),
        new Vector3(inner * Math.sin(a), y, inner * Math.cos(a)),
        new Vector3(inner * Math.sin(b), y, inner * Math.cos(b)),
        new Vector3(outer * Math.sin(b), y, outer * Math.cos(b)),
      ], () => new Vector3(0, sign, 0), sign > 0);
    }
  }

  for (const y of holeYs) for (const sign of [-1, 1]) {
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const b = ((i + 1) / 64) * Math.PI * 2;
      const p = (angle: number, radius: number) => {
        const x = holeRadius * Math.cos(angle);
        return new Vector3(x, y + holeRadius * Math.sin(angle), sign * Math.sqrt(radius ** 2 - x ** 2));
      };
      quad([p(a, outer), p(b, outer), p(b, inner), p(a, inner)],
        (point) => new Vector3(-point.x, y - point.y, 0).normalize(), sign < 0);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function HollowTube({ length, outer, inner, holes, holeRadius = 5.4, ...surface }: SurfaceProps & {
  length: number; outer: number; inner: number; holes: readonly number[]; holeRadius?: number;
}) {
  const holeKey = holes.join(",");
  const geometry = useOwnedGeometry(
    () => hollowTubeGeometry(length, outer, inner, holes, holeRadius),
    [length, outer, inner, holeKey, holeRadius],
  );
  return <mesh geometry={geometry} castShadow receiveShadow><Plastic {...surface} /></mesh>;
}

/** The cut caps are concealed inside the overlapping socket sleeves. */
function hubGeometry(directions: readonly Vec3[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  const point = (u: number, v: number, r: number) => new Vector3(
    r * Math.sin(v) * Math.cos(u), r * Math.cos(v), r * Math.sin(v) * Math.sin(u),
  );
  for (const radius of [34, 27]) {
    const inner = radius === 27;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 80; x++) {
      const p = [point(x / 80 * Math.PI * 2, y / 40 * Math.PI, radius),
        point((x + 1) / 80 * Math.PI * 2, y / 40 * Math.PI, radius),
        point((x + 1) / 80 * Math.PI * 2, (y + 1) / 40 * Math.PI, radius),
        point(x / 80 * Math.PI * 2, (y + 1) / 40 * Math.PI, radius)];
      const center = p.reduce((a, b) => a.add(b), new Vector3()).normalize();
      if (directions.some((d) => center.dot(new Vector3(...d)) > (inner ? 0.36 : 0.54))) continue;
      for (const i of inner ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) {
        const n = p[i].clone().normalize().multiplyScalar(inner ? -1 : 1);
        positions.push(...p[i].toArray()); normals.push(...n.toArray());
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  return geometry;
}

function LockRim({ y, sign, ...surface }: SurfaceProps & { y: number; sign: number }) {
  const curve = useMemo(() => {
    const points = Array.from({ length: 65 }, (_, i) => {
      const a = i / 64 * Math.PI * 2;
      const r = 6.4 + 0.65 * Math.cos(a * 4);
      const x = r * Math.cos(a);
      return new Vector3(x, y + r * Math.sin(a), sign * (Math.sqrt(30 ** 2 - x ** 2) + 0.18));
    });
    return new CatmullRomCurve3(points, true);
  }, [y, sign]);
  return <mesh castShadow><tubeGeometry args={[curve, 64, 0.55, 5, true]} /><Plastic {...surface} /></mesh>;
}

function Connector({ part, wireframe }: { part: PartDefinition; wireframe: boolean }) {
  const first = part.ports[0];
  const center = new Vector3(...first.positionMm).addScaledVector(new Vector3(...first.direction), -SOCKET_REACH);
  const directions = part.ports.map((port) => port.direction);
  const directionKey = directions.flat().join(",");
  const hub = useOwnedGeometry(() => hubGeometry(directions), [directionKey]);
  const surface = { color: part.color, wireframe };
  return <group position={center}>
    <mesh geometry={hub} castShadow receiveShadow>
      <meshStandardMaterial color={part.color} roughness={0.36} metalness={0.035} wireframe={wireframe} side={DoubleSide} />
    </mesh>
    {part.ports.map((port) => <group key={port.id} quaternion={new Quaternion().setFromUnitVectors(UP, new Vector3(...port.direction))}>
      <group position={[0, SOCKET_REACH - SLEEVE_LENGTH / 2, 0]}>
        <HollowTube length={SLEEVE_LENGTH} outer={30} inner={25.6} holes={[8]} {...surface} />
        <LockRim y={8} sign={1} {...surface} /><LockRim y={8} sign={-1} {...surface} />
      </group>
      <mesh position={[0, 72.85, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[27.8, 2.15, 8, 64]} /><Plastic {...surface} />
      </mesh>
      <mesh position={[0, 25, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[30, 0.65, 6, 64]} /><Plastic {...surface} />
      </mesh>
    </group>)}
  </group>;
}

function screwHead() {
  const shape = new Shape();
  shape.absarc(0, 0, 13, 0, Math.PI * 2, false);
  const recess = new Path();
  for (let i = 0; i <= 96; i++) {
    const a = i / 96 * Math.PI * 2;
    const r = 5 + 1.1 * Math.cos(3 * a);
    if (i === 0) recess.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else recess.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.holes.push(recess);
  return shape;
}

function Screw(surface: SurfaceProps) {
  const head = useMemo(screwHead, []);
  const thread = useMemo(() => new CatmullRomCurve3(Array.from({ length: 181 }, (_, i) => {
    const t = i / 180;
    return new Vector3(Math.cos(t * Math.PI * 10) * 5.9, -12 + t * 19, Math.sin(t * Math.PI * 10) * 5.9);
  })), []);
  return <group position={[0, -0.5, 0]}>
    <mesh position={[0, -3, 0]} castShadow><cylinderGeometry args={[5.5, 5.2, 24, 32]} /><Plastic {...surface} /></mesh>
    <mesh position={[0, -15, 0]} castShadow><cylinderGeometry args={[5.2, 3.8, 2, 32]} /><Plastic {...surface} /></mesh>
    <mesh castShadow><tubeGeometry args={[thread, 180, 0.9, 6, false]} /><Plastic {...surface} /></mesh>
    <mesh position={[0, 9.5, 0]} castShadow><cylinderGeometry args={[12.5, 11.8, 5, 64]} /><Plastic {...surface} /></mesh>
    <mesh position={[0, 11.5, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
      <extrudeGeometry args={[head, { depth: 3, bevelEnabled: true, bevelSize: 0.55, bevelThickness: 0.55, bevelSegments: 2, steps: 1, curveSegments: 48 }]} />
      <Plastic {...surface} />
    </mesh>
  </group>;
}

function wrenchShape() {
  const shape = new Shape();
  shape.moveTo(-59, 20); shape.quadraticCurveTo(-63, 27, -55, 35);
  shape.lineTo(-23, 35); shape.quadraticCurveTo(-12, 37, -11, 49);
  shape.lineTo(-11, 75); shape.lineTo(12, 75); shape.lineTo(15, 60);
  shape.lineTo(15, -65); shape.quadraticCurveTo(15, -82, -1, -82);
  shape.quadraticCurveTo(-18, -82, -18, -65); shape.lineTo(-18, 15);
  shape.lineTo(-54, 15); shape.closePath();
  const handle = new Path();
  handle.moveTo(-8, 6); handle.lineTo(5, 6); handle.lineTo(5, -64);
  handle.quadraticCurveTo(5, -72, -1.5, -72); handle.quadraticCurveTo(-8, -72, -8, -64); handle.closePath();
  shape.holes.push(handle);
  const hole = new Path(); hole.absarc(-33, 25, 3.5, 0, Math.PI * 2, true); shape.holes.push(hole);
  return shape;
}

function Wrench(surface: SurfaceProps) {
  const shape = useMemo(wrenchShape, []);
  const hexSocket = useMemo(() => [new Vector2(8, -4), new Vector2(8, 4), new Vector2(5.4, 4), new Vector2(5.4, -2)], []);
  return <group position={[23, -2, 0]}>
    <mesh position={[0, 0, -4.5]} castShadow receiveShadow>
      <extrudeGeometry args={[shape, { depth: 9, bevelEnabled: true, bevelSize: 1.4, bevelThickness: 1.4, bevelSegments: 3, curveSegments: 20 }]} />
      <Plastic {...surface} />
    </mesh>
    <mesh position={[0.5, 79, 0]} castShadow><latheGeometry args={[hexSocket, 6]} /><Plastic {...surface} /></mesh>
    <mesh position={[-55, 25, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[6, 6, 10, 6]} /><Plastic {...surface} />
    </mesh>
  </group>;
}

function Anchor({ color, wireframe }: SurfaceProps) {
  const curve = useMemo(() => {
    const path = new CurvePath<Vector3>();
    path.add(new LineCurve3(new Vector3(-26, 30, 0), new Vector3(-26, 94, 0)));
    path.add(new QuadraticBezierCurve3(new Vector3(-26, 94, 0), new Vector3(-26, 120, 0), new Vector3(0, 120, 0)));
    path.add(new QuadraticBezierCurve3(new Vector3(0, 120, 0), new Vector3(26, 120, 0), new Vector3(26, 94, 0)));
    path.add(new LineCurve3(new Vector3(26, 94, 0), new Vector3(26, -120, 0)));
    return path;
  }, []);
  return <group position={[0, 3, 0]}>
    <mesh castShadow receiveShadow><tubeGeometry args={[curve, 100, 4, 12, false]} />
      <meshStandardMaterial color={color} roughness={0.3} metalness={0.8} wireframe={wireframe} />
    </mesh>
    {[[26, -125, 0], [-26, 25, 0]].map((position, index) => <mesh key={index} position={position as [number, number, number]} rotation={[0, 0, Math.PI]} castShadow>
      <coneGeometry args={[4, 10, 12]} /><meshStandardMaterial color={color} roughness={0.3} metalness={0.8} wireframe={wireframe} />
    </mesh>)}
  </group>;
}

function PortMarkers({ part }: { part: PartDefinition }) {
  return <group>{part.ports.map((port) => <group key={port.id} position={[...port.positionMm]} quaternion={new Quaternion().setFromUnitVectors(UP, new Vector3(...port.direction))}>
    <mesh position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={4}>
      <torusGeometry args={[part.kind === "tube" ? 27.5 : 32.5, 1.1, 6, 48]} />
      <meshBasicMaterial color="#4af1d5" transparent opacity={0.9} depthTest={false} />
    </mesh>
    <mesh position={[0, 1.5, 0]} renderOrder={4}><sphereGeometry args={[3, 12, 8]} />
      <meshBasicMaterial color="#4af1d5" depthTest={false} />
    </mesh>
    <mesh position={[0, 12, 0]} renderOrder={4}><cylinderGeometry args={[0.9, 0.9, 22, 8]} />
      <meshBasicMaterial color="#4af1d5" depthTest={false} />
    </mesh>
    <mesh position={[0, 26, 0]} renderOrder={4}><coneGeometry args={[3.8, 9, 10]} />
      <meshBasicMaterial color="#4af1d5" depthTest={false} />
    </mesh>
  </group>)}</group>;
}

/** Millimeter-based, centered, Y-up part geometry; no camera or Canvas is created here. */
export function PartModel({ part, wireframe = false, showPorts = false, bodyRef }: PartModelProps) {
  const surface = { color: part.color, wireframe };
  let body;
  switch (part.kind) {
    case "tube":
      body = <HollowTube length={part.dimensionsMm.height} outer={part.dimensionsMm.width / 2} inner={part.dimensionsMm.width / 2 - 3.2} holes={[-part.dimensionsMm.height / 2 + 42, part.dimensionsMm.height / 2 - 42]} holeRadius={7.5} {...surface} />;
      break;
    case "screw": body = <Screw {...surface} />; break;
    case "wrench": body = <Wrench {...surface} />; break;
    case "anchor": body = <Anchor {...surface} />; break;
    default: body = <Connector part={part} wireframe={wireframe} />;
  }
  return <group scale={1 / MM_PER_SCENE_UNIT}>
    <group ref={bodyRef}>{body}</group>
    {showPorts && <PortMarkers part={part} />}
  </group>;
}
