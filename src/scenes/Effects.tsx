import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import type { QualityCfg } from '../game/core/quality';

const CA_OFFSET = new THREE.Vector2(0.0007, 0.0007);

export function Effects({ cfg }: { cfg: QualityCfg }) {
  if (!cfg.post) return null;
  return (
    <EffectComposer multisampling={cfg.antialias ? 4 : 0}>
      <Bloom intensity={cfg.vignette ? 1.0 : 0.85} luminanceThreshold={0.7} luminanceSmoothing={0.25} mipmapBlur />
      {cfg.ca ? <ChromaticAberration offset={CA_OFFSET} radialModulation={false} modulationOffset={0} blendFunction={BlendFunction.NORMAL} /> : <></>}
      {cfg.vignette ? <Vignette darkness={0.6} offset={0.3} /> : <></>}
    </EffectComposer>
  );
}
