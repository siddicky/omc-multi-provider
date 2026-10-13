import { isCliAvailable, isMuseCliAvailable, type CliAgentType } from '../../team/model-contract.js';

export interface SkillRuntimeAvailability {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
  grok: boolean;
  antigravity: boolean;
  muse?: boolean;
}

export type SkillRuntimeProvider = CliAgentType | 'muse';

/**
 * External CLIs that `omc ask` can run as the Critic pass, in display order.
 * Keep in sync with RALPH_EXTERNAL_CRITIC_LABELS in src/hooks/ralph/loop.ts
 * (kept separate so features/ does not import hooks/).
 */
const EXTERNAL_CRITIC_PROVIDERS = [
  { key: 'codex', label: 'Codex' },
  { key: 'muse', label: 'Muse' },
  { key: 'grok', label: 'Grok' },
] as const;

type ExternalCriticProvider = (typeof EXTERNAL_CRITIC_PROVIDERS)[number];

function isSkillRuntimeProviderAvailable(provider: SkillRuntimeProvider): boolean {
  return provider === 'muse' ? isMuseCliAvailable() : isCliAvailable(provider);
}

export function detectSkillRuntimeAvailability(
  detector: (agentType: SkillRuntimeProvider) => boolean = isSkillRuntimeProviderAvailable,
): SkillRuntimeAvailability {
  const safeDetect = (agentType: SkillRuntimeProvider): boolean => {
    try {
      return detector(agentType);
    } catch {
      return false;
    }
  };
  return {
    claude: safeDetect('claude'),
    codex: safeDetect('codex'),
    gemini: safeDetect('gemini'),
    grok: safeDetect('grok'),
    antigravity: safeDetect('antigravity'),
    muse: safeDetect('muse'),
  };
}

function availableExternalCritics(availability: SkillRuntimeAvailability): ExternalCriticProvider[] {
  return EXTERNAL_CRITIC_PROVIDERS.filter(({ key }) => availability[key] === true);
}

function normalizeSkillName(skillName: string): string {
  return skillName.trim().toLowerCase();
}

function renderPlanRuntimeGuidance(availability: SkillRuntimeAvailability): string {
  const critics = availableExternalCritics(availability);
  if (critics.length === 0) {
    return '';
  }

  return [
    '## Provider Runtime Availability',
    ...critics.map(({ key, label }) => key === 'codex'
      ? 'Codex CLI is installed and available. When `--architect codex` or `--critic codex` flags are present, use `omc ask codex --agent-prompt <role> "<prompt>"` for those passes. Do NOT report Codex as unavailable.'
      : `${label} CLI is installed and available. When the \`--critic ${key}\` flag is present, use \`omc ask ${key} --agent-prompt critic "<prompt>"\` for the Critic pass. Do NOT report ${label} as unavailable.`),
  ].join('\n');
}

function renderRalphRuntimeGuidance(availability: SkillRuntimeAvailability): string {
  const critics = availableExternalCritics(availability);
  if (critics.length === 0) {
    return '';
  }

  return [
    '## Provider Runtime Availability',
    ...critics.map(({ key, label }) =>
      `${label} CLI is installed and available. When \`--critic=${key}\` is set, use \`omc ask ${key} --agent-prompt critic "<prompt>"\` for the approval pass. Do NOT report ${label} as unavailable.`),
  ].join('\n');
}

function renderDeepInterviewRuntimeGuidance(availability: SkillRuntimeAvailability): string {
  if (!availability.codex) {
    return '';
  }

  return [
    '## Provider-Aware Execution Recommendations',
    'When Phase 5 presents post-interview execution choices, keep the Claude-only defaults above and add these Codex variants because Codex CLI is available:',
    '',
    '- `/ralplan --architect codex "<spec or task>"` — Codex handles the architect pass; best for implementation-heavy design review; higher cost than Claude-only ralplan.',
    '- `/ralplan --critic codex "<spec or task>"` — Codex handles the critic pass; cheaper than moving the full loop off Claude; strong second-opinion review.',
    '- `/ralph --critic codex "<spec or task>"` — Ralph still executes normally, but final verification goes through the Codex critic; smallest multi-provider upgrade.',
    '',
    'If Codex becomes unavailable, briefly note that and fall back to the Claude-only recommendations already listed in Phase 5.',
  ].join('\n');
}

export function renderSkillRuntimeGuidance(
  skillName: string,
  availability?: SkillRuntimeAvailability,
): string {
  switch (normalizeSkillName(skillName)) {
    case 'deep-interview':
      return renderDeepInterviewRuntimeGuidance(availability ?? detectSkillRuntimeAvailability());
    case 'ralplan':
    case 'omc-plan':
    case 'plan':
      return renderPlanRuntimeGuidance(availability ?? detectSkillRuntimeAvailability());
    case 'ralph':
      return renderRalphRuntimeGuidance(availability ?? detectSkillRuntimeAvailability());
    default:
      return '';
  }
}
