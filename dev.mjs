import { spawn } from "node:child_process";
import path from "node:path";

const incomingArgs = process.argv.slice(2);
const args = [];

let hasHost = false;
let hasPort = false;

for (let i = 0; i < incomingArgs.length; i++) {
  const arg = incomingArgs[i];

  if (arg === "--host") {
    const nextArg = incomingArgs[i + 1];
    if (nextArg && !nextArg.startsWith("-")) {
      args.push("-H", nextArg);
      i++;
    } else {
      args.push("-H", "0.0.0.0");
    }
    hasHost = true;
  } else if (arg.startsWith("--host=")) {
    args.push("-H", arg.slice(7));
    hasHost = true;
  } else if (arg === "-H" || arg === "--hostname") {
    const nextArg = incomingArgs[i + 1];
    if (nextArg && !nextArg.startsWith("-")) {
      args.push("-H", nextArg);
      i++;
    } else {
      args.push("-H", "0.0.0.0");
    }
    hasHost = true;
  } else if (arg === "-p" || arg === "--port") {
    const nextArg = incomingArgs[i + 1];
    if (nextArg && !nextArg.startsWith("-")) {
      args.push("-p", nextArg);
      i++;
    } else {
      args.push("-p", "3000");
    }
    hasPort = true;
  } else if (arg.startsWith("--port=")) {
    args.push("-p", arg.slice(7));
    hasPort = true;
  } else {
    args.push(arg);
  }
}

if (!hasPort) {
  args.unshift("-p", "3000");
}
if (!hasHost) {
  args.unshift("-H", "0.0.0.0");
}

if (!args.includes("--webpack") && !args.includes("--turbo") && !args.includes("--turbopack")) {
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
