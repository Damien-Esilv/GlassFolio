import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { m } from 'motion/react';
import { Github, Sparkles, ShieldAlert } from 'lucide-react';
import { LandingHeader } from '../components/landing/LandingHeader';
import { LandingFooter } from '../components/landing/LandingFooter';
import { LandingMotionProvider } from '../components/landing/motion/LandingMotionProvider';
import { CodeBlock } from '../components/landing/CodeBlock';
import { useDemoAccess } from '../hooks/useDemoAccess';
import {
  DOCKER_QUICKSTART_COMMANDS,
  GITHUB_REPO_URL,
  SELF_HOST_DEFAULT_URL,
  buildPublicPagePath,
} from '../config/project';

/** Shell commands shown on the page. They mirror package.json scripts and docker-compose.yml. */
const COMMANDS = {
  logs: ['npm run docker:logs'],
  stop: ['npm run docker:down'],
  expose: ['GLASSFOLIO_BIND=0.0.0.0 GLASSFOLIO_ACCESS_TOKEN=$(openssl rand -hex 16) npm run docker:up'],
  backup: ['docker run --rm --volumes-from glassfolio-app -v "$PWD":/backup alpine tar czf /backup/glassfolio-data.tgz -C /data .'],
  restore: [
    'docker stop glassfolio-app',
    'docker run --rm --volumes-from glassfolio-app -v "$PWD":/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/glassfolio-data.tgz -C /data"',
    'docker start glassfolio-app',
  ],
  update: ['git pull', 'npm run docker:up'],
  ollama: ['OLLAMA_ORIGINS=http://localhost:3000 ollama serve'],
} as const;

const ENV_VARIABLES = [
  { name: 'GLASSFOLIO_PORT', fallback: '3000' },
  { name: 'GLASSFOLIO_BIND', fallback: '127.0.0.1' },
  { name: 'GLASSFOLIO_DATA', fallback: 'glassfolio-data' },
  { name: 'GLASSFOLIO_ACCESS_TOKEN', fallback: '' },
  { name: 'GLASSFOLIO_ALLOWED_HOSTS', fallback: '' },
  { name: 'GLASSFOLIO_CSP_CONNECT_SRC', fallback: '' },
] as const;

const SECTIONS = ['quickstart', 'requirements', 'configuration', 'network', 'backup', 'update', 'ai'] as const;
type SectionId = (typeof SECTIONS)[number];

/** Highlights the section currently under the sticky header. */
function useActiveSection(): SectionId {
  const [active, setActive] = useState<SectionId>(SECTIONS[0]);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length > 0) setActive(visible[0].target.id as SectionId);
      },
      { rootMargin: '-80px 0px -65% 0px' }
    );
    for (const id of SECTIONS) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

const Section: React.FC<{ id: SectionId; children: React.ReactNode }> = ({ id, children }) => {
  const { t } = useTranslation();
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 pb-12 mb-12 border-b border-subtle last:border-b-0">
      <h2 id={`${id}-title`} className="text-2xl font-bold tracking-tight text-primary mb-4">
        {t(`selfhost:sections.${id}.title`)}
      </h2>
      {children}
    </section>
  );
};

const Prose: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[15px] text-secondary leading-relaxed max-w-prose mb-3">{children}</p>
);

