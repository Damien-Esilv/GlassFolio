import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('desktop release workflow', () => {
  it('builds the web app with the variables of `npm run build:local`, on every system', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
    const variables = [...scripts['build:local'].matchAll(/([A-Z_]+)=(\S+)/g)].map((match) => [match[1], match[2]] as const);
    expect(variables.length).toBeGreaterThan(0);

    // The installers are built on Windows too, where npm runs scripts with cmd.exe: no `VAR=value command` there
    const workflow = read('.github/workflows/desktop-release.yml');
    const buildJob = workflow.slice(workflow.indexOf('\n  build:'), workflow.indexOf('\n  release:'));
    const step = buildJob.slice(buildJob.indexOf('- name: Build the local web app'), buildJob.indexOf('- name: Install the desktop app dependencies'));
    expect(step).toContain('shell: bash');
    expect(step).not.toMatch(/run: npm run build:local/);
    expect(step).toMatch(/run: npx vite build/);
    variables.forEach(([name, value]) => expect(step, name).toContain(`${name}: ${value}`));
    expect(scripts['build:local']).toMatch(/vite build$/);
  });

  it('only runs the build and the release on a tag or a manual run, never on a plain branch push', () => {
    const workflow = read('.github/workflows/desktop-release.yml');
    expect(workflow).toContain("if: startsWith(github.ref, 'refs/tags/v') || github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("if: startsWith(github.ref, 'refs/tags/v')");
  });
});
