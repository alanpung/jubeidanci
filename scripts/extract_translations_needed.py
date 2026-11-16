#!/usr/bin/env python3
"""Extract all English texts that need Chinese translation for A1/A2/B1 writing exercises."""

import glob
import re
import json
import os

CONTENT_DIR = "content"

def get_field(body, field):
    pattern = rf'^{field}:\s*"((?:[^"\\]|\\.)*)"'
    match = re.search(pattern, body, re.MULTILINE)
    if match:
        return match.group(1)
    return None

def get_lesson_title(meta):
    match = re.search(r'lessonTitle:\s*"([^"]+)"', meta)
    if match:
        return match.group(1)
    return ""

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")
    
    all_items = []
    
    for level in ["a1", "a2", "b1"]:
        files = sorted(glob.glob(f"{CONTENT_DIR}/{level}-writing-unit-*.md"))
        for f in files:
            with open(f, "r", encoding="utf-8") as fh:
                content = fh.read()
            
            blocks = content.split("---")
            i = 1
            lesson_idx = 0
            while i < len(blocks):
                if i + 1 < len(blocks):
                    meta = blocks[i]
                    body = blocks[i + 1] if i + 1 < len(blocks) else ""
                    
                    if "lessonTitle" in meta and "[writing]" in body:
                        lesson_title = get_lesson_title(meta)
                        
                        if level == "a1":
                            # Translate the 'answer' field
                            text_to_translate = get_field(body, "answer")
                            source_field = "answer"
                        else:
                            # Translate the 'core' field
                            text_to_translate = get_field(body, "core")
                            source_field = "core"
                        
                        if text_to_translate:
                            all_items.append({
                                "level": level,
                                "file": f,
                                "lesson_index": lesson_idx,
                                "lesson_title": lesson_title,
                                "source_field": source_field,
                                "english_text": text_to_translate,
                            })
                        lesson_idx += 1
                i += 2
    
    # Save to JSON
    output_path = "scripts/_writing_translations_needed.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_items, f, ensure_ascii=False, indent=2)
    
    print(f"Total items needing translation: {len(all_items)}")
    by_level = {}
    for item in all_items:
        by_level.setdefault(item["level"], []).append(item)
    for level, items in sorted(by_level.items()):
        print(f"  {level}: {len(items)} items")
    
    print(f"\nSaved to {output_path}")

if __name__ == "__main__":
    main()
