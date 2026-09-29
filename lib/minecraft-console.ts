const colors: Record<string, string> = { "0": "#000000", "1": "#0000aa", "2": "#00aa00", "3": "#00aaaa", "4": "#aa0000", "5": "#aa00aa", "6": "#ffaa00", "7": "#aaaaaa", "8": "#555555", "9": "#5555ff", a: "#55ff55", b: "#55ffff", c: "#ff5555", d: "#ff55ff", e: "#ffff55", f: "#ffffff" };

function escapeHtml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function minecraftLine(value: string) {
  const clean = value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  let color = "#c7d0dc";
  let bold = false;
  let italic = false;
  let underline = false;
  const parts: string[] = [];
  const tokens = clean.split(/(§[0-9a-fk-or])/gi);
  for (const token of tokens) {
    if (token.length === 2 && token[0].toLowerCase() === "§") {
      const code = token[1].toLowerCase();
      if (colors[code]) color = colors[code];
      else if (code === "l") bold = true;
      else if (code === "o") italic = true;
      else if (code === "n") underline = true;
      else if (code === "r") { color = "#c7d0dc"; bold = false; italic = false; underline = false; }
      continue;
    }
    if (!token) continue;
    const style = `color:${color};${bold ? "font-weight:700;" : ""}${italic ? "font-style:italic;" : ""}${underline ? "text-decoration:underline;" : ""}`;
    parts.push(`<span style="${style}">${escapeHtml(token)}</span>`);
  }
  return `<span class="minecraft-line">${parts.join("")}</span>`;
}