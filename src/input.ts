import { clamp } from './physics/world';
import { idleInput, type RideInput } from './physics/bicycle';
import { isDifficulty, type Difficulty } from './difficulty';

export const defaultBindings = {
  leftPedal:'KeyQ',rightPedal:'KeyE',leanLeft:'KeyA',leanRight:'KeyD',forward:'KeyW',back:'KeyS',
  leftFoot:'KeyZ',rightFoot:'KeyC',camera:'KeyV',reset:'KeyR',debug:'F3',look:'Space',help:'KeyH',returnHome:'KeyT',
  frontBrake:'Mouse0',rearBrake:'Mouse2',pause:'Escape',steerLeft:'',steerRight:'',lookUp:'',lookDown:'',
};
export type Action=keyof typeof defaultBindings;
export interface Settings { sensitivity:number;volume:number;musicVolume:number;musicEnabled:boolean;pedalAssist:boolean;difficulty:Difficulty;camera:'first'|'third';bindings:Record<Action,string> }
export function readSettings():Settings{
  const defaults:Settings={sensitivity:1,volume:.45,musicVolume:.35,musicEnabled:true,pedalAssist:true,difficulty:'training',camera:'first',bindings:{...defaultBindings}};
  try{
    const saved=JSON.parse(localStorage.getItem('manual-bicycle.settings.v1')||'null');
    if(!saved)return defaults;
    return {sensitivity:clamp(Number(saved.sensitivity)||1,.2,2.5),volume:clamp(Number(saved.volume)||0,0,1),
      musicVolume:Number.isFinite(saved.musicVolume)?clamp(saved.musicVolume,0,1):defaults.musicVolume,
      musicEnabled:typeof saved.musicEnabled==='boolean'?saved.musicEnabled:true,pedalAssist:typeof saved.pedalAssist==='boolean'?saved.pedalAssist:true,difficulty:isDifficulty(saved.difficulty)?saved.difficulty:'training',
      camera:saved.camera==='third'?'third':'first',bindings:sanitizeBindings(saved.bindings)};
  }catch{return defaults;}
}
export function saveSettings(s:Settings){try{localStorage.setItem('manual-bicycle.settings.v1',JSON.stringify(s));}catch{/* Playable with storage disabled. */}}
export function sanitizeBindings(saved:unknown):Record<Action,string>{
  const result={...defaultBindings};
  if(!saved||typeof saved!=='object')return result;
  const valid=/^(Key[A-Z]|Digit[0-9]|Numpad[0-9A-Za-z]+|Arrow(Left|Right|Up|Down)|F([1-9]|1[0-2])|Mouse[0-4]|Space|Escape|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right)|Enter|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Home|End|PageUp|PageDown|Insert|CapsLock)$/;
  const used=new Set<string>();
  for(const action of Object.keys(result) as Action[]){
    const code=(saved as Record<string,unknown>)[action];
    if(typeof code==='string'&&(code===''||valid.test(code)))result[action]=code;
    if(result[action]&&used.has(result[action]))result[action]='';
    if(result[action])used.add(result[action]);
  }
  return result;
}
export function keyLabel(code:string){
  const names:Record<string,string>={Mouse0:'鼠标左键',Mouse1:'鼠标中键',Mouse2:'鼠标右键',Mouse3:'鼠标侧键 1',Mouse4:'鼠标侧键 2',Space:'空格',Escape:'Esc',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',ShiftLeft:'左 Shift',ShiftRight:'右 Shift',ControlLeft:'左 Ctrl',ControlRight:'右 Ctrl',AltLeft:'左 Alt',AltRight:'右 Alt'};
  return !code?'未绑定':names[code]||(code.startsWith('Key')?code.slice(3):code.startsWith('Digit')?code.slice(5):code);
}

export class Input {
  touchMode=matchMedia('(pointer: coarse)').matches;
  virtual = { leftPedal:false, rightPedal:false, frontBrake:false, rearBrake:false, lean:0, fore:0, look:false };
  held=new Set<string>();
  steer=0;look=.40;
  active=false;
  onAction:(a:Action|'pause')=>void=()=>{};
  onRebind:((code:string)=>void)|null=null;
  constructor(public canvas:HTMLCanvasElement,public settings:Settings){
    document.addEventListener('keydown',e=>{
      if(this.onRebind){e.preventDefault();if(!e.repeat){const callback=this.onRebind;this.onRebind=null;callback(e.code);}return;}
      if(e.code==='Escape'){e.preventDefault();this.onAction('pause');return;}
      if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLTextAreaElement||(e.target instanceof HTMLElement&&e.target.isContentEditable))return;
      if(Object.values(this.settings.bindings).includes(e.code))e.preventDefault();
      if(!e.repeat)this.press(e.code);
    });
    document.addEventListener('keyup',e=>this.held.delete(e.code));
    let swallowClick=false,blockContextUntil=0;
    document.addEventListener('mousedown',e=>{
      if(this.touchMode)return;
      if(this.onRebind){
        e.preventDefault();e.stopImmediatePropagation();swallowClick=e.button===0;blockContextUntil=performance.now()+500;
        const callback=this.onRebind;this.onRebind=null;callback('Mouse'+e.button);return;
      }
      if(!this.active||(e.target!==canvas&&document.pointerLockElement!==canvas))return;
      e.preventDefault();this.press('Mouse'+e.button);
      if(this.active&&document.pointerLockElement!==canvas)void this.lock();
    },true);
    document.addEventListener('click',e=>{if(swallowClick){swallowClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
    document.addEventListener('mouseup',e=>this.held.delete('Mouse'+e.button));
    document.addEventListener('mousemove',e=>{
      if(!this.active||this.touchMode)return;
      if(document.pointerLockElement!==canvas && e.target!==canvas)return;
      // Relative mouse travel is a handle position, not an auto-centering steering velocity.
      // With +Z forward and +Y up, +X is the rider's LEFT, so mouse-right is negative yaw.
      this.steer=clamp(this.steer-e.movementX*.0018*this.settings.sensitivity,-.66,.66);
      this.look=clamp(this.look+e.movementY*.0018*this.settings.sensitivity,-.30,1.52);
    });
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    document.addEventListener('contextmenu',e=>{if(this.onRebind||performance.now()<blockContextUntil)e.preventDefault();});
    document.addEventListener('auxclick',e=>{if(this.active||performance.now()<blockContextUntil)e.preventDefault();});
    document.addEventListener('pointerlockchange',()=>{
      if(!document.pointerLockElement&&this.active&&!this.touchMode)this.onAction('pause');
    });
    window.addEventListener('blur',()=>{this.clear();if(this.active)this.onAction('pause');});
  }
  private press(code:string){
    const action=(Object.keys(this.settings.bindings) as Action[]).find(a=>this.settings.bindings[a]===code);
    if(action==='help'||action==='pause'){this.onAction(action);return;}
    if(!this.active)return;
    this.held.add(code);
    if(action&&['leftFoot','rightFoot','camera','reset','returnHome','debug'].includes(action))this.onAction(action);
  }
  advance(dt:number){
    if(!this.active)return;
    const down=(a:Action)=>Number(this.held.has(this.settings.bindings[a]));
    this.steer=clamp(this.steer+(down('steerLeft')-down('steerRight'))*.9*dt*this.settings.sensitivity,-.66,.66);
    this.look=clamp(this.look+(down('lookDown')-down('lookUp'))*.85*dt,-.30,1.52);
  }
  async lock(){if(this.touchMode)return;try{await this.canvas.requestPointerLock();}catch{/* Embedded browsers may deny lock; relative movement on the canvas still works. */}}
  clear(){this.held.clear();this.virtual={leftPedal:false,rightPedal:false,frontBrake:false,rearBrake:false,lean:0,fore:0,look:false};}
  read():RideInput{
    if(!this.active)return idleInput();
    const down=(a:Action)=>this.held.has(this.settings.bindings[a]);
    return {leftPedal:down('leftPedal')||this.virtual.leftPedal,rightPedal:down('rightPedal')||this.virtual.rightPedal,
      lean:clamp(Number(down('leanLeft'))-Number(down('leanRight'))+this.virtual.lean,-1,1),
      fore:clamp(Number(down('forward'))-Number(down('back'))+this.virtual.fore,-1,1),steer:this.steer,
      frontBrake:down('frontBrake')||this.virtual.frontBrake,rearBrake:down('rearBrake')||this.virtual.rearBrake};
  }
  lookAngle(){return this.held.has(this.settings.bindings.look)||this.virtual.look?1.43:this.look;}
}
