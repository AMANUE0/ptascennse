import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { getServerDirectory } from "./server-manager";
const execFileAsync = promisify(execFile);

function psEscape(value: string) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

async function backupDir(id: string) {
  const root = await getServerDirectory(id);
  const dir = path.join(root, "backups");
  await mkdir(dir, { recursive: true });
  return { root, dir };
}
export async function listBackups(id: string) {
  const { dir } = await backupDir(id);
  const items = await readdir(dir, { withFileTypes: true });
  return Promise.all(items.filter((item) => item.isFile() && item.name.endsWith(".zip")).map(async (item) => {
    const info = await stat(path.join(dir, item.name));
    return { name: item.name, size: info.size, createdAt: info.mtime.toISOString() };
  }));
}
export async function createBackup(id: string) {
  const { root, dir } = await backupDir(id);
  const name = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
  const destination = path.join(dir, name);
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Compress-Archive -Path ${psEscape(path.join(root, "*"))} -DestinationPath ${psEscape(destination)} -Force`]);
  return { name, size: (await stat(destination)).size, createdAt: new Date().toISOString() };
}
export async function backupPath(id: string, name: string) {
  const { dir } = await backupDir(id);
  if (!/^[a-zA-Z0-9_.-]+\.zip$/.test(name)) throw new Error("Invalid backup name");
  return path.join(dir, name);
}
