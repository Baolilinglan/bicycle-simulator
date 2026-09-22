import type { Menu } from './menu';
import { RideRoom } from '../multiplayer/room';
import { difficulties } from '../difficulty';

export class MultiplayerUI {
  opened=false;
  private layer:HTMLDivElement;
  private board:HTMLDivElement;
  private busy=false;private chatSignature='';private lastCount=0;
  private q<T extends HTMLElement=HTMLElement>(id:string){return this.layer.querySelector<T>('#'+id)!;}
  constructor(public room:RideRoom,private menu:Menu){
    const root=menu.root;
    const options=document.createElement('div');options.className='menu-options';
    const settings=root.querySelector('#open-settings')!;settings.replaceWith(options);options.append(settings);
    const open=document.createElement('button');open.id='open-multiplayer';open.className='text-button';open.textContent='联机骑行';options.append(open);open.onclick=()=>this.open();
    const ride=document.createElement('button');ride.id='ride-room';ride.textContent='联机';ride.onclick=()=>this.open();root.querySelector('#ride-tools')!.append(ride);
    this.board=document.createElement('div');this.board.id='room-board';this.board.hidden=true;root.append(this.board);
    this.layer=document.createElement('div');this.layer.id='room-layer';this.layer.hidden=true;
    this.layer.innerHTML=`<section class="room-dialog" role="dialog" aria-modal="true" aria-labelledby="room-title">
      <button class="close" id="mp-close" aria-label="关闭联机房间">×</button>
      <h2 id="room-title">一起骑行</h2>
      <p id="mp-status" role="status"></p>
      <div class="room-columns"><div class="room-connect">
        <label class="room-label" for="mp-name">你的名字</label><input id="mp-name" maxlength="16" autocomplete="off" placeholder="骑友">
        <p class="room-note" id="mp-mode"></p>
        <div class="room-actions"><button class="primary" id="mp-create">创建房间</button><button class="room-button" id="mp-invite" hidden>邀请一位骑友</button><button class="room-button" id="mp-leave" hidden>离开房间</button></div>
        <label class="room-label" for="mp-incoming">收到的连接码</label><textarea id="mp-incoming" rows="2" spellcheck="false" autocomplete="off" placeholder="粘贴完整的 BIKE1 连接码"></textarea>
        <div class="room-actions"><button class="room-button" id="mp-join">加入并生成回应码</button><button class="room-button" id="mp-accept" hidden>确认骑友回应码</button></div>
        <div id="mp-outgoing-box" hidden><label class="room-label" id="mp-code-label" for="mp-outgoing">连接码</label><textarea id="mp-outgoing" readonly rows="2" spellcheck="false"></textarea><button class="room-button" id="mp-copy">复制连接码</button></div>
        <p class="room-note">同一 Wi-Fi / 局域网：房主发邀请码 → 骑友生成回应码发回 → 房主粘贴确认。每位骑友单独邀请，最多 4 人。</p>
        <p class="room-note">不使用联机或中转服务器。访客 Wi-Fi 隔离、防火墙、部分浏览器可能阻止直连。刷新页面需重新加入，房主离开则房间结束。</p>
      </div><div class="room-social">
        <h3>距离榜</h3><p class="room-note">按本房间的最长连续骑行距离排名；摔倒清零本段，保留房间最佳。所有人使用房主难度。</p>
        <div id="mp-roster"></div>
        <label class="room-check"><input type="checkbox" id="mp-show-board" checked> 骑行时显示距离榜</label>
        <div class="room-voice"><button class="room-button" id="mp-mic" aria-pressed="false">开启麦克风</button><label for="mp-volume">语音音量<input type="range" id="mp-volume" min="0" max="1" step="0.05" value="0.8"></label></div>
        <h3>房间聊天</h3><div id="mp-messages" role="log" aria-live="polite" aria-label="房间消息"></div>
        <form id="mp-chat-form"><input id="mp-chat" maxlength="200" autocomplete="off" placeholder="和骑友说点什么" aria-label="聊天内容"><button class="room-button" type="submit">发送</button></form>
      </div></div>
    </section>`;root.append(this.layer);
    try{this.q<HTMLInputElement>('mp-name').value=localStorage.getItem('bicycle.nickname')||'骑友';}catch{}
    const name=()=>{const value=this.q<HTMLInputElement>('mp-name').value;try{localStorage.setItem('bicycle.nickname',value);}catch{}return value;};
    this.q('mp-close').onclick=()=>this.close();
    this.q('mp-create').onclick=()=>void this.run(async()=>{await room.create(name(),menu.settings.difficulty);this.q<HTMLTextAreaElement>('mp-outgoing').value='';this.q('mp-outgoing-box').hidden=true;});
    this.q('mp-invite').onclick=()=>void this.run(async()=>this.showCode(await room.invite(),'邀请连接码：发给一位骑友'));
    this.q('mp-join').onclick=()=>void this.run(async()=>this.showCode(await room.join(this.q<HTMLTextAreaElement>('mp-incoming').value,name()),'回应连接码：发回房主'));
    this.q('mp-accept').onclick=()=>void this.run(async()=>{await room.accept(this.q<HTMLTextAreaElement>('mp-incoming').value);this.q<HTMLTextAreaElement>('mp-incoming').value='';});
    this.q('mp-leave').onclick=()=>{room.leave('已离开房间');this.q('mp-outgoing-box').hidden=true;this.q<HTMLTextAreaElement>('mp-incoming').value='';};
    this.q('mp-copy').onclick=()=>void this.run(async()=>{
      const field=this.q<HTMLTextAreaElement>('mp-outgoing');
      try{await navigator.clipboard.writeText(field.value);menu.toast('连接码已复制');}catch{field.focus();field.select();menu.toast('请复制已选中的连接码');}
    });
    this.q('mp-mic').onclick=()=>void this.run(()=>room.voice.toggle());
    this.q<HTMLInputElement>('mp-volume').oninput=e=>room.voice.setVolume(Number((e.target as HTMLInputElement).value));
    this.q('mp-chat-form').onsubmit=e=>{e.preventDefault();const input=this.q<HTMLInputElement>('mp-chat');room.chat(input.value);input.value='';input.focus();};
    this.layer.addEventListener('keydown',e=>{
      if(e.key==='Tab'){
        const elements=Array.from(this.layer.querySelectorAll<HTMLElement>('button,input,textarea')).filter(el=>!el.closest('[hidden]')&&!(el as HTMLButtonElement).disabled);
        const first=elements[0],last=elements.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    });
    room.onChange=()=>this.refresh();this.refresh();
  }
  private showCode(code:string,label:string){this.q<HTMLTextAreaElement>('mp-outgoing').value=code;this.q('mp-code-label').textContent=label;this.q('mp-outgoing-box').hidden=false;}
  private async run(fn:()=>Promise<unknown>){
    if(this.busy)return;this.busy=true;this.refresh();
    try{await fn();}catch(error){this.room.status=error instanceof Error?error.message:'连接失败，请重试。';}
    finally{this.busy=false;this.refresh();}
  }
  open(){this.menu.pause();this.opened=true;this.layer.hidden=false;this.refresh();this.q<HTMLInputElement>(this.room.members.has(this.room.self)?'mp-chat':'mp-name').focus();}
  close(){this.opened=false;this.layer.hidden=true;this.refresh();this.menu.root.querySelector<HTMLButtonElement>('#open-multiplayer')?.focus();}
  refresh(){
    const r=this.room,connected=r.members.has(r.self),active=r.role!=='none';
    this.q('mp-status').textContent=r.status;
    this.q('mp-mode').textContent=active?`${difficulties[r.difficulty].name} · ${r.members.size} / 4 人`:'创建时采用当前骑行难度；加入时跟随房主。';
    this.q<HTMLInputElement>('mp-name').disabled=active||this.busy;
    for(const id of ['mp-create','mp-invite','mp-join','mp-accept','mp-copy'])this.q<HTMLButtonElement>(id).disabled=this.busy;
    this.q('mp-create').hidden=active;this.q('mp-join').hidden=active;this.q('mp-invite').hidden=r.role!=='host';this.q('mp-accept').hidden=r.role!=='host';this.q('mp-leave').hidden=!active;
    this.q<HTMLInputElement>('mp-chat').disabled=!connected;
    const mic=this.q<HTMLButtonElement>('mp-mic');mic.disabled=!connected||this.busy;mic.textContent=r.voice.enabled?'关闭麦克风':'开启麦克风';mic.setAttribute('aria-pressed',String(r.voice.enabled));
    for(const id of ['welcome-difficulty','difficulty'])this.menu.root.querySelector<HTMLSelectElement>('#'+id)!.disabled=active;
    const ranked=[...r.members.values()].sort((a,b)=>b.best-a.best||a.name.localeCompare(b.name));
    const roster=this.q('mp-roster');roster.replaceChildren();this.board.replaceChildren();
    const heading=document.createElement('strong');heading.textContent='最长连续距离';this.board.append(heading);
    for(const [i,m] of ranked.entries()){
      const row=document.createElement('div');row.className='room-player';row.dataset.player=m.id;
      const label=document.createElement('span');label.textContent=`${i+1}. ${m.name}${m.id===r.self?'（你）':''}${m.mic?' · 麦开':''}`;
      const distance=document.createElement('span');distance.textContent=`${m.best.toFixed(1)} m`;
      row.append(label,distance);roster.append(row);this.board.append(row.cloneNode(true));
    }
    const signature=r.chats.map(m=>`${m.time}:${m.id}:${m.text}`).join('|');
    if(signature!==this.chatSignature){
      this.chatSignature=signature;const list=this.q('mp-messages');list.replaceChildren();
      for(const message of r.chats){const line=document.createElement('p'),name=document.createElement('strong'),text=document.createElement('span');name.textContent=message.name+'：';text.textContent=message.text;line.append(name,text);list.append(line);}list.scrollTop=list.scrollHeight;
    }
    const ride=this.menu.root.querySelector('#ride-room')!;
    if(this.opened)this.lastCount=r.chats.length;
    ride.textContent=r.chats.length>this.lastCount?'联机 •':active?`联机 ${r.members.size}`:'联机';
    this.update();
  }
  update(){this.board.hidden=!this.menu.playing||this.opened||!this.room.members.has(this.room.self)||!this.q<HTMLInputElement>('mp-show-board').checked;}
}
