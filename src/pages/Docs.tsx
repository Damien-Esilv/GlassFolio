import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen, Github } from 'lucide-react';
import { PublicPageShell } from '../components/landing/PublicPageShell';
import { CodeBlock } from '../components/landing/CodeBlock';
import { GITHUB_REPO_URL, SELF_HOST_DEFAULT_URL, buildPublicPagePath } from '../config/project';
import { MCP_CHECK_COMMANDS, MCP_STANDALONE_ENDPOINT, MCP_TOOLS } from '../config/mcpDocs';
import { MCP_SERVE_COMMANDS, buildClientSnippets } from '../config/mcpClients';

const sectionTitle = 'text-2xl font-bold tracking-tight text-primary mb-3';
const subTitle = 'text-lg font-bold text-primary mb-2';
const paragraph = 'text-base text-secondary leading-relaxed';
const linkButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold px-5 py-3 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-primary';
const badge = 'shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border';

const NEEDS = ['a', 'b', 'c', 'd'] as const;
const LIMITS = ['a', 'b', 'c'] as const;
/** Clients on which the connection was run for real; the others follow the same standard. */
const TESTED_CLIENT = 'Claude Code';

/** Documentation of the MCP server: how the bridge works, how to connect a client, and its tools. */
const Docs: React.FC = () => {
  const { t } = useTranslation();
  const own = buildClientSnippets({ endpoint: `${SELF_HOST_DEFAULT_URL}/mcp`, token: '<token>', ownServer: true });
  const standalone = buildClientSnippets({ endpoint: MCP_STANDALONE_ENDPOINT, token: '<token>', ownServer: false });

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
      <section aria-labelledby="docs-how" className="mb-12">
        <h2 id="docs-how" className={sectionTitle}>{t('docs:howItWorks.title')}</h2>
        <p className={paragraph}>{t('docs:howItWorks.body')}</p>
      </section>

      <section aria-labelledby="docs-needs" className="mb-12">
        <h2 id="docs-needs" className={sectionTitle}>{t('docs:needs.title')}</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          {NEEDS.map((key) => (
            <li key={key} className={paragraph}>{t(`docs:needs.${key}`)}</li>
          ))}
        </ul>
        <CodeBlock lines={MCP_CHECK_COMMANDS} label={t('docs:needs.checkLabel')} />
      </section>

      <section aria-labelledby="docs-modes" className="mb-12">
        <h2 id="docs-modes" className={sectionTitle}>{t('docs:modes.title')}</h2>
        <div className="space-y-6">
          <div>
            <h3 className={subTitle}>{t('docs:modes.local.title')}</h3>
            <p className={paragraph}>{t('docs:modes.local.body')}</p>
            <CodeBlock lines={[own.claudeCode]} label={t('docs:connect.claudeCode')} />
          </div>
          <div>
            <h3 className={subTitle}>{t('docs:modes.online.title')}</h3>
            <p className={paragraph}>{t('docs:modes.online.body')}</p>
            <CodeBlock lines={MCP_SERVE_COMMANDS} label={t('docs:modes.online.label')} />
            <CodeBlock lines={[standalone.claudeCode]} label={t('docs:connect.claudeCode')} />
          </div>
        </div>
      </section>

      <section aria-labelledby="docs-connect" className="mb-12">
        <h2 id="docs-connect" className={sectionTitle}>{t('docs:connect.title')}</h2>
        <p className={paragraph}>{t('docs:connect.body')}</p>
        <CodeBlock lines={standalone.stdioJson.split('\n')} label={t('docs:connect.stdio')} prompt={false} />
        <CodeBlock lines={standalone.codex.split('\n')} label={t('docs:connect.codex')} prompt={false} />
        <p className="text-sm text-tertiary leading-relaxed">{t('docs:connect.note')}</p>
      </section>

      <section aria-labelledby="docs-approvals" className="mb-12">
        <h2 id="docs-approvals" className={sectionTitle}>{t('docs:approvals.title')}</h2>
        <p className={paragraph}>{t('docs:approvals.body')}</p>
      </section>

      <section aria-labelledby="docs-privacy" className="mb-12">
        <h2 id="docs-privacy" className={sectionTitle}>{t('docs:privacy.title')}</h2>
        <p className={paragraph}>{t('docs:privacy.body')}</p>
      </section>

      <section aria-labelledby="docs-limits" className="mb-12">
        <h2 id="docs-limits" className={sectionTitle}>{t('docs:limits.title')}</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          {LIMITS.map((key) => (
            <li key={key} className={paragraph}>{t(`docs:limits.${key}`)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="docs-clients" className="mb-12">
        <h2 id="docs-clients" className={sectionTitle}>{t('docs:clients.title')}</h2>
        <p className={paragraph}>{t('docs:clients.body', { tested: TESTED_CLIENT })}</p>
      </section>

      <section aria-labelledby="docs-tools" className="mb-12">
        <h2 id="docs-tools" className={sectionTitle}>{t('docs:tools.title')}</h2>
        <p className={`${paragraph} mb-4`}>{t('docs:tools.intro', { count: MCP_TOOLS.length })}</p>
        <ul className="divide-y divide-subtle rounded-2xl border border-subtle bg-card">
          {MCP_TOOLS.map((tool) => (
            <li key={tool.name} className="px-4 py-3 sm:flex sm:items-baseline sm:gap-4">
              <code className="block sm:w-72 shrink-0 font-mono text-[13px] font-semibold text-brand break-all">{tool.name}</code>
              <span className="block flex-1 text-sm text-secondary leading-relaxed">{tool.description}</span>
              <span className={`${badge} mt-2 sm:mt-0 inline-block ${tool.needsApproval ? 'bg-warning/15 text-warning border-warning/30' : 'bg-subtle text-secondary border-subtle'}`}>
                {t(tool.needsApproval ? 'docs:tools.needsApproval' : 'docs:tools.readOnly')}
              </span>
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
