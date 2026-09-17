export function wakeRemoteControlledCog<T extends { isLured: boolean; lureDuration?: number }>(cog: T) {
  cog.isLured = false;
  cog.lureDuration = 0;
}

