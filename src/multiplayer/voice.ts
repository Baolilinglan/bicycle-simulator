/** The host mixes each listener's audio separately, excluding that listener's own mic. */
export class RoomVoice {
  enabled=false;
  private ctx:AudioContext|null=null;
  private host=false;
  private mic:MediaStream|null=null;
  private micSource:MediaStreamAudioSourceNode|null=null;
  private speakers:GainNode|null=null;
  private meter:AnalyserNode|null=null;
  private samples=new Float32Array(256);
  private inputs=new Map<string,MediaStreamAudioSourceNode>();
  private receivers=new Map<string,HTMLAudioElement>();
  private outputs=new Map<string,MediaStreamAudioDestinationNode>();
  onChange=()=>{};
  async prepare(host:boolean){
    if(!this.ctx){this.ctx=new AudioContext();this.speakers=this.ctx.createGain();this.speakers.gain.value=.8;this.meter=this.ctx.createAnalyser();this.meter.fftSize=256;this.speakers.connect(this.meter);this.meter.connect(this.ctx.destination);}
    this.host=host;await this.ctx.resume();
  }
  outgoing(id:string){
    const out=this.ctx!.createMediaStreamDestination();this.outputs.set(id,out);
    this.micSource?.connect(out);
    if(this.host)for(const [from,source] of this.inputs)if(from!==id)source.connect(out);
    return out.stream.getAudioTracks()[0];
  }
  incoming(id:string,track:MediaStreamTrack){
    this.removeInput(id);
    if(!this.ctx)return;
    const stream=new MediaStream([track]);
    // Chromium needs a media-element consumer to start pulling remote WebRTC audio.
    // Playback stays muted here; the Web Audio graph handles volume and host mixing.
    const receiver=new Audio();receiver.muted=true;receiver.autoplay=true;receiver.srcObject=stream;
    receiver.setAttribute('playsinline','');this.receivers.set(id,receiver);void receiver.play().catch(()=>{});
    const source=this.ctx.createMediaStreamSource(stream);this.inputs.set(id,source);
    source.connect(this.speakers!);
    if(this.host)for(const [to,out] of this.outputs)if(to!==id)source.connect(out);
    track.addEventListener('ended',()=>{if(this.inputs.get(id)===source)this.removeInput(id);},{once:true});
  }
  async toggle(){
    if(this.enabled){this.disable();return;}
    const ctx=this.ctx;if(!ctx)throw new Error('加入房间后才能开启麦克风。');
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('麦克风需要 HTTPS 页面或本机 localhost。');
    await ctx.resume();
    let stream:MediaStream;
    try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});}
    catch{throw new Error('未能打开麦克风，请检查浏览器的麦克风权限和设备。');}
    if(ctx!==this.ctx){stream.getTracks().forEach(t=>t.stop());return;}
    this.mic=stream;this.micSource=ctx.createMediaStreamSource(stream);
    for(const out of this.outputs.values())this.micSource.connect(out);
    this.enabled=true;this.onChange();
  }
  disable(){this.micSource?.disconnect();this.micSource=null;this.mic?.getTracks().forEach(t=>t.stop());this.mic=null;this.enabled=false;this.onChange();}
  setVolume(value:number){if(this.speakers)this.speakers.gain.value=Math.max(0,Math.min(1,value));}
  private removeInput(id:string){this.inputs.get(id)?.disconnect();this.inputs.delete(id);const receiver=this.receivers.get(id);if(receiver){receiver.pause();receiver.srcObject=null;this.receivers.delete(id);}}
  remove(id:string){
    this.removeInput(id);const out=this.outputs.get(id);if(!out)return;
    try{this.micSource?.disconnect(out);}catch{}
    for(const source of this.inputs.values())try{source.disconnect(out);}catch{}
    out.stream.getTracks().forEach(t=>t.stop());out.disconnect();this.outputs.delete(id);
  }
  close(){
    this.disable();for(const id of this.outputs.keys())this.remove(id);
    for(const id of this.inputs.keys())this.removeInput(id);
    const ctx=this.ctx;this.ctx=null;this.speakers=null;this.meter=null;if(ctx)void ctx.close();
  }
  diagnostics(){this.meter?.getFloatTimeDomainData(this.samples);const outputLevel=this.meter?Math.sqrt(this.samples.reduce((sum,x)=>sum+x*x,0)/this.samples.length):0;return {enabled:this.enabled,context:this.ctx?.state,outputLevel,inputs:this.inputs.size,outputs:this.outputs.size,micTracks:this.mic?.getAudioTracks().filter(t=>t.readyState==='live').length||0};}
}
