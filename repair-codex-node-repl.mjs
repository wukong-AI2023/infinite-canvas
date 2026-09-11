import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const configFile = path.join(os.homedir(), ".codex", "config.toml");
if (!fs.existsSync(configFile)) process.exit(0);

const text = fs.readFileSync(configFile, "utf8");
const commandMatch = text.match(/\[mcp_servers\.node_repl\][\s\S]*?command\s*=\s*'([^']+node_repl\.exe)'/i);
if (!commandMatch) process.exit(0);

const commandPath = commandMatch[1];
if (fs.existsSync(commandPath)) {
  console.log("Codex node_repl path is current.");
  process.exit(0);
}

const root = path.join(process.env.LOCALAPPDATA || "", "OpenAI", "Codex", "runtimes", "cua_node");
if (!root || !fs.existsSync(root)) {
  console.log("Codex cua_node runtime not found; skipped node_repl repair.");
  process.exit(0);
}

const latest = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const exe = path.join(root, entry.name, "bin", "node_repl.exe");
    return { name: entry.name, exe, mtime: fs.existsSync(exe) ? fs.statSync(exe).mtimeMs : 0 };
  })
  .filter((entry) => entry.mtime)
  .sort((a, b) => b.mtime - a.mtime)[0];

if (!latest) {
  console.log("Codex node_repl.exe not found in cua_node runtimes; skipped repair.");
  process.exit(0);
}

const oldHash = commandPath.match(/cua_node[\\/]([^\\/]+)[\\/]bin[\\/]node_repl\.exe/i)?.[1];
if (!oldHash || oldHash === latest.name) {
  console.log("Codex node_repl hash could not be updated.");
  process.exit(0);
}

const next = text.split(oldHash).join(latest.name);
if (next === text) process.exit(0);
fs.writeFileSync(configFile, next);
console.log(`Updated Codex node_repl runtime ${oldHash} -> ${latest.name}`);
