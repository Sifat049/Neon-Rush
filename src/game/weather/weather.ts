export type WeatherId = 'clear' | 'rain' | 'fog' | 'storm' | 'sunset' | 'night' | 'sandstorm';

export interface WeatherPreset {
  id: WeatherId;
  name: string;
  icon: string;
  /** null = keep the track's own colour */
  fogColor: string | null;
  fogNearMul: number;
  fogFarMul: number;
  skyTop: string | null;
  skyBottom: string | null;
  /** 0..1 how wet / reflective the road is */
  wet: number;
  /** 0..1 rain intensity (particles) */
  rain: number;
  lightning: boolean;
  /** multiplies lateral grip (steering) */
  grip: number;
  /** 1 = normal; <1 darker scene (night), >1 brighter */
  light: number;
  /** headlight beam intensity 0..1 (shown when it is dark / bad weather) */
  headlights: number;
  /** 0..1 blowing sand particles */
  dust: number;
}

export const WEATHERS: Record<WeatherId, WeatherPreset> = {
  clear:  { id: 'clear',  name: 'CLEAR',        icon: '☀', fogColor: null,      fogNearMul: 1,    fogFarMul: 1,    skyTop: null,      skyBottom: null,      wet: 0,    rain: 0,    lightning: false, grip: 1,    light: 1,    headlights: 0.2, dust: 0 },
  rain:   { id: 'rain',   name: 'HEAVY RAIN',   icon: '☂', fogColor: '#0a1230', fogNearMul: 0.8,  fogFarMul: 0.65, skyTop: '#03060f', skyBottom: '#10204a', wet: 1,    rain: 1,    lightning: false, grip: 0.9,  light: 0.85, headlights: 0.8, dust: 0 },
  fog:    { id: 'fog',    name: 'DENSE FOG',    icon: '≋', fogColor: '#1b2142', fogNearMul: 0.35, fogFarMul: 0.22, skyTop: '#10152e', skyBottom: '#2a3160', wet: 0.25, rain: 0,    lightning: false, grip: 1,    light: 0.85, headlights: 1, dust: 0 },
  storm:  { id: 'storm',  name: 'THUNDERSTORM', icon: '⚡', fogColor: '#0b0c22', fogNearMul: 0.7,  fogFarMul: 0.55, skyTop: '#020208', skyBottom: '#1a1038', wet: 1,    rain: 1,    lightning: true,  grip: 0.84, light: 0.75, headlights: 0.9, dust: 0 },
  sunset: { id: 'sunset', name: 'SUNSET',       icon: '◐', fogColor: '#3a1030', fogNearMul: 1,    fogFarMul: 0.9,  skyTop: '#2a0f4a', skyBottom: '#ff6a3d', wet: 0,    rain: 0,    lightning: false, grip: 1,    light: 1.15, headlights: 0.3, dust: 0 },
  sandstorm: { id: 'sandstorm', name: 'SANDSTORM', icon: '〰', fogColor: '#7a4a22', fogNearMul: 0.3, fogFarMul: 0.2, skyTop: '#4a2a1a', skyBottom: '#c9803a', wet: 0, rain: 0, lightning: false, grip: 0.93, light: 0.95, headlights: 0.9, dust: 1 },
  night:  { id: 'night',  name: 'NIGHT',        icon: '☾', fogColor: null,      fogNearMul: 1,    fogFarMul: 1,    skyTop: null,      skyBottom: null,      wet: 0,    rain: 0,    lightning: false, grip: 1,    light: 0.9,  headlights: 0.6, dust: 0 },
};
export const WEATHER_LIST = Object.values(WEATHERS);
export const isWeatherId = (v: unknown): v is WeatherId => typeof v === 'string' && v in WEATHERS;
