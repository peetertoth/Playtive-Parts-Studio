import { PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";

/** Fit a sphere to the narrower camera field of view, including portrait canvases. */
export function framingDistance(camera: PerspectiveCamera, radius: number, aspect: number) {
  const verticalHalfFov = camera.getEffectiveFOV() * Math.PI / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  return radius / Math.sin(Math.min(verticalHalfFov, horizontalHalfFov)) * 1.12;
}

/** Keep the same world-space point at the optical center and the orbit pivot. */
export function centerCamera(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  center: Vector3,
  direction: Vector3,
  distance: number,
) {
  const damping = controls.enableDamping;
  const rotating = controls.autoRotate;
  controls.enableDamping = false;
  controls.autoRotate = false;
  // Consume pending drag deltas before applying a preset or resizing the canvas.
  controls.update();
  controls.target.copy(center);
  camera.up.set(0, 1, 0);
  camera.position.copy(center).addScaledVector(direction.clone().normalize(), distance);
  camera.lookAt(center);
  controls.update();
  camera.updateMatrixWorld();
  controls.enableDamping = damping;
  controls.autoRotate = rotating;
}
