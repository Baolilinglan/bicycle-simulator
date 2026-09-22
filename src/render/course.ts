import * as THREE from 'three';
import { COURSE, rampGeometry, routeCurve, routeWidth, groundHeight, SURFACE_PATCHES, type Prop, vec, quat } from '../physics/world';
import { mesh, rod } from './bicycle-view';

const material=(c:string)=>new THREE.MeshStandardMaterial({color:c,roughness:.95});
export class CourseView {
  props:THREE.Object3D[]=[];
  constructor(scene:THREE.Scene,physicsProps:Prop[]) {
    const ground=material('#a9b29a'),asphalt=material('#858982'),paint=material('#e8e5d6'),concrete=material('#b7b6a7');
    asphalt.polygonOffset=true;asphalt.polygonOffsetFactor=-1;asphalt.polygonOffsetUnits=-4;
    paint.polygonOffset=true;paint.polygonOffsetFactor=-2;paint.polygonOffsetUnits=-6;
    const base=mesh(new THREE.PlaneGeometry(360,360),ground,scene);base.rotation.x=-Math.PI/2;base.receiveShadow=true;base.castShadow=false;
    const pad=mesh(new THREE.BoxGeometry(100,.035,145),concrete,scene);pad.position.set(0,-.013,5);pad.castShadow=false;
    this.practiceLoop(scene,asphalt,paint);
    this.road(scene,[[10,38],[18,35],[25,35]],4,asphalt);
    // A wide area to practice complete turns without any timed route or checkpoints.
    const turning=mesh(new THREE.CircleGeometry(14,64),asphalt,scene);turning.rotation.x=-Math.PI/2;turning.position.set(25,.009,35);turning.castShadow=false;
    const ring=mesh(new THREE.RingGeometry(12.85,12.91,72),paint,scene);ring.rotation.x=-Math.PI/2;ring.position.set(25,.012,35);ring.castShadow=false;
    for(let z=-46;z<12;z+=6){const dash=mesh(new THREE.BoxGeometry(.09,.005,2),paint,scene);dash.position.set(0,.022,z);dash.castShadow=false;}
    for(const x of [-2.48,2.48]){const line=mesh(new THREE.BoxGeometry(.065,.004,60),paint,scene);line.position.set(x,.020,-19);line.castShadow=false;}
    // The narrow return road is part of the continuous loop.
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
    this.surfacePatches(scene);
    this.parkingAndEight(scene,asphalt,paint);
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
  private practiceLoop(scene:THREE.Scene,asphalt:THREE.Material,paint:THREE.Material){
    const curve=routeCurve(),vertices:number[]=[],indices:number[]=[],left:THREE.Vector3[]=[],right:THREE.Vector3[]=[];
    const count=720;
    for(let i=0;i<=count;i++){
      const p=curve.getPoint(i/count),t=curve.getTangent(i/count),side=new THREE.Vector3(t.z,0,-t.x).normalize();
      const width=routeWidth(p.x,p.z);
      for(const sign of [-1,1]){
        const x=p.x+side.x*width*.5*sign,z=p.z+side.z*width*.5*sign,y=groundHeight(x,z)+.023;
        vertices.push(x,y,z);(sign===-1?left:right).push(new THREE.Vector3(x,y+.008,z));
      }
      if(i<count){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();mesh(g,asphalt,scene).castShadow=false;
    for(const points of [left,right]){
      const path=new THREE.CatmullRomCurve3(points);
      mesh(new THREE.TubeGeometry(path,count,.024,4,false),paint,scene).castShadow=false;
    }
    // Small painted chevrons show the loop direction without text, timers or checkpoints.
    for(let i=0;i<16;i++){
      const t=(i+.35)/16,p=curve.getPointAt(t),dir=curve.getTangentAt(t);p.y=groundHeight(p.x,p.z)+.05;
      const side=new THREE.Vector3(dir.z,0,-dir.x).normalize(),tip=p.clone().addScaledVector(dir,.5);
      for(const sign of [-1,1])rod(scene,p.clone().addScaledVector(side,sign*.30).addScaledVector(dir,-.2),tip,.027,paint).castShadow=false;
    }
  }
  private surfacePatches(scene:THREE.Scene){
    const stone=material('#b9ad94'),grass=material('#859570');
    for(const patch of SURFACE_PATCHES){
      const wet=patch.kind==='wet';
      const mat=new THREE.MeshStandardMaterial({color:wet?'#596b69':patch.kind==='grass'?'#788966':'#a69b86',roughness:wet?.19:.98,metalness:wet?.22:0});
      const area=mesh(new THREE.PlaneGeometry(patch.width,patch.length),mat,scene);area.rotation.x=-Math.PI/2;area.position.set(patch.x,.036,patch.z);area.castShadow=false;
      if(wet){
        for(let i=0;i<9;i++){
          const puddle=mesh(new THREE.CircleGeometry(1,24),new THREE.MeshStandardMaterial({color:'#79908c',roughness:.08,metalness:.32,transparent:true,opacity:.55}),scene);
          puddle.rotation.x=-Math.PI/2;puddle.scale.set(.25+(i%3)*.22,.35+(i%4)*.3,1);
          puddle.position.set(patch.x+Math.sin(i*3.3)*1.5,.038,patch.z+Math.sin(i*1.7)*3.8);puddle.castShadow=false;
        }
      }else{
        const count=patch.kind==='grass'?650:850;
        const shape=patch.kind==='grass'?new THREE.ConeGeometry(.012,.11,3):new THREE.IcosahedronGeometry(.027,0);
        const bits=new THREE.InstancedMesh(shape,patch.kind==='grass'?grass:stone,count),o=new THREE.Object3D();
        bits.receiveShadow=true;
        for(let i=0;i<count;i++){
          const a=(Math.sin(i*127.1+31.7)*43758.5453)%1,b=(Math.sin(i*269.5+19.1)*19642.349)%1;
          o.position.set(patch.x+a*patch.width*.48,.042,patch.z+b*patch.length*.48);
          o.rotation.set(0,i*2.1,patch.kind==='grass'?Math.sin(i)*.3:0);o.scale.setScalar(.55+(i%7)*.13);
          if(patch.kind==='gravel')o.scale.y*=.45;
          o.updateMatrix();bits.setMatrixAt(i,o.matrix);
        }
        scene.add(bits);
      }
    }
  }
  private parkingAndEight(scene:THREE.Scene,asphalt:THREE.Material,paint:THREE.Material){
    const pad=mesh(new THREE.BoxGeometry(9,.008,7),asphalt,scene);pad.position.set(-7,.025,-43);pad.castShadow=false;
    for(let i=0;i<4;i++){
      const x=-9.5+i*1.65;
      for(const side of [-.65,.65])rod(scene,new THREE.Vector3(x+side,.037,-45),new THREE.Vector3(x+side,.037,-42.3),.025,paint).castShadow=false;
      rod(scene,new THREE.Vector3(x-.65,.037,-45),new THREE.Vector3(x+.65,.037,-45),.025,paint).castShadow=false;
    }
    const points=[];
    for(let i=0;i<=160;i++){const t=i/160*Math.PI*2;points.push(new THREE.Vector3(25+9*Math.sin(t),.05,35+12*Math.sin(t)*Math.cos(t)));}
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),200,.025,4,false),paint,scene).castShadow=false;
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
