export function isWindowsPlatform(userAgentPlatform?: string): boolean {
  const platform = userAgentPlatform ?? navigator.platform ?? "";
  return /win/i.test(platform);
}
