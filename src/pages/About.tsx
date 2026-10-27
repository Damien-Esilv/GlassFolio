import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { Github, GraduationCap, Sparkles, ListChecks, GitBranch, FlaskConical, ShieldCheck, Rocket, BookOpen } from 'lucide-react';
import { PublicPageShell } from '../components/landing/PublicPageShell';
import { GITHUB_PROFILE_URL, GITHUB_REPO_URL, buildPublicPagePath } from '../config/project';

const NAME_PARTS = ['glass', 'folio'] as const;

const PRACTICES = [
  { key: 'tasks', icon: ListChecks },
  { key: 'cicd', icon: GitBranch },
  { key: 'tests', icon: FlaskConical },
  { key: 'security', icon: ShieldCheck },
  { key: 'delivery', icon: Rocket },
] as const;

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const linkButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold px-5 py-3 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary';

/** "The project": where the name comes from, who builds GlassFolio and how. */
const About: React.FC = () => {
  const { t } = useTranslation();

  return (
    <PublicPageShell
      title={t('about:title')}
      intro={t('about:intro')}
      actions={
        <>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className={`${linkButton} bg-primary hover:bg-primary-hover text-white shadow-lg`}>
            <Github size={17} />
            <span>{t('about:links.repo')}</span>
          </a>
          <Link to={buildPublicPagePath('/self-host')} className={`${linkButton} bg-subtle hover:bg-card-hover border border-subtle text-primary`}>
            <BookOpen size={16} className="text-secondary" />
            <span>{t('about:links.guide')}</span>
          </Link>
        </>
      }
    >
      <section aria-labelledby="about-name" className="mb-16">
        <h2 id="about-name" className="text-2xl font-bold tracking-tight text-primary mb-6">{t('about:name.title')}</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {NAME_PARTS.map((part, index) => (
            <m.div
              key={part}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ delay: index * 0.15, duration: 0.5, ease: EASE_OUT }}
              className="rounded-2xl border border-subtle bg-card p-6"
            >
              <p className="text-4xl font-extrabold tracking-tight text-brand mb-2">{t(`about:name.${part}.word`)}</p>
              <p className="text-base font-bold text-primary mb-2">{t(`about:name.${part}.meaning`)}</p>
              <p className="text-sm text-secondary leading-relaxed">{t(`about:name.${part}.body`)}</p>
            </m.div>
          ))}
        </div>
      </section>

      <section aria-labelledby="about-story" className="mb-16">
        <h2 id="about-story" className="text-2xl font-bold tracking-tight text-primary mb-6">{t('about:story.title')}</h2>
        <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start">
          <div className="w-14 h-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
            <GraduationCap size={26} />
          </div>
          <div className="space-y-4 text-[15px] text-secondary leading-relaxed max-w-prose">
            <p>{t('about:story.p1')}</p>
            <p className="flex gap-2">
              <Sparkles size={18} className="text-brand shrink-0 mt-0.5" />
              <span>{t('about:story.p2')}</span>
            </p>
            <p>
              <a href={GITHUB_PROFILE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
                <Github size={15} />
                <span>{t('about:links.profile')}</span>
              </a>
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="about-practices">
        <h2 id="about-practices" className="text-2xl font-bold tracking-tight text-primary mb-2">{t('about:practices.title')}</h2>
        <p className="text-[15px] text-secondary leading-relaxed max-w-prose mb-6">{t('about:practices.intro')}</p>
        <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
          {PRACTICES.map(({ key, icon: Icon }, index) => (
            <m.li
              key={key}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ delay: (index % 2) * 0.1, duration: 0.45, ease: EASE_OUT }}
              className="border-t-2 border-brand/30 pt-4"
            >
              <Icon size={20} className="text-brand mb-3" />
              <p className="text-sm font-bold text-primary mb-1.5">{t(`about:practices.${key}.title`)}</p>
              <p className="text-sm text-secondary leading-relaxed">{t(`about:practices.${key}.body`)}</p>
            </m.li>
          ))}
        </ul>
      </section>
    </PublicPageShell>
  );
};

export default About;
