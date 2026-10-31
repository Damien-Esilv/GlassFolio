import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Github, Info } from 'lucide-react';
import { PublicPageShell } from '../components/landing/PublicPageShell';
import { CodeBlock } from '../components/landing/CodeBlock';
import { GITHUB_REPO_URL, buildPublicPagePath } from '../config/project';
import { MCP_CLIENT_CONFIG, MCP_RESOURCES, MCP_TOOL_GROUPS, MCP_TOOL_NAMES, MCP_VERIFY_COMMANDS } from '../config/mcpDocs';

const sectionTitle = 'text-2xl font-bold tracking-tight text-primary mb-3';
const paragraph = 'text-base text-secondary leading-relaxed';
const linkButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold px-5 py-3 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary';

/** Documentation of the MCP server: what it does today, how to connect it, and its tools. */
const Docs: React.FC = () => {
  const { t } = useTranslation();

  return (
    <PublicPageShell
      title={t('docs:title')}
      intro={t('docs:intro')}
      actions={
        <>
          <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer" className={`${linkButton} bg-primary hover:bg-primary-hover text-white shadow-lg`}>
            <Github size={17} />
            <span>{t('about:links.repo')}</span>
          </a>
          <Link to={buildPublicPagePath('/self-host')} className={`${linkButton} bg-subtle hover:bg-card-hover border border-subtle text-primary`}>
            <BookOpen size={16} className="text-secondary" />
            <span>{t('docs:more.selfHost')}</span>
          </Link>
        </>
      }
    >
      <section aria-labelledby="docs-sample" className="mb-12 rounded-2xl border border-warning/30 bg-warning/10 p-6">
        <h2 id="docs-sample" className="flex items-center gap-2 text-xl font-bold text-primary mb-2">
          <Info size={20} className="text-warning shrink-0" aria-hidden="true" />
          <span>{t('docs:sampleData.title')}</span>
        </h2>
        <p className={paragraph}>{t('docs:sampleData.body')}</p>
      </section>

      <section aria-labelledby="docs-about" className="mb-12">
        <h2 id="docs-about" className={sectionTitle}>{t('docs:about.title')}</h2>
        <p className={paragraph}>{t('docs:about.body', { tools: MCP_TOOL_NAMES.length, resources: MCP_RESOURCES.length })}</p>
      </section>

      <section aria-labelledby="docs-verify" className="mb-12">
        <h2 id="docs-verify" className={sectionTitle}>{t('docs:verify.title')}</h2>
        <p className={paragraph}>{t('docs:verify.body')}</p>
        <CodeBlock lines={MCP_VERIFY_COMMANDS} label={t('docs:verify.label')} />
      </section>

      <section aria-labelledby="docs-connect" className="mb-12">
        <h2 id="docs-connect" className={sectionTitle}>{t('docs:connect.title')}</h2>
        <p className={paragraph}>{t('docs:connect.body')}</p>
        <CodeBlock lines={MCP_CLIENT_CONFIG} label={t('docs:connect.label')} prompt={false} />
      </section>

      <section aria-labelledby="docs-tools" className="mb-12">
        <h2 id="docs-tools" className={sectionTitle}>{t('docs:tools.title')}</h2>
        <p className={`${paragraph} mb-6`}>{t('docs:tools.intro')}</p>
        <div className="space-y-8">
          {MCP_TOOL_GROUPS.map((group) => (
            <div key={group.key}>
              <h3 className="text-lg font-bold text-primary mb-3">{t(`docs:tools.groups.${group.key}`)}</h3>
              <ul className="divide-y divide-subtle rounded-2xl border border-subtle bg-card">
                {group.tools.map((tool) => (
                  <li key={tool} className="px-4 py-3 sm:flex sm:items-baseline sm:gap-4">
                    <code className="block sm:w-72 shrink-0 font-mono text-[13px] font-semibold text-brand break-all">{tool}</code>
                    <span className="block text-sm text-secondary leading-relaxed">{t(`docs:tools.items.${tool}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="docs-resources" className="mb-12">
        <h2 id="docs-resources" className={sectionTitle}>{t('docs:resources.title')}</h2>
        <p className={`${paragraph} mb-4`}>{t('docs:resources.intro')}</p>
        <ul className="divide-y divide-subtle rounded-2xl border border-subtle bg-card">
          {MCP_RESOURCES.map((resource) => (
            <li key={resource.key} className="px-4 py-3 sm:flex sm:items-baseline sm:gap-4">
              <code className="block sm:w-72 shrink-0 font-mono text-[13px] font-semibold text-brand break-all">{resource.uri}</code>
              <span className="block text-sm text-secondary leading-relaxed">{t(`docs:resources.items.${resource.key}`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="docs-more">
        <h2 id="docs-more" className={sectionTitle}>{t('docs:more.title')}</h2>
        <p className={`${paragraph} mb-4`}>{t('docs:more.body')}</p>
        <Link to={buildPublicPagePath('/contact')} className="text-sm font-semibold text-brand hover:underline">{t('docs:more.contact')}</Link>
      </section>
    </PublicPageShell>
  );
};

export default Docs;
