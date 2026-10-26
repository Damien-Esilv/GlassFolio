import React from 'react';
import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingHero } from '../components/landing/LandingHero';
import { InteractiveTaxPreview } from '../components/landing/InteractiveTaxPreview';
import { InteractiveFeePreview } from '../components/landing/InteractiveFeePreview';
import { InteractiveCsvPreview } from '../components/landing/InteractiveCsvPreview';
import { InteractiveSecurityMcpPreview } from '../components/landing/InteractiveSecurityMcpPreview';
import { FeatureBentoGrid } from '../components/landing/FeatureBentoGrid';
import { FaqAccordion } from '../components/landing/FaqAccordion';
import { LandingFooter } from '../components/landing/LandingFooter';

const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-canvas text-primary font-display flex flex-col">
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />
        <InteractiveTaxPreview />
        <InteractiveFeePreview />
        <InteractiveCsvPreview />
        <InteractiveSecurityMcpPreview />
        <FeatureBentoGrid />
        <FaqAccordion />
      </main>
      <LandingFooter />
    </div>
  );
};

export default Landing;
