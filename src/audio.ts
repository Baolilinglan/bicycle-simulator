import { Bicycle } from './physics/bicycle';
import type { Settings } from './input';

/** Mechanical audio and a separately mixed local BGM track, paused with the simulation. */
export class RideAudio {
  private ctx?:AudioContext;
  private master?:GainNode;
  private tire?:GainNode;
  private brake?:GainNode;
  private chain?:GainNode;
  private tireFilter?:BiquadFilterNode;
  private brakeTone?:OscillatorNode;
  private nextClick=0;
  private lastCrank=0;
  private lastImpact=0;
  private music=new Audio(`${import.meta.env.BASE_URL}audio/keep-it-straight.mp3`);
  private musicGain?:GainNode;
  private musicWanted=false;
  private musicFailure='';
  onMusicError:()=>void=()=>{};
  constructor(){
    this.music.loop=true;this.music.preload='metadata';
    this.music.addEventListener('error',()=>{this.musicFailure='load';this.onMusicError();});
  }
  async start(settings:Settings){
    if(!this.ctx){
      const ctx=this.ctx=new AudioContext();this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);
      const length=ctx.sampleRate*2,buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
      // Deterministic noise exists only in sound generation, never in gameplay forces.
      let seed=181;for(let i=0;i<length;i++){seed=(seed*16807)%2147483647;data[i]=seed/1073741824-1;}
      const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
      this.tireFilter=ctx.createBiquadFilter();this.tireFilter.type='lowpass';this.tireFilter.frequency.value=500;
      this.tire=ctx.createGain();this.tire.gain.value=0;source.connect(this.tireFilter).connect(this.tire).connect(this.master);
      const high=ctx.createBiquadFilter();high.type='bandpass';high.frequency.value=1800;high.Q.value=1.5;
      this.chain=ctx.createGain();this.chain.gain.value=0;source.connect(high).connect(this.chain).connect(this.master);
      this.brakeTone=ctx.createOscillator();this.brakeTone.type='sine';this.brakeTone.frequency.value=680;
      this.brake=ctx.createGain();this.brake.gain.value=0;this.brakeTone.connect(this.brake).connect(this.master);
      source.start();this.brakeTone.start();
      this.musicGain=ctx.createGain();this.musicGain.gain.value=0;
      ctx.createMediaElementSource(this.music).connect(this.musicGain).connect(ctx.destination);
    }
    // Both resume and play originate in the user's gesture, including mobile Safari.
    const resumed=this.ctx.resume();this.setMusic(settings,true);
    await resumed;
  }
  setMusic(settings:Settings,playing:boolean){
    this.musicWanted=playing&&settings.musicEnabled&&settings.musicVolume>0;
    if(this.ctx&&this.musicGain)this.musicGain.gain.setTargetAtTime(this.musicWanted?settings.musicVolume:0,this.ctx.currentTime,.1);
    if(!this.musicWanted){this.music.pause();return;}
    if(!this.musicGain||!this.music.paused)return;
    void this.music.play().then(()=>{
      this.musicFailure='';if(!this.musicWanted)this.music.pause();
    }).catch(error=>{
      if(error.name==='AbortError')return;
      this.musicFailure=error.name;this.onMusicError();
    });
  }
  pause(){
    this.musicWanted=false;this.music.pause();
    if(this.ctx){this.master?.gain.setTargetAtTime(0,this.ctx.currentTime,.04);this.musicGain?.gain.setTargetAtTime(0,this.ctx.currentTime,.04);}
  }
  diagnostics(){return {paused:this.music.paused,time:this.music.currentTime,duration:Number.isFinite(this.music.duration)?this.music.duration:0,ready:this.music.readyState,error:this.musicFailure,loop:this.music.loop,volume:this.musicGain?.gain.value??0};}
  update(b:Bicycle,volume:number,playing:boolean){
    if(!this.ctx||!this.master)return;const now=this.ctx.currentTime,speed=Math.abs(b.speed);
    this.master.gain.setTargetAtTime(playing?volume:0,now,.05);
    this.tire!.gain.setTargetAtTime(Math.min(.11,speed*.009)*(b.wheels.some(w=>w.contact)?1:.05),now,.06);
    this.tireFilter!.frequency.setTargetAtTime(220+speed*95,now,.08);
    this.chain!.gain.setTargetAtTime(b.fallen?0:Math.min(.035,b.crankOmega*.004),now,.03);
    this.brake!.gain.setTargetAtTime(Math.min(.026,speed*.008)*Math.max(...b.brakes),now,.06);
    this.brakeTone!.frequency.setTargetAtTime(410+speed*30,now,.05);
    if(!playing)return;
    if(speed>.45&&b.crankOmega<.3&&!b.fallen&&now>this.nextClick){this.tick(.008,1900,.008);this.nextClick=now+Math.max(.018,.22/(speed+.5));}
    const crankQuadrant=Math.floor(b.crankAngle/(Math.PI/2));
    if(crankQuadrant!==this.lastCrank&&b.crankOmega>.5)this.tick(.008,260,.04);
    this.lastCrank=crankQuadrant;
    if(b.impact>.18&&b.impact>this.lastImpact+.10)this.tick(b.impact*.13,85+b.impact*70,.2);
    this.lastImpact=b.impact;
  }
  private tick(gain:number,frequency:number,duration:number){
    const ctx=this.ctx!,o=ctx.createOscillator(),g=ctx.createGain(),now=ctx.currentTime;
    o.type='triangle';o.frequency.setValueAtTime(frequency,now);o.frequency.exponentialRampToValueAtTime(frequency*.35,now+duration);
    g.gain.setValueAtTime(gain,now);g.gain.exponentialRampToValueAtTime(.0001,now+duration);
    o.connect(g).connect(this.master!);o.start(now);o.stop(now+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};
  }
}
