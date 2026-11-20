const warned = new Set();

export function readEnv(name, legacyName, env = process.env, logger = console) {
  if (env[name] !== undefined) return env[name];
  if (legacyName && env[legacyName] !== undefined) {
    if (!warned.has(legacyName)) {
      warned.add(legacyName);
      logger.warn(
        `Deprecated environment variable ${legacyName}; use ${name}.`,
      );
    }
    return env[legacyName];
  }
  return undefined;
}
