#!/usr/bin/env python3
"""
Phase 2: Inject Chinese translations into A1/A2/B1 writing exercise files.

- A1: Add a new `chineseEssay:` field with the Chinese translation of the `answer`
- A2: Replace the `core:` field (currently English) with the Chinese translation
- B1: Replace the `core:` field (currently English) with the Chinese translation

Reads from the translated batch files and updates the content files.
"""

import glob
import re
import os
import json

CONTENT_DIR = "content"


def get_field(body, field):
    pattern = rf'^{field}:\s*"((?:[^"\\]|\\.)*)"'
    match = re.search(pattern, body, re.MULTILINE)
    if match:
        return match.group(1)
    return None


def set_field(body, field, value):
    """Set or replace a field value. If field exists, replace it. If not, add it after text:."""
    # Escape any special regex chars in value for the replacement
    pattern = rf'(^{field}:\s*")((?:[^"\\]|\\.)*)(")'
    if re.search(pattern, body, re.MULTILINE):
        return re.sub(pattern, lambda m: f'{m.group(1)}{value}{m.group(3)}', body, count=1, flags=re.MULTILINE)
    else:
        # Add after text: line
        lines = body.split('\n')
        new_lines = []
        inserted = False
        for line in lines:
            new_lines.append(line)
            if not inserted and line.strip().startswith('text:'):
                new_lines.append(f'{field}: "{value}"')
                inserted = True
        if not inserted:
            # Add after [writing] line
            for i, line in enumerate(new_lines):
                if '[writing]' in line:
                    new_lines.insert(i + 1, f'{field}: "{value}"')
                    inserted = True
                    break
        if not inserted:
            new_lines.append(f'{field}: "{value}"')
        return '\n'.join(new_lines)


def get_lesson_title(meta):
    match = re.search(r'lessonTitle:\s*"([^"]+)"', meta)
    if match:
        return match.group(1)
    return ""


def load_translations():
    """Load all translated batches and return a lookup dict."""
    # key: (file, lesson_index) -> chinese_text
    translations = {}
    
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    
    for i in range(6):
        path = os.path.join(scripts_dir, f"_batch_{i}_translated.json")
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                items = json.load(f)
            for item in items:
                if "chinese_text" in item:
                    # Normalize the file path to match what process_file uses
                    filepath = item["file"]
                    # Remove leading ./ or content/ to normalize
                    if filepath.startswith("./"):
                        filepath = filepath[2:]
                    key = (filepath, item["lesson_index"])
                    translations[key] = item["chinese_text"]
            print(f"  Loaded batch {i}: {len(items)} items")
        else:
            print(f"  WARNING: batch {i} not found at {path}")
    
    return translations


def process_file(filepath, level, translations):
    """Process a single writing unit file, injecting Chinese essays."""
    # Normalize filepath to match keys in translations dict
    norm_path = filepath
    if norm_path.startswith("./"):
        norm_path = norm_path[2:]
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    blocks = content.split("---")
    changed = False
    new_blocks = [blocks[0]]
    
    i = 1
    lesson_idx = 0
    while i < len(blocks):
        if i + 1 < len(blocks):
            meta = blocks[i]
            body = blocks[i + 1] if i + 1 < len(blocks) else ""
            
            if "lessonTitle" in meta and "[writing]" in body:
                key = (norm_path, lesson_idx)
                chinese_text = translations.get(key)
                
                if chinese_text:
                    if level == "a1":
                        # Add new chineseEssay field (A1 has no core field)
                        body = set_field(body, "chineseEssay", chinese_text)
                        changed = True
                    elif level in ("a2", "b1"):
                        # Replace the core field with Chinese text
                        old_core = get_field(body, "core")
                        if old_core is not None:
                            body = set_field(body, "core", chinese_text)
                            changed = True
                        else:
                            # No core field, add one
                            body = set_field(body, "core", chinese_text)
                            changed = True
                
                lesson_idx += 1
            
            new_blocks.append(meta)
            new_blocks.append(body)
            i += 2
        else:
            new_blocks.append(blocks[i])
            i += 1
    
    if changed:
        new_content = "---".join(new_blocks)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)
        return True, lesson_idx
    return False, lesson_idx


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")
    
    print("Loading translations...")
    translations = load_translations()
    print(f"Total translations loaded: {len(translations)}")
    
    print("\nProcessing files...")
    for level in ["a1", "a2", "b1"]:
        files = sorted(glob.glob(f"{CONTENT_DIR}/{level}-writing-unit-*.md"))
        changed_count = 0
        total_lessons = 0
        for f in files:
            changed, lessons = process_file(f, level, translations)
            if changed:
                changed_count += 1
            total_lessons += lessons
        print(f"  {level}: {changed_count}/{len(files)} files updated ({total_lessons} lessons)")
    
    print("\nPhase 2 complete!")


if __name__ == "__main__":
    main()
