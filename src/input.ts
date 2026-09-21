import { clamp } from './physics/world';
import { idleInput, type RideInput } from './physics/bicycle';

export const defaultBindings = {
  leftPedal:'KeyQ',rightPedal:'KeyE',leanLeft:'KeyA',leanRight:'KeyD',forward:'KeyW',back:'KeyS',
  leftFoot:'KeyZ',rightFoot:'KeyC',camera:'KeyV',reset:'KeyR',debug:'F3',look:'Space',help:'KeyH',
};
export type Action=keyof typeof defaultBindings;
export interface Settings { sensitivity:number;volume:number;camera:'first'|'third';bindings:Record<Action,string> }
export function readSettings():Settings{
  const defaults:Settings={sensitivity:1,volume:.45,camera:'first',bindings:{...defaultBindings}};
  try{
    const saved=JSON.parse(localStorage.getItem('manual-bicycle.settings.v1')||'null');
    if(!saved)return defaults;
    return {sensitivity:clamp(Number(saved.sensitivity)||1,.2,2.5),volume:clamp(Number(saved.volume)||0,0,1),
      camera:saved.camera==='third'?'third':'first',bindings:{...defaultBindings,...saved.bindings}};
  }catch{return defaults;}
}
export function saveSettings(s:Settings){try{localStorage.setItem('manual-bicycle.settings.v1',JSON.stringify(s));}catch{/* Playable with storage disabled. */}}
export function keyLabel(code:string){return code.startsWith('Key')?code.slice(3):code==='Space'?'空格':code;}

export class Input {
  touchMode=matchMedia('(pointer: coarse)').matches;
  virtual = { leftPedal:false, rightPedal:false, frontBrake:false, rearBrake:false, lean:0, fore:0, look:false };
  held=new Set<string>();
  pointer=[false,false];
  steer=0;look=.40;
  active=false;
  onAction:(a:Action|'pause')=>void=()=>{};
  onRebind:((code:string)=>void)|null=null;
  constructor(public canvas:HTMLCanvasElement,public settings:Settings){
    document.addEventListener('keydown',e=>{
      if(this.onRebind){e.preventDefault();if(!e.repeat){const callback=this.onRebind;this.onRebind=null;callback(e.code);}return;}
      if(e.code==='Escape'){this.onAction('pause');return;}
      if(e.code===this.settings.bindings.help){if(!e.repeat)this.onAction('help');e.preventDefault();return;}
      if(!this.active)return;
      if(Object.values(this.settings.bindings).includes(e.code)){e.preventDefault();}
      if(e.repeat)return;
      this.held.add(e.code);
      for(const action of ['leftFoot','rightFoot','camera','reset','debug','help'] as Action[])
        if(this.settings.bindings[action]===e.code)this.onAction(action);
    });
    document.addEventListener('keyup',e=>this.held.delete(e.code));
    document.addEventListener('mousemove',e=>{
      if(!this.active||this.touchMode)return;
      if(document.pointerLockElement!==canvas && e.target!==canvas)return;
      // Relative mouse travel is a handle position, not an auto-centering steering velocity.
      // With +Z forward and +Y up, +X is the rider's LEFT, so mouse-right is negative yaw.
      this.steer=clamp(this.steer-e.movementX*.0018*this.settings.sensitivity,-.66,.66);
      this.look=clamp(this.look+e.movementY*.0018*this.settings.sensitivity,-.30,1.52);
    });
    canvas.addEventListener('mousedown',e=>{
      if(!this.active||this.touchMode)return;
      e.preventDefault();if(e.button===0)this.pointer[0]=true;if(e.button===2)this.pointer[1]=true;
      if(document.pointerLockElement!==canvas)void this.lock();
    });
    document.addEventListener('mouseup',e=>{if(e.button===0)this.pointer[0]=false;if(e.button===2)this.pointer[1]=false;});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    document.addEventListener('pointerlockchange',()=>{
      if(!document.pointerLockElement&&this.active&&!this.touchMode)this.onAction('pause');
    });
    window.addEventListener('blur',()=>{this.clear();if(this.active)this.onAction('pause');});
  }
  async lock(){if(this.touchMode)return;try{await this.canvas.requestPointerLock();}catch{/* Embedded browsers may deny lock; relative movement on the canvas still works. */}}
  clear(){this.held.clear();this.pointer=[false,false];this.virtual={leftPedal:false,rightPedal:false,frontBrake:false,rearBrake:false,lean:0,fore:0,look:false};}
  read():RideInput{
    if(!this.active)return idleInput();
    const down=(a:Action)=>this.held.has(this.settings.bindings[a]);
    return {leftPedal:down('leftPedal')||this.virtual.leftPedal,rightPedal:down('rightPedal')||this.virtual.rightPedal,
      lean:clamp(Number(down('leanLeft'))-Number(down('leanRight'))+this.virtual.lean,-1,1),
      fore:clamp(Number(down('forward'))-Number(down('back'))+this.virtual.fore,-1,1),steer:this.steer,
      frontBrake:this.pointer[0]||this.virtual.frontBrake,rearBrake:this.pointer[1]||this.virtual.rearBrake};
  }
  lookAngle(){return this.held.has(this.settings.bindings.look)||this.virtual.look?1.43:this.look;}
}
