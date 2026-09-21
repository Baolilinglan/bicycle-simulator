export const difficulties = {
  training: { name:'辅助轮难度', caption:'体验有辅助轮的畅快自行车生活', help:'双脚已在踏板上，直接交替踩踏即可起步。辅助轮负责支撑，松开踏板会继续滑行。' },
  standard: { name:'平衡练习难度', caption:'轻松起步，慢慢找到平衡', help:'按住左踏蹬地、右踏发力；起步后自动收起支撑脚。转弯有平衡辅助，停车时可以伸脚支撑。' },
  extreme: { name:'暴力铃兰难度', caption:'体验暴力铃兰骑自行车的痛苦', help:'保留原始物理。落脚、蹬地、收脚和平衡都由你控制。' },
} as const;
export type Difficulty = keyof typeof difficulties;
export const isDifficulty = (value:unknown):value is Difficulty => typeof value==='string' && Object.hasOwn(difficulties,value);
