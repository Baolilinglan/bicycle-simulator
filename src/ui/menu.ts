import { Input, defaultBindings, keyLabel, saveSettings, type Action, type Settings } from '../input';
import { Bicycle } from '../physics/bicycle';
import { TouchControls } from './touch';
import { difficulties, type Difficulty } from '../difficulty';

const labels:Record<Action,string>={leftPedal:'左脚踩踏 / 蹬地',rightPedal:'右脚踩踏 / 蹬地',leanLeft:'重心向左',leanRight:'重心向右',
  forward:'重心向前',back:'重心向后',leftFoot:'左脚落地 / 收脚',rightFoot:'右脚落地 / 收脚',camera:'切换视角',reset:'重新摆正',debug:'物理调试',look:'低头看踏板',help:'按键提示',frontBrake:'前刹车',rearBrake:'后刹车',pause:'暂停',steerLeft:'车把向左（可选）',steerRight:'车把向右（可选）',lookUp:'抬头（可选）',lookDown:'低头（可选）'};

export class Menu {
  playing=false;started=false;debug=false;
  menuVisible=true;helpOpen=false;
  private hasSeenHelp=false;
  private touch:TouchControls;
  root:HTMLDivElement;
  onStart:()=>void=()=>{};
  onReset:(start:boolean)=>void=()=>{};
  onPause:()=>void=()=>{};
  onDifficulty:()=>void=()=>{};
  onSettingsChange:()=>void=()=>{};
  private debugElement:HTMLElement;
  constructor(public settings:Settings,public input:Input){
    this.root=document.querySelector('#ui')!;
    this.root.innerHTML=`
      <main class="menu-shell" id="menu-shell">
        <div class="menu-shade"></div>
        <section class="welcome" id="welcome" aria-label="自行车模拟器主菜单">
          <h1>自行车</h1>
          <div class="difficulty-picker"><label for="welcome-difficulty">骑行难度</label><select id="welcome-difficulty" aria-describedby="welcome-difficulty-caption"></select><p id="welcome-difficulty-caption"></p></div>
          <div class="menu-actions">
            <button class="primary" id="start" disabled><span>正在准备练习场</span><span aria-hidden="true">↗</span></button>
            <button class="text-button" id="open-controls">操作方式 <span aria-hidden="true">＋</span></button>
            <button class="text-button" id="open-settings">设置 <span aria-hidden="true">＋</span></button>
          </div>
        </section>
        <section class="panel" id="controls-panel" hidden aria-label="操作方式">
          <button class="close" data-close aria-label="关闭操作方式">×</button>
          <h2>操作方式</h2>
          <div class="control-grid">
            <div><span class="keys" id="pedal-keys"></span><strong>左右脚踩踏</strong><p>交替向下发力。踩到底后，换另一只脚。</p></div>
            <div><span class="keys">鼠标左右</span><strong>转动车把</strong><p>向倒下的一侧小幅修正，速度越快越要轻柔。</p></div>
            <div><span class="keys" id="body-keys"></span><strong>移动身体重心</strong><p>左右保持平衡，前后调节轮胎负载。</p></div>
            <div><span class="keys" id="foot-keys"></span><strong>落脚与收脚</strong><p>按一次伸脚，再按一次收回。落地时踩踏键用于蹬地。</p></div>
            <div><span class="keys">鼠标左键 / 右键</span><strong>前刹 / 后刹</strong><p>停车时将重心后移，配合双刹，及时伸脚。</p></div>
            <div><span class="keys" id="look-keys"></span><strong>观察与重来</strong><p>鼠标上下俯仰视线；随时摆正自行车再试。</p></div>
          </div>
          <div class="start-tip"><strong>第一次起步</strong><p id="start-tip-text"></p></div>
          <button class="primary compact" id="controls-start">进入练习场 <span aria-hidden="true">↗</span></button>
        </section>
        <section class="panel settings-panel" id="settings-panel" hidden aria-label="设置">
          <button class="close" data-close aria-label="关闭设置">×</button>
          <h2>设置</h2>
          <label class="setting-row" for="difficulty"><span>骑行难度</span><select id="difficulty" aria-describedby="difficulty-caption"></select></label><p class="setting-note" id="difficulty-caption"></p>
          <label class="setting-row" for="sensitivity"><span>鼠标灵敏度</span><output id="sensitivity-value"></output><input id="sensitivity" type="range" min="0.2" max="2.5" step="0.05"></label>
          <label class="setting-row" for="volume"><span>音效音量</span><output id="volume-value"></output><input id="volume" type="range" min="0" max="1" step="0.05"></label>
          <label class="setting-row" for="music-enabled"><span>背景音乐</span><input id="music-enabled" type="checkbox" role="switch"></label>
          <label class="setting-row" for="music-volume"><span>音乐音量</span><output id="music-volume-value"></output><input id="music-volume" type="range" min="0" max="1" step="0.05"></label>
          <p class="music-track">Keep It Straight</p>
          <label class="setting-row" for="camera"><span>视角</span><select id="camera"><option value="first">第一人称</option><option value="third">第三人称</option></select></label>
          <div class="reset-actions"><button id="upright">重新摆正自行车</button><button id="reset-position">回到起点</button></div>
          <details><summary>键位设置</summary><p class="setting-note">点击动作右侧，再按键盘或鼠标按键。重复绑定会交换。Delete 清除，Esc 取消；Esc 始终可暂停。</p><div id="bindings" class="bindings"></div><button id="reset-bindings" class="text-button">恢复默认键位</button></details>
        </section>
      </main>
      <nav id="ride-tools" hidden aria-label="骑行工具"><button id="ride-help" aria-label="显示按键提示">操作</button><button id="ride-camera" class="touch-only" aria-label="切换视角">视角</button><button id="ride-reset" class="touch-only" aria-label="原地摆正">摆正</button><button id="ride-pause" aria-label="暂停游戏">暂停</button></nav>
      <div id="help-layer" hidden><section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><h2 id="help-title">按键提示</h2><div id="help-grid"></div><p class="help-start" id="help-start"></p><button id="dismiss-help" class="primary">知道了，开始骑行 <span aria-hidden="true">↗</span></button></section></div>
      <div id="orientation"><span class="rotate-phone" aria-hidden="true"></span><h2>请将设备横过来</h2><p>横屏后即可骑行</p></div>
      <div id="speedometer" hidden aria-label="当前速度"><output id="speed-value">0.0</output><span>km/h</span></div>
      <pre id="debug" hidden aria-label="物理调试信息"></pre>
      <div id="toast" role="status" hidden></div>
    `;
    this.debugElement=this.root.querySelector('#debug')!;
    this.click('start',()=>this.start());this.click('controls-start',()=>{this.hasSeenHelp=true;this.start();});
    this.touch=new TouchControls(input,this.root);
    document.body.classList.toggle('is-touch',input.touchMode);
    try{this.hasSeenHelp=localStorage.getItem('bicycle.controls-seen.v2')==='yes';}catch{}
    this.click('ride-help',()=>this.openHelp());this.click('dismiss-help',()=>this.dismissHelp());
    this.click('ride-pause',()=>this.pause());this.click('ride-camera',()=>input.onAction('camera'));this.click('ride-reset',()=>input.onAction('reset'));
    this.root.querySelector('#help-layer')!.addEventListener('keydown',e=>{
      if((e as KeyboardEvent).key==='Tab'){e.preventDefault();this.root.querySelector<HTMLButtonElement>('#dismiss-help')!.focus();}
    });
    const orientation=()=>{if(input.touchMode&&innerWidth<innerHeight&&this.playing)this.pause();};
    window.addEventListener('resize',orientation);
    // A small, local ripple complements CSS lift/press feedback, including keyboard activation.
    this.root.addEventListener('pointerdown',e=>{
      const button=(e.target as Element).closest('button');if(!button||button.disabled)return;
      const rect=button.getBoundingClientRect(),ripple=document.createElement('span');ripple.className='ripple';
      ripple.style.left=`${e.clientX-rect.left}px`;ripple.style.top=`${e.clientY-rect.top}px`;
      button.append(ripple);ripple.addEventListener('animationend',()=>ripple.remove());window.setTimeout(()=>ripple.remove(),800);
    });
    this.click('open-controls',()=>this.panel('controls'));this.click('open-settings',()=>this.panel('settings'));
    this.root.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',()=>this.panel(null)));
    const sensitivity=this.root.querySelector<HTMLInputElement>('#sensitivity')!;
    sensitivity.value=String(settings.sensitivity);sensitivity.oninput=()=>{settings.sensitivity=Number(sensitivity.value);this.updateSettings();};
    const volume=this.root.querySelector<HTMLInputElement>('#volume')!;
    volume.value=String(settings.volume);volume.oninput=()=>{settings.volume=Number(volume.value);this.updateSettings();};
    const camera=this.root.querySelector<HTMLSelectElement>('#camera')!;camera.value=settings.camera;
    camera.onchange=()=>{settings.camera=camera.value as Settings['camera'];this.updateSettings();};
    this.click('upright',()=>{this.onReset(false);this.start();});this.click('reset-position',()=>{this.onReset(true);this.start();});
    for(const id of ['welcome-difficulty','difficulty']){
      const select=this.root.querySelector<HTMLSelectElement>('#'+id)!;
      for(const [value,d] of Object.entries(difficulties)){const option=document.createElement('option');option.value=value;option.textContent=d.name;select.append(option);}
      select.onchange=()=>{settings.difficulty=select.value as Difficulty;this.onDifficulty();this.updateSettings();};
    }
    const musicVolume=this.root.querySelector<HTMLInputElement>('#music-volume')!;musicVolume.value=String(settings.musicVolume);
    musicVolume.oninput=()=>{settings.musicVolume=Number(musicVolume.value);this.updateSettings();};
    const musicEnabled=this.root.querySelector<HTMLInputElement>('#music-enabled')!;musicEnabled.checked=settings.musicEnabled;
    musicEnabled.onchange=()=>{settings.musicEnabled=musicEnabled.checked;this.updateSettings();};
    this.click('reset-bindings',()=>{this.input.clear();this.input.onRebind=null;settings.bindings={...defaultBindings};this.updateSettings();this.renderBindings();});
    this.renderBindings();this.updateSettings();
  }
  ready(){const b=this.root.querySelector<HTMLButtonElement>('#start')!;b.disabled=false;b.querySelector('span')!.textContent='开始骑行';}
  private click(id:string,fn:()=>void){this.root.querySelector('#'+id)!.addEventListener('click',fn);}
  start(){
    this.panel(null);this.started=true;this.menuVisible=false;
    this.root.querySelector<HTMLElement>('#menu-shell')!.hidden=true;
    if(!this.hasSeenHelp){this.openHelp();return;}
    this.resume();
  }
  private resume(){
    this.playing=true;this.input.active=true;this.input.clear();this.onStart();void this.input.lock();
  }
  openHelp(){
    if(!this.started||this.menuVisible)return;
    this.playing=false;this.input.active=false;this.input.clear();document.exitPointerLock?.();this.onPause();
    this.helpOpen=true;this.fillHelp();this.root.querySelector<HTMLElement>('#help-layer')!.hidden=false;
    this.root.querySelector<HTMLButtonElement>('#dismiss-help')!.focus();
  }
  dismissHelp(){
    this.helpOpen=false;this.hasSeenHelp=true;try{localStorage.setItem('bicycle.controls-seen.v2','yes');}catch{}
    this.root.querySelector<HTMLElement>('#help-layer')!.hidden=true;this.resume();
  }
  toggleHelp(){if(this.helpOpen)this.dismissHelp();else this.openHelp();}
  private fillHelp(){
    const k=(a:Action)=>keyLabel(this.settings.bindings[a]);
    const steering=['鼠标',...(['steerLeft','steerRight','lookUp','lookDown'] as Action[]).filter(a=>this.settings.bindings[a]).map(k)].join(' / ');
    const items=this.input.touchMode?[
      ['左踏 / 右踏','交替踩踏，落地时蹬地'],['左脚 / 右脚','切换落脚与收脚'],['左侧圆盘','移动身体重心'],['右侧圆盘','左右转把，上下看路'],['前刹 / 后刹','按住刹车，可同时操作'],['顶部按钮','视角、摆正与暂停'],
    ]:[
      [`${k('leftPedal')} / ${k('rightPedal')}`,'左右脚踩踏 / 蹬地'],[`${k('leftFoot')} / ${k('rightFoot')}`,'左右脚落地 / 收脚'],
      [`${k('leanLeft')} ${k('leanRight')} · ${k('forward')} ${k('back')}`,'左右 / 前后重心'],[steering,'车把 / 视线'],
      [`${k('frontBrake')} / ${k('rearBrake')}`,'前刹 / 后刹'],[`${k('reset')} · ${k('camera')} · ${k('help')}`,'摆正 · 视角 · 提示'],
    ];
    const grid=this.root.querySelector('#help-grid')!;grid.replaceChildren();
    for(const [key,label] of items){const row=document.createElement('div'),keys=document.createElement('kbd'),text=document.createElement('span');keys.textContent=key;text.textContent=label;row.append(keys,text);grid.append(row);}
    this.root.querySelector('#help-start')!.textContent=difficulties[this.settings.difficulty].help+' '+(this.settings.difficulty!=='extreme'?'':this.input.touchMode?'起步：左踏蹬地，右踏发力，再收左脚。支持多指同时操作。':`起步：${k('leftPedal')} 蹬地，${k('rightPedal')} 发力，再按 ${k('leftFoot')} 收左脚。Esc 暂停。`);
  }
  pause(){
    if(!this.playing&&!this.helpOpen)return;
    this.helpOpen=false;this.root.querySelector<HTMLElement>('#help-layer')!.hidden=true;this.menuVisible=true;
    this.playing=false;this.input.active=false;this.input.clear();document.exitPointerLock?.();
    this.root.querySelector<HTMLElement>('#menu-shell')!.hidden=false;
    this.root.querySelector('#start span')!.textContent='继续骑行';this.onPause();
  }
  private panel(name:'controls'|'settings'|null){
    this.root.querySelector<HTMLElement>('#controls-panel')!.hidden=name!=='controls';
    this.root.querySelector<HTMLElement>('#settings-panel')!.hidden=name!=='settings';
    this.root.querySelector<HTMLElement>('#welcome')!.hidden=name!==null;
    this.input.onRebind=null;this.renderBindings();
  }
  private updateSettings(){
    this.root.querySelector('#sensitivity-value')!.textContent=this.settings.sensitivity.toFixed(2);
    this.root.querySelector('#volume-value')!.textContent=Math.round(this.settings.volume*100)+'%';
    this.root.querySelector('#music-volume-value')!.textContent=Math.round(this.settings.musicVolume*100)+'%';
    const d=difficulties[this.settings.difficulty];
    for(const id of ['welcome-difficulty','difficulty'])this.root.querySelector<HTMLSelectElement>('#'+id)!.value=this.settings.difficulty;
    this.root.querySelector('#welcome-difficulty-caption')!.textContent=d.caption;
    this.root.querySelector('#difficulty-caption')!.textContent=d.caption+'。切换后原地重新摆正。';
    saveSettings(this.settings);this.onSettingsChange();
    const b=this.settings.bindings,k=(a:Action)=>keyLabel(b[a]);
    this.root.querySelector('#pedal-keys')!.textContent=`${k('leftPedal')} / ${k('rightPedal')}`;
    this.root.querySelector('#body-keys')!.textContent=`${k('leanLeft')} ${k('leanRight')} / ${k('forward')} ${k('back')}`;
    this.root.querySelector('#foot-keys')!.textContent=`${k('leftFoot')} / ${k('rightFoot')}`;
    this.root.querySelector('#look-keys')!.textContent=`${k('look')} 低头 · ${k('reset')} 摆正 · ${k('camera')} 视角`;
    this.root.querySelectorAll('.control-grid .keys')[4].textContent=`${k('frontBrake')} / ${k('rearBrake')}`;
    this.root.querySelectorAll('.control-grid .keys')[1].textContent=['鼠标左右',...(['steerLeft','steerRight'] as Action[]).filter(a=>b[a]).map(k)].join(' / ');
    if(this.input.touchMode){
      const texts=['左踏 / 右踏','右侧圆盘左右滑动','左侧重心圆盘','左脚 / 右脚','前刹 / 后刹','右侧圆盘上下滑动 · 顶部视角 / 摆正'];
      this.root.querySelectorAll('.control-grid .keys').forEach((el,i)=>el.textContent=texts[i]);
    }
    this.root.querySelector('#start-tip-text')!.textContent=this.settings.difficulty!=='extreme'?d.help:`左脚已伸出。先等脚着地，轻按 ${k('leftPedal')} 蹬地，同时用 ${k('rightPedal')} 踩下右踏板。用 ${k('leftFoot')} 收起左脚，再交替 ${k('leftPedal')} / ${k('rightPedal')} 踩踏。停车前再次伸脚支撑。`;
  }
  private renderBindings(){
    const el=this.root.querySelector('#bindings')!;el.replaceChildren();
    for(const action of Object.keys(labels) as Action[]){
      const row=document.createElement('div');const label=document.createElement('span');label.textContent=labels[action];
      const button=document.createElement('button');button.textContent=keyLabel(this.settings.bindings[action]);button.setAttribute('aria-label',`修改${labels[action]}键位`);
      button.onclick=()=>{el.querySelectorAll('button').forEach((b,i)=>{b.textContent=keyLabel(this.settings.bindings[(Object.keys(labels) as Action[])[i]]);});button.textContent='按键或鼠标…';button.classList.add('awaiting');this.input.onRebind=code=>{
        if(code==='Escape'){this.renderBindings();return;}
        if(code==='Delete'||code==='Backspace'){this.settings.bindings[action]='';this.input.clear();this.updateSettings();this.renderBindings();return;}
        const reserved=['Escape','Tab','MetaLeft','MetaRight'];
        if(reserved.includes(code)){this.toast('这个按键由浏览器使用，请选择其他按键。');this.renderBindings();return;}
        const old=this.settings.bindings[action];
        const duplicate=(Object.keys(labels) as Action[]).find(a=>a!==action&&this.settings.bindings[a]===code);
        if(duplicate)this.settings.bindings[duplicate]=old;
        this.settings.bindings[action]=code;this.input.clear();this.updateSettings();this.renderBindings();
      };};
      row.append(label,button);el.append(row);
    }
  }
  toggleDebug(){this.debug=!this.debug;this.debugElement.hidden=!this.debug;}
  updateDebug(b:Bicycle,fps:number){
    this.root.querySelector<HTMLElement>('#ride-tools')!.hidden=!this.playing;
    this.root.querySelector<HTMLElement>('#speedometer')!.hidden=!this.playing;
    const speed=this.root.querySelector<HTMLOutputElement>('#speed-value')!;const value=(Math.hypot(b.body.linvel().x,b.body.linvel().z)*3.6).toFixed(1);
    if(speed.value!==value)speed.value=value;
    this.touch.update(this.playing&&this.input.touchMode,b);
    this.debugElement.hidden=!this.debug||!this.playing;
    if(!this.debug)return;
    const deg=(r:number)=>(r*180/Math.PI).toFixed(1)+'°';
    this.debugElement.textContent=`${(Math.abs(b.speed)*3.6).toFixed(1)} km/h     ${Math.round(fps)} fps\n车身倾斜 ${deg(b.lean)}\n车把角度 ${deg(b.steer)}\n曲柄角度 ${deg(b.crankAngle)}\n前轮 ${(b.wheels[1].omega).toFixed(1)} rad/s · ${(b.wheels[1].load).toFixed(0)} N\n后轮 ${(b.wheels[0].omega).toFixed(1)} rad/s · ${(b.wheels[0].load).toFixed(0)} N\n重心 ${b.bodyX.toFixed(3)} / ${b.bodyZ.toFixed(3)} m\n左脚 ${b.feet[0]?(b.footContacts[0]?'接地':'伸出'):'踏板'} · 右脚 ${b.feet[1]?(b.footContacts[1]?'接地':'伸出'):'踏板'}${b.fallen?'\n刚体已倒地':''}`;
  }
  toast(message:string){const t=this.root.querySelector<HTMLElement>('#toast')!;t.textContent=message;t.hidden=false;window.setTimeout(()=>t.hidden=true,3500);}
}
