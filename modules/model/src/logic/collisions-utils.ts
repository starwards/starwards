import { Circle, Response } from 'detect-collisions';

export type SWBody = Circle;
export interface SWResponse extends Response {
    a: SWBody;
    b: SWBody;
}
