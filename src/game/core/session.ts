import { Race } from './race';

/** The live race lives outside React state; React only holds a key so scenes remount on (re)start. */
let current: Race | null = null;
export const getRace = () => current;
export const setRace = (r: Race | null) => { current = r; };
