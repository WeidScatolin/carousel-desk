export type ProviderName = 'nvidia' | 'claude';

export type ProviderTask = 'THEME_SUGGESTION' | 'IMAGE_ANALYSIS' | 'COPYWRITING';

const ENV_VAR_BY_TASK: Record<ProviderTask, string> = {
  THEME_SUGGESTION: 'PROVIDER_THEME_SUGGESTION',
  IMAGE_ANALYSIS: 'PROVIDER_IMAGE_ANALYSIS',
  COPYWRITING: 'PROVIDER_COPYWRITING',
};

export function resolveProvider(
  task: ProviderTask,
  env: NodeJS.ProcessEnv = process.env
): ProviderName {
  const envVarName = ENV_VAR_BY_TASK[task];
  const value = env[envVarName];

  if (value === 'nvidia' || value === 'claude') {
    return value;
  }

  throw new Error(
    `Missing or invalid ${envVarName} — expected "nvidia" or "claude", got "${String(value)}"`
  );
}
