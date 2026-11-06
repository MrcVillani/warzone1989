#!/usr/bin/env node
// Hook PreToolUse per i subagent del team (.claude/agents/): blocca le modifiche ai file fuori dall'area dell'agente.
// Uso, dal frontmatter di un agente: node .claude/hooks/agent-boundaries.mjs <backend|frontend|tester>
// Legge l'input dell'hook (JSON) da stdin; stampa una decisione "deny" quando il file è fuori area.
// Vede solo gli strumenti Edit/Write: un file scritto da Bash non viene controllato.

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const RULES = {
  backend: {
    area: 'engine/ (escluso engine/test/) e server/',
    allows: (p) => (p.startsWith('engine/') && !p.startsWith('engine/test/')) || p.startsWith('server/'),
  },
  frontend: {
    area: 'client/, android/, scripts/ e package.json',
    allows: (p) => p.startsWith('client/') || p.startsWith('android/') || p.startsWith('scripts/') || p === 'package.json' || p === 'package-lock.json',
  },
  tester: {
    area: 'i test: engine/test/ e tests/',
    allows: (p) => p.startsWith('engine/test/') || p.startsWith('tests/'),
  },
};

const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
const role = process.argv[2] ?? input.agent_type;
const rule = RULES[role];
const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
if (!rule || !file) process.exit(0);

// I percorsi sono relativi al checkout che contiene il file, così le regole valgono anche in un git worktree.
// Un altro repository completo conta come esterno.
const project = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const target = path.resolve(input.cwd || project, file);
const root = checkoutOf(target) ?? project;

function checkoutOf(t) {
  for (let dir = path.dirname(t); path.dirname(dir) !== dir; dir = path.dirname(dir)) {
    const git = path.join(dir, '.git');
    if (!existsSync(git)) continue;
    return dir === path.resolve(project) || statSync(git).isFile() ? dir : null;
  }
  return null;
}
const relative = path.relative(root, target).split(path.sep).join('/');

let reason = null;
if (relative.startsWith('../') || path.isAbsolute(relative)) {
  reason = `${file} è fuori dal repository.`;
} else if (relative.startsWith('dist/')) {
  reason = `${relative} è generato da npm run build: non si modifica a mano.`;
} else if (!rule.allows(relative)) {
  reason = `L'agente ${role} può modificare solo ${rule.area}. ${relative} è fuori area: segnalalo al team leader.`;
}

if (reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}
