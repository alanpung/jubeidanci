import { spawn } from "node:child_process";
import path from "node:path";

// Translate incoming CLI flags (like Vite-style --host from supervisor) into Next.js flags
const args = [];
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--host") {
    args.push("-H");
  } else if (arg.startsWith("--host=")) {
    args.push("-H", arg.slice(7));
  } else {
    args.push(arg);
  }
}

if (!args.includes("-p") && !args.includes("--port")) {
  args.unshift("-p", "3000");
}
if (!args.includes("-H") && !args.includes("--hostname")) {
  args.unshift("-H", "0.0.0.0");
}

// Ensure webpack dev mode for stability in AI Studio container
if (!args.includes("--webpack") && !args.includes("--turbo")) {
  args.push("--webpack");
}

const nextBin = path.resolve("./node_modules/next/dist/bin/next");

const child = spawn(process.execPath, [nextBin, "dev", ...args], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
