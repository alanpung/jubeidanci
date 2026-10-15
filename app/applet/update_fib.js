const fs = require("fs");
const file = "components/exercises/fill-in-the-blank.tsx";
let content = fs.readFileSync(file, "utf8");

const target = `          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim() && status === "answering") handleCheck();
            }}
            disabled={status !== "answering"}
            className={\`w-40 border-b-4 bg-transparent text-center focus:outline-none font-bold transition-all \${
              status === "correct"
                ? "border-lingo-green text-lingo-green bg-green-50/50"
                : status === "incorrect"
                ? "border-lingo-red text-lingo-red bg-red-50/50"
                : "border-lingo-blue text-lingo-text"
            }\`}
            autoFocus={status === "answering"}
          />`;

const replacement = `          {status === "answering" ? (
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim() && status === "answering") handleCheck();
              }}
              className="w-40 border-b-4 border-lingo-blue bg-transparent text-center focus:outline-none font-bold text-lingo-text"
              autoFocus={true}
            />
          ) : (
            <span className={\`px-4 py-1 rounded-xl border-b-4 font-bold text-2xl \${
              status === "correct"
                ? "border-lingo-green text-lingo-green bg-green-50"
                : "border-lingo-red text-lingo-red bg-red-50"
            }\`}>
              {input || "(empty)"}
            </span>
          )}`;

if (!content.includes(target)) {
  console.error("Target not found in fill-in-the-blank.tsx!");
  process.exit(1);
}
content = content.replace(target, replacement);
fs.writeFileSync(file, content, "utf8");
console.log("Successfully updated fill-in-the-blank.tsx");
