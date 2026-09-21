import { Bicycle } from './physics/bicycle';

/** Small procedural mechanical sounds, all muted while paused. No external audio downloads. */
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
  async start(){
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
    }
    await this.ctx.resume();
  }
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
