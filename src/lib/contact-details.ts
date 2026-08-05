export const PLANYX_EMAIL = 'contact@jagroupservices.co.uk';
export const DATA_PROTECTION_EMAIL = 'dpo@jagroupservices.co.uk';
export const GROUP_CONTACT_EMAIL = 'hello@jagroupservices.co.uk';
export const GROUP_PHONE_DISPLAY = '020 3834 2790';
export const GROUP_PHONE_HREF = 'tel:+442038342790';

/** Keep database-managed legal copy aligned with the approved contact channels. */
export function normaliseContactDetails(html: string, dataRelated = false): string {
  const target = dataRelated ? DATA_PROTECTION_EMAIL : PLANYX_EMAIL;
  return html
    .replace(/(?:support@jagroupservices\.co\.uk|support@planyx\.com|legal@jagroupservices\.co\.uk)/gi, target)
    .replace(/privacy@jagroupservices\.co\.uk/gi, DATA_PROTECTION_EMAIL)
    .replace(/hello@jagroupserices\.co\.uk/gi, GROUP_CONTACT_EMAIL);
}
