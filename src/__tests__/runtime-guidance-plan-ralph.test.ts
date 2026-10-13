import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliAgentType } from '../team/model-contract.js';
import type {
  SkillRuntimeAvailability,
  SkillRuntimeProvider,
} from '../features/builtin-skills/runtime-guidance.js';

const availability = vi.hoisted(() => ({
  claude: true,
  codex: false,
  gemini: false,
  cursor: false,
  grok: false,
  antigravity: false,
  muse: false,
}));

vi.mock('../team/model-contract.js', () => ({
  isCliAvailable: (agentType: CliAgentType) => availability[agentType],
  isMuseCliAvailable: () => availability.muse,
}));

import {
  detectSkillRuntimeAvailability,
  renderSkillRuntimeGuidance,
} from '../features/builtin-skills/runtime-guidance.js';

describe('runtime-guidance: ralplan/plan/ralph Codex availability', () => {
  beforeEach(() => {
    availability.claude = true;
    availability.codex = false;
    availability.gemini = false;
    availability.cursor = false;
    availability.grok = false;
    availability.muse = false;
  });

  describe('renderSkillRuntimeGuidance for plan-family skills', () => {
    const planSkills = ['ralplan', 'omc-plan', 'plan'] as const;

    it.each(planSkills)(
      'injects Codex availability guidance for "%s" when Codex is available',
      (skillName) => {
        availability.codex = true;
        const guidance = renderSkillRuntimeGuidance(skillName);
        expect(guidance).toContain('## Provider Runtime Availability');
        expect(guidance).toContain('Codex CLI is installed and available');
        expect(guidance).toContain('Do NOT report Codex as unavailable');
        expect(guidance).toContain('--architect codex');
        expect(guidance).toContain('--critic codex');
      },
    );

    it.each(planSkills)(
      'renders no Codex guidance for "%s" when Codex is unavailable',
      (skillName) => {
        availability.codex = false;
        const guidance = renderSkillRuntimeGuidance(skillName);
        expect(guidance).toBe('');
      },
    );
  });

  describe('renderSkillRuntimeGuidance for ralph', () => {
    it('injects critic-only guidance when Codex is available', () => {
      availability.codex = true;
      const guidance = renderSkillRuntimeGuidance('ralph');
      expect(guidance).toContain('## Provider Runtime Availability');
      expect(guidance).toContain('Codex CLI is installed and available');
      expect(guidance).toContain('--critic=codex');
      expect(guidance).not.toContain('--architect codex');
    });

    it('renders no guidance when Codex is unavailable', () => {
      availability.codex = false;
      expect(renderSkillRuntimeGuidance('ralph')).toBe('');
    });
  });

  describe('Muse and Grok critic guidance', () => {
    const only = (overrides: Partial<SkillRuntimeAvailability>): SkillRuntimeAvailability => ({
      claude: true,
      codex: false,
      gemini: false,
      grok: false,
      antigravity: false,
      muse: false,
      ...overrides,
    });

    it.each(['ralplan', 'omc-plan', 'plan'] as const)(
      'injects Muse and Grok critic guidance for "%s" without Codex',
      (skillName) => {
        const guidance = renderSkillRuntimeGuidance(skillName, only({ muse: true, grok: true }));
        expect(guidance).toContain('## Provider Runtime Availability');
        expect(guidance).toContain('Muse CLI is installed and available');
        expect(guidance).toContain('`--critic muse`');
        expect(guidance).toContain('omc ask muse --agent-prompt critic');
        expect(guidance).toContain('Grok CLI is installed and available');
        expect(guidance).toContain('`--critic grok`');
        expect(guidance).toContain('omc ask grok --agent-prompt critic');
        expect(guidance).not.toContain('Codex');
      },
    );

    it('keeps the Codex architect+critic line and lists every available critic once', () => {
      const guidance = renderSkillRuntimeGuidance('ralplan', only({ codex: true, muse: true, grok: true }));
      expect(guidance.match(/## Provider Runtime Availability/g)).toHaveLength(1);
      expect(guidance).toContain('--architect codex');
      expect(guidance.indexOf('Codex CLI')).toBeLessThan(guidance.indexOf('Muse CLI'));
      expect(guidance.indexOf('Muse CLI')).toBeLessThan(guidance.indexOf('Grok CLI'));
    });

    it('injects ralph --critic=muse / --critic=grok guidance', () => {
      const guidance = renderSkillRuntimeGuidance('ralph', only({ muse: true, grok: true }));
      expect(guidance).toContain('`--critic=muse`');
      expect(guidance).toContain('omc ask muse --agent-prompt critic');
      expect(guidance).toContain('`--critic=grok`');
      expect(guidance).toContain('omc ask grok --agent-prompt critic');
      expect(guidance).not.toContain('--architect');
    });

    it('renders nothing when no external critic CLI is available', () => {
      expect(renderSkillRuntimeGuidance('ralplan', only({ gemini: true }))).toBe('');
      expect(renderSkillRuntimeGuidance('ralph', only({ antigravity: true }))).toBe('');
    });

    it('asks the detector about muse', () => {
      const seen: SkillRuntimeProvider[] = [];
      const result = detectSkillRuntimeAvailability((provider) => {
        seen.push(provider);
        return provider === 'muse';
      });
      expect(seen).toContain('muse');
      expect(result.muse).toBe(true);
      expect(result.codex).toBe(false);
    });
  });

  describe('unrelated skills are not affected', () => {
    it('does not inject guidance for skills without Codex support', () => {
      availability.codex = true;
      expect(renderSkillRuntimeGuidance('autopilot')).toBe('');
      expect(renderSkillRuntimeGuidance('ultrawork')).toBe('');
      expect(renderSkillRuntimeGuidance('ccg')).toBe('');
    });
  });

  describe('detectSkillRuntimeAvailability safety', () => {
    it('returns false for a provider whose detector throws instead of crashing', () => {
      const throwingDetector = (agentType: SkillRuntimeProvider) => {
        if (agentType === 'codex') {
          throw new Error(
            'External LLM provider "codex" is blocked by security policy (disableExternalLLM).',
          );
        }
        return agentType === 'claude';
      };

      const result = detectSkillRuntimeAvailability(throwingDetector);
      expect(result.claude).toBe(true);
      expect(result.codex).toBe(false);
      expect(result.gemini).toBe(false);
    });

    it('returns false for all providers when detector throws for every call', () => {
      const alwaysThrows = () => {
        throw new Error('everything is broken');
      };

      const result = detectSkillRuntimeAvailability(alwaysThrows);
      expect(result.claude).toBe(false);
      expect(result.codex).toBe(false);
      expect(result.gemini).toBe(false);
    });

    it('returns correct values when detector does not throw', () => {
      availability.codex = true;
      const result = detectSkillRuntimeAvailability();
      expect(result.claude).toBe(true);
      expect(result.codex).toBe(true);
      expect(result.gemini).toBe(false);
    });
  });
});
