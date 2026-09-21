import { Input } from '../input';
import { clamp } from '../physics/world';
import type { Bicycle } from '../physics/bicycle';

/** Independent pointer capture for every control: pedals, brake and steering can coexist. */
export class TouchControls {
  root:HTMLElement;
  private pointers=new Map<number,()=>void>();
  constructor(private input:Input,parent:HTMLElement){
    this.root=document.createElement('div');this.root.id='touch-controls';this.root.hidden=true;
    this.root.innerHTML=`
      <div class="touch-stick body-stick" role="slider" tabindex="0" aria-label="身体重心" aria-valuemin="-1" aria-valuemax="1" aria-valuenow="0"><span>重心</span><i></i></div>
      <div class="touch-middle">
        <div class="touch-brakes"><button data-hold="frontBrake">前刹</button><button data-hold="rearBrake">后刹</button></div>
        <div class="touch-pedals"><button data-foot="0" aria-label="左脚落地或收脚">左脚落地</button><button class="pedal" data-hold="leftPedal">左踏</button><button class="pedal" data-hold="rightPedal">右踏</button><button data-foot="1" aria-label="右脚落地或收脚">右脚落地</button></div>
      </div>
      <div class="touch-stick steer-stick" role="slider" tabindex="0" aria-label="车把与视线" aria-valuemin="-38" aria-valuemax="38" aria-valuenow="0"><span>车把</span><i></i></div>`;
    parent.append(this.root);
    this.root.querySelectorAll<HTMLButtonElement>('[data-hold]').forEach(button=>{
      const key=button.dataset.hold as 'leftPedal'|'rightPedal'|'frontBrake'|'rearBrake';
      button.addEventListener('pointerdown',e=>{
        if(!input.active)return;e.preventDefault();button.setPointerCapture(e.pointerId);input.virtual[key]=true;button.classList.add('held');
        this.pointers.set(e.pointerId,()=>{input.virtual[key]=false;button.classList.remove('held');});
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-foot]').forEach(button=>button.addEventListener('click',()=>{
      if(input.active)input.onAction(button.dataset.foot==='0'?'leftFoot':'rightFoot');
    }));
    for(const type of ['pointerup','pointercancel','lostpointercapture'])this.root.addEventListener(type,e=>{
      const id=(e as PointerEvent).pointerId;this.pointers.get(id)?.();this.pointers.delete(id);
    });
    this.stick(this.root.querySelector('.body-stick')!,false);
    this.stick(this.root.querySelector('.steer-stick')!,true);
  }
  private stick(el:HTMLElement,steering:boolean){
    let pointer:number|null=null,startX=0,startY=0,lastX=0,lastY=0;
    const knob=el.querySelector<HTMLElement>('i')!;
    el.addEventListener('pointerdown',e=>{
      if(!this.input.active||pointer!==null)return;
      e.preventDefault();pointer=e.pointerId;el.setPointerCapture(pointer);
      startX=lastX=e.clientX;startY=lastY=e.clientY;el.classList.add('held');
      this.pointers.set(pointer,()=>{pointer=null;knob.style.transform='translate(-50%,-50%)';el.classList.remove('held');if(!steering){this.input.virtual.lean=0;this.input.virtual.fore=0;}});
    });
    el.addEventListener('pointermove',e=>{
      if(e.pointerId!==pointer)return;e.preventDefault();
      const dx=clamp(e.clientX-startX,-34,34),dy=clamp(e.clientY-startY,-34,34);
      knob.style.transform=`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px))`;
      if(steering){
        this.input.steer=clamp(this.input.steer-(e.clientX-lastX)*.006*this.input.settings.sensitivity,-.66,.66);
        this.input.look=clamp(this.input.look+(e.clientY-lastY)*.005,-.30,1.52);
        el.setAttribute('aria-valuenow',String(Math.round(this.input.steer*180/Math.PI)));
      }else{
        this.input.virtual.lean=-dx/34;this.input.virtual.fore=-dy/34;el.setAttribute('aria-valuenow',this.input.virtual.lean.toFixed(2));
      }
      lastX=e.clientX;lastY=e.clientY;
    });
  }
  update(visible:boolean,bike:Bicycle){
    if(this.root.hidden===visible){
      this.root.hidden=!visible;
      if(!visible){this.pointers.forEach(release=>release());this.pointers.clear();}
    }
    if(!visible)return;
    this.root.querySelectorAll<HTMLButtonElement>('[data-foot]').forEach(button=>{
      const i=Number(button.dataset.foot);const label=`${i===0?'左':'右'}脚\n${bike.feet[i]?'收回':'落地'}`;
      if(button.textContent!==label)button.textContent=label;
      button.setAttribute('aria-pressed',String(bike.feet[i]));
    });
  }
}
