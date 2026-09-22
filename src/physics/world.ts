import RAPIER from '@dimforge/rapier3d-compat';
import { CatmullRomCurve3, Quaternion, Vector3 } from 'three';

export const STEP = 1 / 120;
export const COURSE = {
  width: 104, length: 150,
  ramp: { x: -23, z: 12, width: 7, length: 28, height: 1.4 },
  curb: { x: 17, z: 6, width: 7, depth: 0.22, height: 0.075 },
  cones: [ [2.8, -18], [-2.8, -18], [2.8, -8], [-2.8, -8],
    [10, 14], [14, 22], [19, 29], [24, 35], [29, 39],
    [-10.9, -18], [-13.1, -18], [-10.9, -25], [-13.1, -25], [-10.9, -32], [-13.1, -32] ],
  route: [[0,-50],[0,-32],[0,-10],[0,12],[5,32],[18,43],[27,51],[20,60],[0,63],[-18,55],
    [-23,44],[-23,40],[-23,28],[-23,24],[-23,12],[-23,4],[-14,-7],[-12,-20],[-12,-34],[-9,-46]],
};

export const SURFACES={
  asphalt:{name:'柏油',grip:1,rolling:.004,roughness:0,sound:1,frequency:1},
  gravel:{name:'碎石',grip:.64,rolling:.021,roughness:.85,sound:1.7,frequency:1.6},
  grass:{name:'草地',grip:.76,rolling:.036,roughness:.5,sound:.75,frequency:.55},
  wet:{name:'湿路',grip:.46,rolling:.005,roughness:.03,sound:1.35,frequency:1.25},
} as const;
export type SurfaceKind=keyof typeof SURFACES;
export const SURFACE_PATCHES:{kind:SurfaceKind;x:number;z:number;width:number;length:number}[]=[
  {kind:'wet',x:0,z:1,width:5.15,length:10},
  {kind:'gravel',x:-23,z:8,width:5.5,length:7},
  {kind:'grass',x:30,z:29,width:12,length:9},
];
const surfaceMaps=new WeakMap<RAPIER.World,Map<number,SurfaceKind>>();
export function surfaceAtCollider(world:RAPIER.World,collider:RAPIER.Collider):SurfaceKind{return surfaceMaps.get(world)?.get(collider.handle)||'asphalt';}
export function routeCurve(){return new CatmullRomCurve3(COURSE.route.map(([x,z])=>new Vector3(x,0,z)),true,'centripetal');}
export function groundHeight(x:number,z:number){
  const r=COURSE.ramp;
  if(Math.abs(x-r.x)>r.width/2||z<r.z||z>r.z+r.length)return 0;
  const t=z-r.z;return t<12?.008+(r.height-.008)*t/12:t<16?r.height:r.height-(r.height-.008)*(t-16)/12;
}
export function routeWidth(x:number,z:number){
  if(x> -17&&x< -8&&z< -10&&z> -37)return 1.8+3.7*Math.min(1,Math.max(0,(-z-32)/5,(z+17)/7));
  return 5.5;
}

export interface Prop { body: RAPIER.RigidBody; kind: 'cone' }

export async function makeWorld(withCourse = true) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = STEP;
  world.numSolverIterations = 8;
  world.createCollider(RAPIER.ColliderDesc.cuboid(180, 0.5, 180).setTranslation(0, -0.5, 0).setFriction(0.85));
  const props: Prop[] = [];
  if (withCourse) {
    const surfaces=new Map<number,SurfaceKind>();surfaceMaps.set(world,surfaces);
    for(const patch of SURFACE_PATCHES){
      const collider=world.createCollider(RAPIER.ColliderDesc.cuboid(patch.width/2,.002,patch.length/2)
        .setTranslation(patch.x,.002,patch.z).setFriction(.85*SURFACES[patch.kind].grip));
      surfaces.set(collider.handle,patch.kind);
    }
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
