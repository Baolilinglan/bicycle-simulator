import * as THREE from 'three';
import { Bicycle } from '../physics/bicycle';
import { BicycleView } from './bicycle-view';
import { CourseView } from './course';
import { type Prop, quat, vec } from '../physics/world';

export class View {
  renderer:THREE.WebGLRenderer;
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(68,1,.035,260);
  bicycle:BicycleView;
  course:CourseView;
  private cameraReady=false;
  private lastMode='';
  constructor(canvas:HTMLCanvasElement,props:Prop[]){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer: coarse)').matches?1.25:1.7));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.20;
    this.scene.background=new THREE.Color('#d4ddd5');
    this.scene.fog=new THREE.Fog('#d4ddd5',65,180);
    this.scene.add(new THREE.HemisphereLight('#f5f5e9','#69725c',2.6));
    const sun=new THREE.DirectionalLight('#fff1d4',3.3);sun.position.set(-20,36,-15);sun.castShadow=true;
    const shadowSize=matchMedia('(pointer: coarse)').matches?1024:2048;
    sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.camera.left=-55;sun.shadow.camera.right=55;
    sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;sun.shadow.camera.near=.5;sun.shadow.camera.far=120;
    sun.shadow.bias=-.00025;sun.shadow.normalBias=.018;sun.target.position.set(0,0,0);this.scene.add(sun,sun.target);
    this.course=new CourseView(this.scene,props);this.bicycle=new BicycleView(this.scene);
    window.addEventListener('resize',()=>this.resize());window.visualViewport?.addEventListener('resize',()=>this.resize());this.resize();
  }
  resize(){this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
  draw(bike:Bicycle,props:Prop[],mode:'first'|'third',look:number,menu:boolean,dt:number){
    const actualMode=menu?'menu':bike.fallen?'fallen':mode;
    if(actualMode!==this.lastMode){this.cameraReady=false;this.lastMode=actualMode;}
    this.bicycle.update(bike,!menu&&mode==='first'&&!bike.fallen);this.course.update(props);
    const position=vec(bike.body.translation());
    const bikeQ=quat(bike.body.rotation());
    const target=new THREE.Vector3();
    const desired=new THREE.Vector3();
    if(menu){
      desired.copy(position).add(new THREE.Vector3(3.2,1.90,4.0));
      // Leave the left half quiet for the menu, with the entire bicycle in view on the right.
      target.copy(position).add(new THREE.Vector3(-.8,.76,.4));
      this.camera.fov=innerWidth/innerHeight>2?48:42;this.camera.up.set(0,1,0);
    }else if(mode==='third'||bike.fallen){
      const forward=new THREE.Vector3(0,0,1).applyQuaternion(bikeQ);forward.y=0;forward.normalize();
      desired.copy(position).addScaledVector(forward,-4.3).add(new THREE.Vector3(.9,2.0,0));
      target.copy(position).add(new THREE.Vector3(0,.8,0)).addScaledVector(forward,1.4);
      this.camera.fov=62;this.camera.up.set(0,1,0);
    }else{
      desired.copy(this.bicycle.headPosition(bike));
      const direction=new THREE.Vector3(0,-Math.sin(look),Math.cos(look)).applyQuaternion(bikeQ);
      target.copy(desired).add(direction);
      const maxHorizontalFov=Math.tan(THREE.MathUtils.degToRad(56))/this.camera.aspect;
      this.camera.fov=Math.min(80,THREE.MathUtils.radToDeg(2*Math.atan(maxHorizontalFov)));
      this.camera.up.set(0,1,0).applyQuaternion(bikeQ);
    }
    // Keep first-person hands coherent with the camera; third-person has restrained positional lag.
    if(!this.cameraReady || actualMode==='first' || menu)this.camera.position.copy(desired);
    else this.camera.position.lerp(desired,1-Math.exp(-dt*8));
    this.cameraReady=true;
    this.camera.position.y=Math.max(.14,this.camera.position.y);
    this.camera.lookAt(target);this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene,this.camera);
  }
}
