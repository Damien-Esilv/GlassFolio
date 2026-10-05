#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const rawSubject = process.argv.slice(2).join(' ').trim();
const subject = rawSubject || 'general';
const date = new Date().toISOString().slice(0, 10);
const safeSubject = subject
  .replace(/\s+/g, '-')
  .replace(/[^a-zA-Z0-9-_]/g, '')
  .toLowerCase();

const brainPath = process.env.BRAIN_PATH || '/Users/damien/Developpement/brain/GlassFolio';
const sessionsDir = path.join(brainPath, '05-Sessions-IA');
const templatePath = path.join(sessionsDir, 'Session-TEMPLATE.md');

if (!fs.existsSync(sessionsDir)) {
  console.error('Sessions directory not found:', sessionsDir);
  process.exit(1);
}

let template = `# Session ${date} — ${subject}\n\n## Features / Bugs traités\n- \n\n## Décisions architecturales\n- \n\n## Points de vigilance futurs\n- \n`;

try {
  const t = fs.readFileSync(templatePath, 'utf8');
  template = t.replace(/{{date}}/g, date).replace(/{{subject}}/g, subject);
} catch {
  // Keep default template above
}

const filename = `Session-${date}-${safeSubject}.md`;
const fullPath = path.join(sessionsDir, filename);

if (fs.existsSync(fullPath)) {
  console.error('File already exists:', fullPath);
  process.exit(1);
}

fs.writeFileSync(fullPath, template, 'utf8');
console.log('Created session note:', fullPath);
