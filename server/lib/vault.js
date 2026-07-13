import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const SKIP_FILES = new Set(['index.md', 'log.md']);

function stripMarkdown(text) {
  return text
    .replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function extractWikilinks(body) {
  const links = new Set();
  const re = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(body))) links.add(m[1].trim());
  return [...links];
}

async function walk(dir, root) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full, root)));
    } else if (entry.name.endsWith('.md') && !SKIP_FILES.has(entry.name)) {
      files.push(path.relative(root, full));
    }
  }
  return files;
}

export class Vault {
  constructor(vaultPath) {
    this.wikiDir = path.join(vaultPath, 'Wiki');
    this.logPath = path.join(this.wikiDir, 'log.md');
  }

  async listRelativePaths() {
    return walk(this.wikiDir, this.wikiDir);
  }

  idFor(relPath) {
    return relPath.replace(/\.md$/, '');
  }

  async readPage(relPath) {
    const full = path.join(this.wikiDir, relPath);
    const raw = await readFile(full, 'utf8');
    const { data: frontmatter, content } = matter(raw);
    const headingMatch = content.match(/^#\s+(.+)$/m);
    const filename = path.basename(relPath, '.md');
    const title = frontmatter.title || (headingMatch ? headingMatch[1].trim() : filename);
    const folder = path.dirname(relPath).split(path.sep)[0] || 'Wiki';
    const type = (frontmatter.type || folder).toString();
    const st = await stat(full);
    const date = frontmatter.updated || frontmatter.created || st.mtime.toISOString().slice(0, 10);
    const bodyNoHeading = headingMatch ? content.replace(headingMatch[0], '') : content;
    const paragraphs = bodyNoHeading
      .split(/\n\s*\n/)
      .map((block) => {
        const lines = block.trim().split('\n');
        if (lines[0]?.startsWith('#')) lines.shift();
        return lines.join('\n').trim();
      })
      .filter((p) => p && !p.split('\n').every((line) => /^[-*]\s/.test(line.trim())))
      .map(stripMarkdown)
      .filter(Boolean);
    return {
      id: this.idFor(relPath),
      relPath,
      title,
      type,
      tags: frontmatter.tags || [],
      date,
      paragraphs,
      links: extractWikilinks(content),
      raw: content,
    };
  }

  async listPages() {
    const relPaths = await this.listRelativePaths();
    return Promise.all(relPaths.map((p) => this.readPage(p)));
  }

  async getPage(id) {
    const relPath = `${id}.md`;
    return this.readPage(relPath);
  }

  async backlinkCounts(pages) {
    const byTitle = new Map(pages.map((p) => [p.title.toLowerCase(), p]));
    const counts = new Map();
    for (const page of pages) {
      const seen = new Set();
      for (const link of page.links) {
        const target = byTitle.get(link.toLowerCase());
        if (target && target.id !== page.id && !seen.has(target.id)) {
          seen.add(target.id);
          counts.set(target.id, (counts.get(target.id) || 0) + 1);
        }
      }
    }
    return counts;
  }

  async recentLog(limit = 8) {
    let raw;
    try {
      raw = await readFile(this.logPath, 'utf8');
    } catch {
      return [];
    }
    const chunks = raw.split(/(?=^## \[)/m).filter((c) => c.trim().startsWith('## ['));
    return chunks.slice(-limit).reverse().map((chunk) => {
      const header = chunk.match(/^##\s*\[([^\]]+)\]\s*(\w+)\s*\|?\s*(.*)$/m);
      const bullets = [...chunk.matchAll(/^-\s*(.+)$/gm)].map((m) => m[1].trim());
      return {
        date: header ? header[1] : '',
        kind: header ? header[2] : '',
        subject: header ? header[3].trim() : '',
        bullets,
      };
    });
  }
}
