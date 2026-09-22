import { isDifficulty, type Difficulty } from '../difficulty';
import { cleanName, decodeCode, encodeCode, MAX_PACKET, MAX_PLAYERS, validFrame, validMember, type Chat, type ConnectionCode, type Member, type RideFrame } from './protocol';
import { RoomVoice } from './voice';

interface Link {id:string;pc:RTCPeerConnection;channel:RTCDataChannel|null;timer:number;lastChat:number}
export class RideRoom {
  role:'none'|'host'|'guest'='none';
  id='';self='';name='骑友';difficulty:Difficulty='training';status='尚未连接';
  members=new Map<string,Member>();chats:Chat[]=[];
  voice=new RoomVoice();
  onChange=()=>{};
  onEnter:()=>void=()=>{};
  onLeave:()=>void=()=>{};
  private links=new Map<string,Link>();
  private invited:string|null=null;
  private lastSend=0;private lastChat=0;
  private epoch=0;
  constructor(){this.voice.onChange=()=>{
    const me=this.members.get(this.self);if(me)me.mic=this.voice.enabled;
    if(this.role==='guest')this.send(this.links.get('host'),{type:'mic',value:this.voice.enabled});
    this.onChange();
  };window.addEventListener('pagehide',()=>this.leave());}
  async create(name:string,difficulty:Difficulty){
    this.leave();this.role='host';this.id=crypto.randomUUID();this.self='host';this.name=cleanName(name);this.difficulty=difficulty;
    const epoch=this.epoch;
    this.members.set(this.self,{id:this.self,name:this.name,best:0,mic:false,frame:null});
    try{await this.voice.prepare(true);if(this.epoch!==epoch)return;this.status='房间已创建，邀请同一局域网的骑友';this.onEnter();this.onChange();}
    catch(error){if(this.epoch===epoch)this.leave();throw error;}
  }
  private async gathered(pc:RTCPeerConnection){
    if(pc.iceGatheringState==='complete')return;
    await new Promise<void>((resolve,reject)=>{
      const done=()=>{if(pc.iceGatheringState==='complete'){cleanup();resolve();}};
      const cleanup=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',done);};
      const timer=window.setTimeout(()=>{cleanup();reject(new Error('收集连接地址超时，请重新生成连接码。'));},8000);
      pc.addEventListener('icegatheringstatechange',done);done();
    });
  }
  private makeLink(id:string,offer:boolean){
    // No STUN, TURN or signaling service: only locally gathered direct candidates.
    const pc=new RTCPeerConnection({iceServers:[]});
    const link:Link={id,pc,channel:null,timer:0,lastChat:0};this.links.set(id,link);
    pc.ontrack=e=>{if(e.track.kind==='audio')this.voice.incoming(id,e.track);};
    pc.onconnectionstatechange=()=>{
      if(this.links.get(id)!==link)return;
      if(pc.connectionState==='failed'||pc.connectionState==='closed')this.drop(id,'连接已断开，请重新交换连接码');
      if(pc.connectionState==='disconnected')this.status='连接暂时中断，正在尝试恢复';
      if(pc.connectionState==='connected')this.status='已直连';
      this.onChange();
    };
    pc.ondatachannel=e=>this.attach(link,e.channel);
    if(offer){pc.addTransceiver(this.voice.outgoing(id),{direction:'sendrecv'});this.attach(link,pc.createDataChannel('ride',{ordered:true}));}
    return link;
  }
  private attach(link:Link,channel:RTCDataChannel){
    if(channel.label!=='ride'||link.channel){channel.close();return;}
    link.channel=channel;
    channel.onopen=()=>{
      clearTimeout(link.timer);if(this.invited===link.id)this.invited=null;
      if(this.role==='host'){
        const member=this.members.get(link.id);if(!member){this.drop(link.id);return;}
        this.send(link,{type:'welcome',room:this.id,self:link.id,difficulty:this.difficulty,members:[...this.members.values()]});
      }
      this.status='已直连';this.onChange();
    };
    channel.onmessage=e=>{
      if(typeof e.data!=='string'||e.data.length>MAX_PACKET)return;
      try{this.receive(link,JSON.parse(e.data));}catch{/* Untrusted or incompatible network data is ignored. */}
    };
    channel.onclose=()=>{if(this.links.get(link.id)===link)this.drop(link.id,'骑友已离开');};
  }
  private deadline(link:Link){
    link.timer=window.setTimeout(()=>{if(link.channel?.readyState!=='open')this.drop(link.id,'未能直连。请确认使用同一局域网，关闭访客 Wi-Fi 隔离后重新交换连接码。');},25000);
  }
  async invite(){
    if(this.role!=='host')throw new Error('请先创建房间。');
    if(this.invited)this.drop(this.invited);
    if(this.links.size>=MAX_PLAYERS-1)throw new Error('房间已满，最多 4 人。');
    const id=crypto.randomUUID(),link=this.makeLink(id,true);this.invited=id;
    try{
      await link.pc.setLocalDescription(await link.pc.createOffer());await this.gathered(link.pc);
      if(this.links.get(id)!==link)throw new Error('邀请已取消。');
      this.status='把邀请连接码发给一位骑友，收到回应码后粘贴回来';this.onChange();
      return await encodeCode({v:1,room:this.id,link:id,name:this.name,difficulty:this.difficulty,type:'offer',sdp:link.pc.localDescription!.sdp});
    }catch(e){this.drop(id);throw e;}
  }
  async join(text:string,name:string){
    const code=await decodeCode(text);if(code.type!=='offer')throw new Error('加入房间需要房主生成的邀请连接码。');
    this.leave();const epoch=this.epoch;this.role='guest';this.id=code.room;this.self=code.link;this.name=cleanName(name);this.difficulty=code.difficulty;
    try{
      await this.voice.prepare(false);if(this.epoch!==epoch)throw new Error('连接已取消。');
      const link=this.makeLink('host',false);
      await link.pc.setRemoteDescription({type:'offer',sdp:code.sdp});
      const audio=link.pc.getTransceivers().find(t=>t.receiver.track.kind==='audio');
      if(!audio)throw new Error('这个邀请缺少语音连接，请房主更新游戏后重试。');
      audio.direction='sendrecv';await audio.sender.replaceTrack(this.voice.outgoing('host'));
      await link.pc.setLocalDescription(await link.pc.createAnswer());await this.gathered(link.pc);
      if(this.epoch!==epoch)throw new Error('连接已取消。');
      this.status='把回应连接码发回房主，等待房主确认';this.onChange();
      return await encodeCode({...code,name:this.name,type:'answer',sdp:link.pc.localDescription!.sdp});
    }catch(e){if(this.epoch===epoch)this.leave();throw e;}
  }
  async accept(text:string){
    const code:ConnectionCode=await decodeCode(text);
    if(this.role!=='host'||code.type!=='answer'||code.room!==this.id||code.link!==this.invited)throw new Error('回应码与当前邀请不匹配，每位骑友需要单独生成一次邀请。');
    const link=this.links.get(code.link);if(!link)throw new Error('邀请已失效，请重新生成。');
    this.members.set(code.link,{id:code.link,name:code.name,best:0,mic:false,frame:null});
    try{await link.pc.setRemoteDescription({type:'answer',sdp:code.sdp});this.deadline(link);this.status='正在建立直连';this.onChange();}
    catch{this.drop(code.link);throw new Error('回应码无法建立连接，请重新邀请。');}
  }
  private send(link:Link|undefined,message:unknown){
    if(link?.channel?.readyState==='open'&&link.channel.bufferedAmount<128000)link.channel.send(JSON.stringify(message));
  }
  private broadcast(message:unknown){for(const link of this.links.values())this.send(link,message);}
  private receive(link:Link,message:any){
    if(!message||typeof message!=='object')return;
    if(this.role==='host'){
      const member=this.members.get(link.id);if(!member)return;
      if(message.type==='frame'&&validFrame(message.frame)){
        member.frame=message.frame;member.best=Math.max(member.best,message.frame.distance);
        // Forward on receipt so a background host's render rate cannot slow other riders.
        this.broadcast({type:'peer-frame',member});this.onChange();return;
      }
      if(message.type==='mic'&&typeof message.value==='boolean'){member.mic=message.value;return;}
      if(message.type==='chat'&&typeof message.text==='string'&&performance.now()-link.lastChat>700){
        link.lastChat=performance.now();this.addChat(member.id,member.name,message.text,true);
      }
      return;
    }
    if(this.role!=='guest'||link.id!=='host')return;
    if(message.type==='peer-frame'&&validMember(message.member)&&this.members.has(message.member.id)){
      this.members.set(message.member.id,message.member);this.onChange();return;
    }
    if(message.type==='welcome'&&message.room===this.id&&message.self===this.self&&isDifficulty(message.difficulty)&&
      Array.isArray(message.members)&&message.members.length<=MAX_PLAYERS&&message.members.every(validMember)){
      this.difficulty=message.difficulty;this.members=new Map(message.members.map((m:Member)=>[m.id,m]));
      this.onEnter();this.onChange();return;
    }
    if(message.type==='state'&&Array.isArray(message.members)&&message.members.length<=MAX_PLAYERS&&message.members.every(validMember)){
      this.members=new Map(message.members.map((m:Member)=>[m.id,m]));this.onChange();return;
    }
    if(message.type==='chat'&&typeof message.id==='string'&&typeof message.name==='string'&&typeof message.text==='string')this.addChat(message.id,cleanName(message.name),message.text,false);
    if(message.type==='closed')this.leave('房主已关闭房间');
  }
  tick(frame:RideFrame,now:number){
    if(this.role==='none'||now-this.lastSend<80)return;this.lastSend=now;
    const me=this.members.get(this.self);
    if(me){me.frame=frame;me.best=Math.max(me.best,frame.distance);me.mic=this.voice.enabled;}
    if(this.role==='host')this.broadcast({type:'state',members:[...this.members.values()]});
    else if(me)this.send(this.links.get('host'),{type:'frame',frame});
    this.onChange();
  }
  chat(text:string){
    if(!this.members.has(this.self)||performance.now()-this.lastChat<700)return;
    this.lastChat=performance.now();
    if(this.role==='host')this.addChat(this.self,this.name,text,true);
    else this.send(this.links.get('host'),{type:'chat',text:text.slice(0,200)});
  }
  private addChat(id:string,name:string,value:string,relay:boolean){
    const text=value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,200);if(!text)return;
    const chat={id,name,text,time:Date.now()};this.chats.push(chat);if(this.chats.length>50)this.chats.shift();
    if(relay)this.broadcast({type:'chat',...chat});this.onChange();
  }
  private drop(id:string,status?:string){
    const link=this.links.get(id);if(!link)return;this.links.delete(id);clearTimeout(link.timer);link.pc.close();
    this.voice.remove(id);this.members.delete(id);if(this.invited===id)this.invited=null;
    if(this.role==='guest'){this.leave(status||'已离开房间');return;}
    if(status)this.status=status;this.onChange();
  }
  leave(status='尚未连接'){
    this.epoch++;if(this.role==='host')this.broadcast({type:'closed'});
    const wasActive=this.role!=='none';this.role='none';
    const links=[...this.links.values()];this.links.clear();for(const link of links){clearTimeout(link.timer);link.pc.close();}
    this.voice.close();this.members.clear();this.chats=[];this.invited=null;this.self='';this.id='';this.status=status;
    if(wasActive)this.onLeave();this.onChange();
  }
  diagnostics(){return {role:this.role,status:this.status,self:this.self,members:[...this.members.values()].map(m=>({...m,frame:m.frame?{p:m.frame.p,distance:m.frame.distance,paused:m.frame.paused}:null})),links:[...this.links.values()].map(l=>({id:l.id,state:l.pc.connectionState,channel:l.channel?.readyState})),voice:this.voice.diagnostics(),chats:this.chats};}
  async stats(){
    return Promise.all([...this.links.values()].map(async link=>{
      const report=await link.pc.getStats();let received=0,sent=0,energy=0,sourceEnergy=0;
      report.forEach(stat=>{if(stat.type==='inbound-rtp'&&stat.kind==='audio'){received+=stat.bytesReceived||0;energy+=stat.totalAudioEnergy||0;}if(stat.type==='outbound-rtp'&&stat.kind==='audio')sent+=stat.bytesSent||0;if(stat.type==='media-source'&&stat.kind==='audio')sourceEnergy+=stat.totalAudioEnergy||0;});
      return {id:link.id,received,sent,energy,sourceEnergy};
    }));
  }
}
