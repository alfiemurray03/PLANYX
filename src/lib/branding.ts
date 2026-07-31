import { useState, useEffect } from 'react';
import { PLANYX_EMAIL } from './contact-details';

export interface Branding {
  platform_name: string;
  platform_tagline: string;
  platform_description: string;
  platform_url: string;
  platform_logo_url: string;
  platform_favicon_url: string;
  master_brand_name: string;
  master_brand_url: string;
  legal_company_name: string;
  legal_company_number: string;
  footer_tagline: string;
  footer_show_legal_name: string;
  footer_links: string; // JSON: FooterColumn[]
  support_email: string;
  contact_email: string;
  social_twitter: string;
  social_linkedin: string;
  social_instagram: string;
  social_facebook: string;
}

const DEFAULTS: Branding = {
  platform_name: 'Planyx',
  platform_tagline: 'Personalised plans, built step by step.',
  platform_description: 'Build destination, itinerary, experience, accessibility and practical travel plans with guided Planyx tools and planning support.',
  platform_url: 'https://planyx.jagroupservices.co.uk',
  platform_logo_url: '/assets/brand/planyx-logo.svg?v=2',
  platform_favicon_url: '/assets/brand/planyx-icon.png?v=1',
  master_brand_name: 'JA Group Services Ltd',
  master_brand_url: 'https://jagroupservices.co.uk',
  legal_company_name: 'JA Group Services Ltd',
  legal_company_number: '',
  footer_tagline: 'Part of JA Group Services Ltd',
  footer_show_legal_name: '1',
  footer_links: '',
  support_email: PLANYX_EMAIL,
  contact_email: PLANYX_EMAIL,
  social_twitter: '',
  social_linkedin: '',
  social_instagram: '',
  social_facebook: '',
};

// Module-level cache so all components share one fetch
let cached: Branding | null = null;
let fetchPromise: Promise<void> | null = null;

function fetchBranding(): Promise<void> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch('/api/branding')
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        const next = { ...DEFAULTS, ...data.data } as Branding;
        next.platform_name = DEFAULTS.platform_name;
        next.platform_logo_url = DEFAULTS.platform_logo_url;
        next.platform_favicon_url = DEFAULTS.platform_favicon_url;
        next.support_email = PLANYX_EMAIL;
        next.contact_email = PLANYX_EMAIL;
        if (/document|profile/i.test(next.platform_tagline)) next.platform_tagline = DEFAULTS.platform_tagline;
        if (/document|letter|contract|invoice|profile/i.test(next.platform_description)) next.platform_description = DEFAULTS.platform_description;
        cached = next;
      }
    })
    .catch(() => {
      // silently fall back to defaults
    });
  return fetchPromise;
}

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(cached ?? DEFAULTS);

  useEffect(() => {
    if (cached) {
      setBranding(cached);
      return;
    }
    fetchBranding().then(() => {
      if (cached) setBranding(cached);
    });
  }, []);

  return branding;
}
