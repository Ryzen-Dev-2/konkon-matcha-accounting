export const OFFICIAL_PLATFORM_ORIGIN = "https://konkon.valaxscrub.com";
export const OFFICIAL_APPEAL_URL = `${OFFICIAL_PLATFORM_ORIGIN}/appeal`;
export const OFFICIAL_REPORT_URL = `${OFFICIAL_PLATFORM_ORIGIN}/report`;
export const OFFICIAL_TERMS_URL = `${OFFICIAL_PLATFORM_ORIGIN}/terms`;

export function officialPlatformUrl(path = "/") {
  return new URL(path, `${OFFICIAL_PLATFORM_ORIGIN}/`).toString();
}
