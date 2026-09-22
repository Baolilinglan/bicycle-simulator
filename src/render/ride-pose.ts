import type { Bicycle } from '../physics/bicycle';

/** A render-only contract shared by the local simulation and remote snapshots. */
export type RidePose=Pick<Bicycle,'steer'|'crankAngle'|'difficulty'|'bodyX'|'bodyZ'|'feet'|'footContacts'|'footWorld'|'pushes'|'brakes'|'feedback'|'fallen'> & {
  body:Pick<Bicycle['body'],'translation'|'rotation'>;
  wheels:{angle:number}[];
  trainingWheels:{angle:number}[];
  ragdoll:Pick<Bicycle['body'],'translation'|'rotation'>[];
};
