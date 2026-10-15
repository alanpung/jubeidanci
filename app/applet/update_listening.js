const fs = require("fs");
const file = "components/exercises/listening.tsx";
let content = fs.readFileSync(file, "utf8");

const target = `      <input
        ref={inputRef}
        type="text"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={status !== "answering"}
        placeholder="Type what you hear..."
        className={\`w-full rounded-xl border-2 p-4 text-lg font-medium focus:border-lingo-blue focus:outline-none disabled:opacity-100 \${
          status === "correct"
            ? "border-lingo-green bg-green-50 text-lingo-green font-bold"
            : status === "incorrect"
            ? "border-lingo-red bg-red-50 text-lingo-red font-bold"
            : "border-lingo-border bg-white text-lingo-text placeholder:text-lingo-gray-dark"
        }\`}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />`;

const replacement = `      {status === "answering" ? (
        <input
          ref={inputRef}
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type what you hear..."
          className="w-full rounded-xl border-2 border-lingo-border bg-white p-4 text-lg font-medium focus:border-lingo-blue focus:outline-none text-lingo-text"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      ) : (
        <div className={\`w-full rounded-xl border-2 p-4 text-lg font-bold \${
          status === "correct"
            ? "border-lingo-green bg-green-50 text-lingo-green"
            : "border-lingo-red bg-red-50 text-red-600"
        }\`}>
          {answer || "(empty)"}
        </div>
      )}`;

if (!content.includes(target)) {
  console.error("Target not found in listening.tsx!");
  process.exit(1);
}
content = content.replace(target, replacement);
fs.writeFileSync(file, content, "utf8");
console.log("Successfully updated listening.tsx");
