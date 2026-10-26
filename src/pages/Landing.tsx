import React from 'react';
import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingHero } from '../components/landing/LandingHero';
import { LandingStats } from '../components/landing/LandingStats';
import { ProductStory } from '../components/landing/ProductStory';
import { SecuritySection } from '../components/landing/SecuritySection';
import { AiChoiceSection } from '../components/landing/AiChoiceSection';
import { FeatureBentoGrid } from '../components/landing/FeatureBentoGrid';
import { SelfHostSection } from '../components/landing/SelfHostSection';
import { FaqAccordion } from '../components/landing/FaqAccordion';
import { LandingFooter } from '../components/landing/LandingFooter';
import { LandingMotionProvider } from '../components/landing/motion/LandingMotionProvider';

/** Section order here is the header anchor order (LANDING_SECTION_ANCHORS). */
const Landing: React.FC = () => {
  return (
    <LandingMotionProvider>
    <div className="min-h-screen bg-canvas text-primary font-display flex flex-col">
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />
        <LandingStats />
        <ProductStory />
        <SecuritySection />
        <AiChoiceSection />
        <FeatureBentoGrid />
        <SelfHostSection />
        <FaqAccordion />
      </main>
      <LandingFooter />
    </div>
    </LandingMotionProvider>
  );
};

export default Landing;
