import type { Bicycle } from '../physics/bicycle';
import { isDifficulty, type Difficulty } from '../difficulty';

export const MAX_PLAYERS=4;
export const MAX_PACKET=48000;
export type Point=[number,number,number];
export type Rotation=[number,number,number,number];
export interface Pose {p:Point;q:Rotation}
export interface RideFrame extends Pose {
  steer:number;crank:number;wheels:number[];body:number[];brakes:number[];
  feet:boolean[];contacts:boolean[];foot:Point[];pushes:number[];feedback:number[];
  fallen:boolean;ragdoll:Pose[];distance:number;speed:number;paused:boolean;
}
export interface Member {id:string;name:string;best:number;mic:boolean;frame:RideFrame|null}
export interface Chat {id:string;name:string;text:string;time:number}
export interface ConnectionCode {v:1;room:string;link:string;name:string;difficulty:Difficulty;type:'offer'|'answer';sdp:string}
export const cleanName=(value:string)=>value.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,16)||'骑友';
const point=(p:{x:number;y:number;z:number}):Point=>[p.x,p.y,p.z];
const pose=(b:{translation():{x:number;y:number;z:number};rotation():{x:number;y:number;z:number;w:number}}):Pose=>{
  const q=b.rotation();return {p:point(b.translation()),q:[q.x,q.y,q.z,q.w]};
};
export function captureFrame(b:Bicycle,paused:boolean):RideFrame {
  return {...pose(b.body),steer:b.steer,crank:b.crankAngle,wheels:[b.wheels[0].angle,b.wheels[1].angle],
    body:[b.bodyX,b.bodyZ],brakes:[...b.brakes],feet:[...b.feet],contacts:[...b.footContacts],
    foot:b.footWorld.map(point),pushes:[...b.pushes],feedback:[b.feedback.bump,b.feedback.push],
    fallen:b.fallen,ragdoll:b.ragdoll.map(pose),distance:b.rideDistance,speed:Math.abs(b.speed),paused};
}
const numbers=(v:unknown,n:number,limit=1e7):v is number[]=>Array.isArray(v)&&v.length===n&&v.every(x=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=limit);
const flags=(v:unknown)=>Array.isArray(v)&&v.length===2&&v.every(x=>typeof x==='boolean');
const validPose=(v:any)=>v&&numbers(v.p,3,10000)&&numbers(v.q,4,1.01)&&Math.abs(v.q.reduce((s:number,x:number)=>s+x*x,0)-1)<.05;
export function validFrame(v:any):v is RideFrame {
  return !!v&&validPose(v)&&typeof v.steer==='number'&&Number.isFinite(v.steer)&&Math.abs(v.steer)<1&&
    Number.isFinite(v.crank)&&Math.abs(v.crank)<1e7&&numbers(v.wheels,2)&&numbers(v.body,2,1)&&numbers(v.brakes,2,1)&&
    flags(v.feet)&&flags(v.contacts)&&Array.isArray(v.foot)&&v.foot.length===2&&v.foot.every((p:unknown)=>numbers(p,3,10000))&&
    numbers(v.pushes,2,1)&&numbers(v.feedback,2,1)&&typeof v.fallen==='boolean'&&typeof v.paused==='boolean'&&
    Array.isArray(v.ragdoll)&&v.ragdoll.length===(v.fallen?7:0)&&v.ragdoll.every(validPose)&&
    Number.isFinite(v.distance)&&v.distance>=0&&v.distance<1e7&&Number.isFinite(v.speed)&&v.speed>=0&&v.speed<200;
}
export function validMember(v:any):v is Member {
  return !!v&&typeof v.id==='string'&&v.id.length<=64&&typeof v.name==='string'&&v.name===cleanName(v.name)&&
    Number.isFinite(v.best)&&v.best>=0&&v.best<1e7&&typeof v.mic==='boolean'&&(v.frame===null||validFrame(v.frame));
}
export async function encodeCode(code:ConnectionCode){
  const raw=new TextEncoder().encode(JSON.stringify(code));
  const compressed=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  return 'BIKE1.'+btoa(String.fromCharCode(...compressed));
}
export async function decodeCode(text:string):Promise<ConnectionCode>{
  const token=text.replace(/\s/g,'');
  if(!token.startsWith('BIKE1.')||token.length>24000)throw new Error('连接码格式不正确，请复制完整的 BIKE1 连接码。');
  let value:any;
  try{
    const bytes=Uint8Array.from(atob(token.slice(6)),c=>c.charCodeAt(0));
    const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32000){await reader.cancel();throw new Error('large');}chunks.push(part.value);}
    const merged=new Uint8Array(size);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length;}
    value=JSON.parse(new TextDecoder().decode(merged));
  }catch{throw new Error('连接码无法读取，请重新复制。');}
  if(value?.v!==1||!['offer','answer'].includes(value.type)||typeof value.sdp!=='string'||!value.sdp.startsWith('v=0')||
    typeof value.room!=='string'||value.room.length>64||typeof value.link!=='string'||value.link.length>64||
    typeof value.name!=='string'||!isDifficulty(value.difficulty))throw new Error('连接码不属于这个版本的游戏。');
  return {...value,name:cleanName(value.name)};
}