const SelfHost: React.FC = () => {
  const { t } = useTranslation();
  const { launchDemo, isLaunchingDemo } = useDemoAccess();
  const active = useActiveSection();

  const scrollTo = (event: React.MouseEvent<HTMLAnchorElement>, id: SectionId): void => {
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <LandingMotionProvider>
      <div className="min-h-screen bg-canvas text-primary font-display flex flex-col">
        <LandingHeader />

        <main className="flex-1">
          <div className="relative overflow-hidden border-b border-subtle">
            <div className="landing-grid" aria-hidden="true" />
            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-12 lg:pt-20"
            >
              <Link to={buildPublicPagePath('') || '/'} className="text-sm font-semibold text-brand hover:underline">
                {t('selfhost:backToHome')}
              </Link>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-primary mt-4 mb-5 text-balance">
                {t('selfhost:title')}
              </h1>
              <p className="text-lg text-secondary leading-relaxed max-w-2xl mb-8">{t('selfhost:intro')}</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap bg-primary hover:bg-primary-hover text-white text-sm font-bold px-5 py-3 rounded-xl shadow-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-canvas"
                >
                  <Github size={17} />
                  <span>{t('selfhost:ctaGithub')}</span>
                </a>
                <button
                  type="button"
                  onClick={() => launchDemo('/')}
                  disabled={isLaunchingDemo}
                  className="inline-flex items-center justify-center gap-2 whitespace-nowrap bg-subtle hover:bg-card-hover border border-subtle text-primary text-sm font-bold px-5 py-3 rounded-xl transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <Sparkles size={16} className="text-secondary" />
                  <span>{t('selfhost:ctaDemo')}</span>
                </button>
              </div>
            </m.div>
          </div>

          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 grid lg:grid-cols-[13rem_1fr] gap-10 lg:gap-14">
            <nav aria-label={t('selfhost:tocLabel')} className="hidden lg:block">
              <ol className="sticky top-24 space-y-1 text-sm border-l border-subtle">
                {SECTIONS.map((id) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      onClick={(event) => scrollTo(event, id)}
                      aria-current={active === id ? 'location' : undefined}
                      className={`block -ml-px pl-4 py-1.5 border-l-2 transition-colors ${
                        active === id
                          ? 'border-brand text-primary font-semibold'
                          : 'border-transparent text-secondary hover:text-primary'
                      }`}
                    >
                      {t(`selfhost:sections.${id}.title`)}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="min-w-0">
              <Section id="quickstart">
                <Prose>{t('selfhost:sections.quickstart.body')}</Prose>
                <CodeBlock lines={DOCKER_QUICKSTART_COMMANDS} label={t('selfhost:sections.quickstart.title')} />
                <Prose>{t('selfhost:sections.quickstart.open', { url: SELF_HOST_DEFAULT_URL })}</Prose>
                <h3 className="text-base font-bold text-primary mt-6 mb-1">{t('selfhost:sections.quickstart.dailyTitle')}</h3>
                <Prose>{t('selfhost:sections.quickstart.logs')}</Prose>
                <CodeBlock lines={COMMANDS.logs} label={t('selfhost:sections.quickstart.logs')} />
                <Prose>{t('selfhost:sections.quickstart.stop')}</Prose>
                <CodeBlock lines={COMMANDS.stop} label={t('selfhost:sections.quickstart.stop')} />
              </Section>

              <Section id="requirements">
                <ul className="space-y-2 text-[15px] text-secondary list-disc pl-5 max-w-prose">
                  {(['docker', 'node', 'git', 'resources'] as const).map((key) => (
                    <li key={key}>{t(`selfhost:sections.requirements.items.${key}`)}</li>
                  ))}
                </ul>
              </Section>

              <Section id="configuration">
                <Prose>{t('selfhost:sections.configuration.body')}</Prose>
                <div className="overflow-x-auto rounded-xl border border-subtle mt-4">
                  <table className="w-full min-w-[36rem] text-sm text-left">
                    <thead className="bg-subtle">
                      <tr>
                        <th scope="col" className="px-4 py-2.5 font-semibold text-primary">{t('selfhost:sections.configuration.variable')}</th>
                        <th scope="col" className="px-4 py-2.5 font-semibold text-primary">{t('selfhost:sections.configuration.default')}</th>
                        <th scope="col" className="px-4 py-2.5 font-semibold text-primary">{t('selfhost:sections.configuration.purpose')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ENV_VARIABLES.map(({ name, fallback }) => (
                        <tr key={name} className="border-t border-subtle align-top">
                          <th scope="row" className="px-4 py-3 font-mono text-xs font-semibold text-primary whitespace-nowrap">{name}</th>
                          <td className="px-4 py-3 font-mono text-xs text-secondary whitespace-nowrap">
                            {fallback || t('selfhost:sections.configuration.empty')}
                          </td>
                          <td className="px-4 py-3 text-secondary">{t(`selfhost:sections.configuration.vars.${name}`)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section id="network">
                <Prose>{t('selfhost:sections.network.body')}</Prose>
                <CodeBlock lines={COMMANDS.expose} label={t('selfhost:sections.network.title')} />
                <Prose>{t('selfhost:sections.network.login')}</Prose>
                <div className="flex gap-3 p-4 rounded-xl border border-subtle bg-subtle text-sm text-secondary max-w-prose mt-4">
                  <ShieldAlert size={18} className="text-warning shrink-0 mt-0.5" />
                  <p>{t('selfhost:sections.network.proxy')}</p>
                </div>
              </Section>

              <Section id="backup">
                <Prose>{t('selfhost:sections.backup.body')}</Prose>
                <CodeBlock lines={COMMANDS.backup} label={t('selfhost:sections.backup.title')} />
                <Prose>{t('selfhost:sections.backup.restore')}</Prose>
                <CodeBlock lines={COMMANDS.restore} label={t('selfhost:sections.backup.restoreLabel')} />
              </Section>

              <Section id="update">
                <Prose>{t('selfhost:sections.update.body')}</Prose>
                <CodeBlock lines={COMMANDS.update} label={t('selfhost:sections.update.title')} />
              </Section>

              <Section id="ai">
                <Prose>{t('selfhost:sections.ai.body')}</Prose>
                <CodeBlock lines={COMMANDS.ollama} label={t('selfhost:sections.ai.title')} />
                <Prose>{t('selfhost:sections.ai.settings')}</Prose>
                <Prose>{t('selfhost:sections.ai.remote')}</Prose>
              </Section>
            </div>
          </div>
        </main>

        <LandingFooter />
      </div>
    </LandingMotionProvider>
  );
};

export default SelfHost;
