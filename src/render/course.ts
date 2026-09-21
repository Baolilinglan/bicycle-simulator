import * as THREE from 'three';
import { COURSE, rampGeometry, type Prop, vec, quat } from '../physics/world';
import { mesh, rod } from './bicycle-view';

const material=(c:string)=>new THREE.MeshStandardMaterial({color:c,roughness:.95});
export class CourseView {
  props:THREE.Object3D[]=[];
  constructor(scene:THREE.Scene,physicsProps:Prop[]) {
    const ground=material('#a9b29a'),asphalt=material('#858982'),paint=material('#e8e5d6'),concrete=material('#b7b6a7');
    const base=mesh(new THREE.PlaneGeometry(360,360),ground,scene);base.rotation.x=-Math.PI/2;base.receiveShadow=true;base.castShadow=false;
    const pad=mesh(new THREE.BoxGeometry(100,.035,145),concrete,scene);pad.position.set(0,-.013,5);pad.castShadow=false;
    this.road(scene,[[-0,-52],[0,-30],[0,-6],[.4,12],[4,27],[15,41],[31,47],[40,39],[36,27],[22,22],[10,28]],5.5,asphalt);
    this.road(scene,[[-12,-6],[-12,8],[-12,30]],1.5,asphalt);
    // A wide area to practice complete turns without any timed route or checkpoints.
    const turning=mesh(new THREE.CircleGeometry(14,64),asphalt,scene);turning.rotation.x=-Math.PI/2;turning.position.set(25,.009,35);turning.castShadow=false;
    const ring=mesh(new THREE.RingGeometry(12.85,12.91,72),paint,scene);ring.rotation.x=-Math.PI/2;ring.position.set(25,.012,35);ring.castShadow=false;
    for(let z=-46;z<12;z+=6){const dash=mesh(new THREE.BoxGeometry(.09,.005,2),paint,scene);dash.position.set(0,.022,z);dash.castShadow=false;}
    for(const x of [-2.48,2.48]){const line=mesh(new THREE.BoxGeometry(.065,.004,60),paint,scene);line.position.set(x,.020,-19);line.castShadow=false;}
    for(const x of [-12.66,-11.34]){const line=mesh(new THREE.BoxGeometry(.06,.004,36),paint,scene);line.position.set(x,.020,12);line.castShadow=false;}
    const start=mesh(new THREE.BoxGeometry(4.9,.004,.10),paint,scene);start.position.set(0,.023,-29);start.castShadow=false;
    const ramp=rampGeometry(),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(ramp.vertices,3));g.setIndex(new THREE.BufferAttribute(ramp.indices,1));g.computeVertexNormals();
    mesh(g,asphalt,scene).castShadow=false;
    // Sloped edge strips share the actual incline, so the grade can be read from ground level.
    for(const x of [COURSE.ramp.x-3.18,COURSE.ramp.x+3.18]) {
      for(const [za,ya,zb,yb] of [[12,.015,24,1.412],[24,1.412,28,1.412],[28,1.412,40,.015]])
        rod(scene,new THREE.Vector3(x,ya,za),new THREE.Vector3(x,yb,zb),.023,paint).castShadow=false;
    }
    const c=COURSE.curb;
    const curb=mesh(new THREE.BoxGeometry(c.width,c.height,c.depth),material('#d4d0bd'),scene);curb.position.set(c.x,c.height/2,c.z);
    for(const prop of physicsProps) {
      const group=new THREE.Group();scene.add(group);this.props.push(group);
      const base=mesh(new THREE.BoxGeometry(.38,.05,.38),material('#575952'),group);base.position.y=-.205;
      mesh(new THREE.ConeGeometry(.15,.42,12),material('#bb7047'),group);
      const stripe=mesh(new THREE.CylinderGeometry(.065,.095,.085,12),paint,group);stripe.position.y=.015;
      group.position.copy(vec(prop.body.translation()));
    }
    // Ordinary perimeter, distant trees and a small shelter keep the practice area legible.
    const hedge=material('#747f67'),trunk=material('#7b715b'),leaves=material('#89957a'),rail=material('#a5a79a');
    for(const x of [-55,55]){
      const edging=mesh(new THREE.BoxGeometry(.6,.56,156),concrete,scene);edging.position.set(x,.28,5);
      for(let z=-65;z<82;z+=8){const post=mesh(new THREE.BoxGeometry(.09,1,.09),rail,scene);post.position.set(x,.9,z);}
      rod(scene,new THREE.Vector3(x,1.25,-69),new THREE.Vector3(x,1.25,80),.036,rail);
    }
    for(const z of [-73,83]){const edge=mesh(new THREE.BoxGeometry(110,.56,.6),concrete,scene);edge.position.set(0,.28,z);}
    for(let i=0;i<34;i++){
      const side=i%2?1:-1,x=side*(61+(i%3)*3),z=-68+Math.floor(i/2)*9.8;
      const h=3.2+(i%5)*.4;
      const tree=new THREE.Group();tree.position.set(x,0,z);scene.add(tree);
      const stem=mesh(new THREE.CylinderGeometry(.13,.20,h,7),trunk,tree);stem.position.y=h/2;
      const crown=mesh(new THREE.IcosahedronGeometry(1.8+(i%3)*.22,1),i%3?leaves:hedge,tree);crown.position.y=h;crown.scale.set(1,1.2,1);
    }
    for(let i=0;i<11;i++){
      const crown=mesh(new THREE.IcosahedronGeometry(5+i%3,1),leaves,scene);crown.position.set(-66+i*13,3.8,96+(i%2)*7);crown.scale.set(1.5,.65,1);
    }
    const shelter=new THREE.Group();shelter.position.set(39,0,-36);scene.add(shelter);
    for(const x of [-3,3])for(const z of [-1.8,1.8]){const p=mesh(new THREE.BoxGeometry(.12,2.8,.12),rail,shelter);p.position.set(x,1.4,z);}
    const roof=mesh(new THREE.BoxGeometry(7,.14,4.6),material('#90998b'),shelter);roof.position.y=2.85;
    const bench=mesh(new THREE.BoxGeometry(4,.12,.52),material('#8e8069'),shelter);bench.position.set(0,.55,1.25);
    for(const x of [-1.7,1.7]){const leg=mesh(new THREE.BoxGeometry(.12,.5,.4),rail,shelter);leg.position.set(x,.25,1.25);}
  }
  private road(scene:THREE.Scene,points:number[][],width:number,material:THREE.Material){
    const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>new THREE.Vector3(x,.014,z)));
    const vertices:number[]=[],indices:number[]=[];
    for(let i=0;i<=180;i++){
      const p=curve.getPoint(i/180),t=curve.getTangent(i/180),side=new THREE.Vector3(t.z,0,-t.x).normalize().multiplyScalar(width/2);
      for(const s of [-1,1])vertices.push(p.x+side.x*s,p.y,p.z+side.z*s);
      if(i<180){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();
    mesh(g,material,scene).castShadow=false;
  }
  update(props:Prop[]){props.forEach((p,i)=>{this.props[i].position.copy(vec(p.body.translation()));this.props[i].quaternion.copy(quat(p.body.rotation()));});}
}
