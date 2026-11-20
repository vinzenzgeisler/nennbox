export declare function readEnv(
  name: string,
  legacyName?: string,
  env?: NodeJS.ProcessEnv,
  logger?: Pick<Console, 'warn'>,
): string | undefined;
