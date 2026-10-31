import { generate } from './game/generator';
import { Level, Tier } from './game/types';

export interface GenerateRequest {
  id: number;
  tier: Tier;
  seed: string;
}

export interface GenerateResponse {
  id: number;
  level: Level;
  par: number;
}

self.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { id, tier, seed } = e.data;
  const g = generate(tier, seed);
  const response: GenerateResponse = { id, level: g.level, par: g.solution.moves.length };
  self.postMessage(response);
};
