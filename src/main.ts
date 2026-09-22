import './ui/interface.css';
import './ui/multiplayer.css';
import { makeWorld, STEP, groundHeight } from './physics/world';
import { Bicycle, type RideInput } from './physics/bicycle';
import { View } from './render/app';
import { Input, readSettings, saveSettings } from './input';
import { Menu } from './ui/menu';
import { RideAudio } from './audio';
import { RideRoom } from './multiplayer/room';
import { captureFrame } from './multiplayer/protocol';
import { RemoteRiders } from './render/remote-riders';
import { MultiplayerUI } from './ui/multiplayer';

async function boot(){
  const canvas=document.querySelector<HTMLCanvasElement>('#game')!;
  const settings=readSettings(),input=new Input(canvas,settings),menu=new Menu(settings,input);
  const {world,props}=await makeWorld();
  const bike=new Bicycle(world,settings.difficulty),view=new View(canvas,props),audio=new RideAudio();
  await view.bicycle.rider.ready;
  const room=new RideRoom(),multiplayer=new MultiplayerUI(room,menu),remotes=new RemoteRiders(view.scene);
  let accumulator=0,last=performance.now(),fps=60,pausedByContext=false;
  // Settle onto a planted left foot before the first frame; there is no hidden stand.
  for(let i=0;i<180;i++){bike.step(input.read());world.step();bike.afterStep();}
  bike.rideDistance=0;
  menu.onStart=()=>{last=performance.now();accumulator=0;void audio.start(settings).catch(()=>menu.toast('声音暂未启动，请暂停后继续骑行。'));};
  menu.onPause=()=>{accumulator=0;audio.pause();};
  menu.onSettingsChange=()=>audio.setMusic(settings,menu.playing);
  menu.onDifficulty=()=>{bike.setDifficulty(settings.difficulty);input.clear();input.steer=0;accumulator=0;};
  audio.onMusicError=()=>menu.toast('音乐暂时无法播放，骑行仍可继续。');
  const reset=(start:boolean)=>{
    const slot=[...room.members.keys()].indexOf(room.self);
    bike.reset(start,slot>=0?{x:(slot%2)*1.6-.8,z:-32-Math.floor(slot/2)*2.3}:undefined);
    input.steer=0;input.clear();input.look=.40;accumulator=0;
  };
  menu.onReset=reset;
  room.onEnter=()=>{menu.setDifficulty(room.difficulty);reset(true);};
  input.onAction=action=>{
    if(multiplayer.opened){if(action==='pause')multiplayer.close();return;}
    if(action==='pause'){if(menu.helpOpen)menu.dismissHelp();else menu.pause();return;}
    if(action==='help'){menu.toggleHelp();return;}
    if(action==='leftFoot')bike.toggleFoot(0);
    if(action==='rightFoot')bike.toggleFoot(1);
    if(action==='reset')reset(false);
    if(action==='returnHome')reset(true);
    if(action==='debug')menu.toggleDebug();
    if(action==='camera'){settings.camera=settings.camera==='first'?'third':'first';saveSettings(settings);const sel=document.querySelector<HTMLSelectElement>('#camera');if(sel)sel.value=settings.camera;}
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden)menu.pause();});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pausedByContext=true;menu.pause();menu.toast('画面暂时中断，正在等待图形设备恢复。');});
  canvas.addEventListener('webglcontextrestored',()=>{pausedByContext=false;view.resize();menu.toast('画面已恢复，可以继续骑行。');});
  menu.ready();
  function animate(now:number){
    requestAnimationFrame(animate);
    const dt=Math.min((now-last)/1000,.06);last=now;fps+=(1/Math.max(dt,.001)-fps)*.04;
    if(menu.playing&&!pausedByContext){
      input.advance(dt);accumulator+=dt;const control=input.read();
      while(accumulator>=STEP){bike.step(control);world.step();bike.afterStep();accumulator-=STEP;}
    }
    audio.update(bike,settings.volume,menu.playing,settings.pedalAssist);
    menu.updateDebug(bike,fps);
    if(room.role!=='none')room.tick(captureFrame(bike,!menu.playing),now);multiplayer.update();
    remotes.update(room.members,room.self,room.difficulty,dt);
    if(!pausedByContext)view.draw(bike,props,settings.camera,input.lookAngle(),menu.menuVisible,dt);
  }
  requestAnimationFrame(animate);
  // Read-only diagnostics in ordinary builds. Deterministic stepping only under explicit QA query.
  Object.assign(window,{bicycleDiagnostics:{snapshot:()=>bike.snapshot(),renderer:()=>({...view.renderer.info.render}),rider:()=>view.bicycle.rider.diagnostics(),input:()=>({...input.read(),touch:input.touchMode}),music:()=>audio.diagnostics(),trainingVisible:()=>view.bicycle.training.visible,room:()=>room.diagnostics(),remotes:()=>remotes.diagnostics(),network:()=>room.stats(),ready:true}});
  if(new URLSearchParams(location.search).has('test')){
    Object.assign(window,{bicycleTest:{
      snapshot:()=>bike.snapshot(),reset:(start=true)=>reset(start),pause:()=>menu.pause(),
      step:(count:number,control:RideInput)=>{for(let i=0;i<count;i++){bike.step(control);world.step();bike.afterStep();}return bike.snapshot();},
      setFeet:(l:boolean,r:boolean)=>{bike.feet=[l,r];},
      place:(x:number,z:number)=>{reset(true);bike.body.setTranslation({x,y:groundHeight(x,z)+.03,z},true);},
      show:()=>view.draw(bike,props,settings.camera,input.lookAngle(),false,1/60),
    }});
  }
}
boot().catch(error=>{
  console.error(error);
  const ui=document.querySelector('#ui')!;
  const panel=document.createElement('section');panel.className='panel';panel.style.pointerEvents='auto';
  const heading=document.createElement('h2');heading.textContent='练习场未能载入';
  const p=document.createElement('p');p.textContent='请使用支持 WebGL 2 的桌面浏览器，并确认浏览器已开启硬件加速。';
  const button=document.createElement('button');button.className='primary compact';button.textContent='重新加载';button.onclick=()=>location.reload();
  panel.append(heading,p,button);ui.replaceChildren(panel);
});
