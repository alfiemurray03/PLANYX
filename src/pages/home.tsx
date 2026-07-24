import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import LegacyHomePage from './index';
import StandardBusinessPlans from '@/components/StandardBusinessPlans';

export default function HomePage() {
  const [pricingTarget, setPricingTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const section = document.getElementById('pricing');
    if (!section) return;
    const target = document.createElement('div');
    target.className = 'standard-business-home-plans mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8';
    section.appendChild(target);
    setPricingTarget(target);
    return () => {
      setPricingTarget(null);
      target.remove();
    };
  }, []);

  return (
    <>
      <style>{`#pricing > :not(.standard-business-home-plans){display:none!important}#pricing.standard-business-replaced{max-width:none}`}</style>
      <LegacyHomePage />
      {pricingTarget ? createPortal(
        <div>
          <div className="mb-12 text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-primary">Standard and Business pricing</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Choose the correct plan catalogue</h2>
            <p className="mx-auto mt-3 max-w-3xl text-muted-foreground">Standard Plans are for individual customers. Business Plans use separate Stripe products and organisation-specific sharing and collaboration controls.</p>
          </div>
          <StandardBusinessPlans comparisons={false} />
        </div>,
        pricingTarget,
      ) : null}
    </>
  );
}
