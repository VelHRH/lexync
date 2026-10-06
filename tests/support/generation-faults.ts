import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type GenerationFailureKind = 'timeout' | 'quota' | 'transport' | 'provider' | 'invalid_output';

export type GenerationFault = {
  kind?: GenerationFailureKind;
  invalid?: 'duplicate-prompts' | 'too-few-questions' | 'empty-choices' | 'no-correct-answer' | 'unknown-passage' | 'unsupported-type';
};

export const generationFaultFile = path.resolve('test-results/generation-fault.json');

export function armGenerationFault(fault: GenerationFault): void {
  mkdirSync(path.dirname(generationFaultFile), { recursive: true });
  writeFileSync(generationFaultFile, JSON.stringify(fault), 'utf8');
}

export function clearGenerationFault(): void {
  rmSync(generationFaultFile, { force: true });
}
