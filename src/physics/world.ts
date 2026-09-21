import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';

export const STEP = 1 / 120;
export const COURSE = {
  width: 104, length: 150,
  ramp: { x: -23, z: 12, width: 7, length: 28, height: 1.4 },
  curb: { x: 17, z: 6, width: 7, depth: 0.22, height: 0.075 },
  cones: [ [2.8, -18], [-2.8, -18], [2.8, -8], [-2.8, -8],
    [10, 14], [14, 22], [19, 29], [24, 35], [29, 39],
    [-11.2, 6], [-12.8, 6], [-11.2, 16], [-12.8, 16], [-11.2, 26], [-12.8, 26] ],
};

export interface Prop { body: RAPIER.RigidBody; kind: 'cone' }

export async function makeWorld(withCourse = true) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  world.numSolverIterations = 8;
  world.createCollider(RAPIER.ColliderDesc.cuboid(180, 0.5, 180).setTranslation(0, -0.5, 0).setFriction(0.85));
  const props: Prop[] = [];
  if (withCourse) {
    // The rendering and collider use exactly the same vertices.
    const r = rampGeometry();
    world.createCollider(RAPIER.ColliderDesc.trimesh(r.vertices, r.indices).setFriction(0.95));
    const c = COURSE.curb;
    world.createCollider(RAPIER.ColliderDesc.cuboid(c.width / 2, c.height / 2, c.depth / 2)
      .setTranslation(c.x, c.height / 2, c.z).setFriction(0.8));
    for (const [x, z] of COURSE.cones) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 0.23, z).setCanSleep(true));
      world.createCollider(RAPIER.ColliderDesc.cone(0.21, 0.15).setMass(0.65).setFriction(0.75), body);
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.19, 0.025, 0.19).setTranslation(0, -0.205, 0).setMass(0.35), body);
      props.push({ body, kind: 'cone' });
    }
    for (const x of [-55, 55]) world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 0.28, 78).setTranslation(x, 0.28, 5));
    for (const z of [-73, 83]) world.createCollider(RAPIER.ColliderDesc.cuboid(55, 0.28, 0.3).setTranslation(0, 0.28, z));
  }
  return { world, props };
}

export function rampGeometry() {
  const r = COURSE.ramp, w = r.width / 2;
  const vertices = new Float32Array([
    r.x - w, 0.008, r.z, r.x + w, 0.008, r.z,
    r.x - w, r.height, r.z + 12, r.x + w, r.height, r.z + 12,
    r.x - w, r.height, r.z + 16, r.x + w, r.height, r.z + 16,
    r.x - w, 0.008, r.z + 28, r.x + w, 0.008, r.z + 28,
  ]);
  const indices = new Uint32Array([0,2,1, 1,2,3, 2,4,3, 3,4,5, 4,6,5, 5,6,7]);
  return { vertices, indices };
}

export const vec = (v: {x:number;y:number;z:number}) => new Vector3(v.x,v.y,v.z);
export const quat = (q: {x:number;y:number;z:number;w:number}) => new Quaternion(q.x,q.y,q.z,q.w);
export const clamp = (v:number, a:number, b:number) => Math.max(a,Math.min(b,v));
