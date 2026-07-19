import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const SKIP_DIRS = new Set(['.obsidian', '.claude', 'assets']);
const SKIP_FILES = new Set(['index.md', 'log.md', '.DS_Store']);

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
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await walk(path.join(dir, entry.name), root)));
    } else if (entry.name.endsWith('.md') && !SKIP_FILES.has(entry.name)) {
      files.push(path.relative(root, path.join(dir, entry.name)));
    }
  }
  return files;
}

export class Vault {
  constructor(vaultPath) {
    this.vaultPath = vaultPath;
    this.wikiDir = path.join(vaultPath, 'Wiki');
    this.rawDir = path.join(vaultPath, 'Raw');
    this.logPath = path.join(this.wikiDir, 'log.md');
  }

  // Paths returned/accepted everywhere below are relative to the vault root
  // (e.g. "Wiki/Concepts/X.md", "Raw/Y.md"), not to Wiki/ specifically —
  // this lets Raw/ transcripts show up as viewable "notes" too.
  async listRelativePaths() {
    const out = [];
    if (existsSync(this.wikiDir)) out.push(...(await walk(this.wikiDir, this.vaultPath)));
    if (existsSync(this.rawDir)) out.push(...(await walk(this.rawDir, this.vaultPath)));
    return out;
  }

  idFor(relPath) {
    return relPath.replace(/\.md$/, '');
  }

  async readPage(relPath) {
    const full = path.join(this.vaultPath, relPath);
    const raw = await readFile(full, 'utf8');
    const { data: frontmatter, content } = matter(raw);
    const headingMatch = content.match(/^#\s+(.+)$/m);
    const filename = path.basename(relPath, '.md');
    const title = frontmatter.title || (headingMatch ? headingMatch[1].trim() : filename);
    const parts = relPath.split(path.sep);
    const topFolder = parts[0]; // "Wiki" or "Raw"
    const category = parts.length > 2 ? parts[1] : topFolder;
    const type = (frontmatter.type || (topFolder === 'Raw' ? 'raw' : category)).toString();
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
      status: frontmatter.status || null, // pipeline state on Studio ideas
      date,
      url: frontmatter.url || null,
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
