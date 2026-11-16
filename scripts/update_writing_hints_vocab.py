import glob, re

files = glob.glob("content/*-writing-unit-*.md")
print(f"Found {len(files)} writing unit files to check.")

for path in sorted(files):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Split by lessons (separated by ---)
    blocks = content.split("---")
    new_blocks = [blocks[0]] # header frontmatter
    
    changed = False
    for i in range(1, len(blocks), 2):
        meta = blocks[i]
        body = blocks[i+1] if i+1 < len(blocks) else ""
        
        # Check if body has [writing] and sentence with Chinese paragraph structure
        if "[writing]" in body:
            # Extract lesson title for context
            title_match = re.search(r'lessonTitle:\s*"([^"]+)"', meta)
            l_title = title_match.group(1) if title_match else "Writing Practice"
            
            # Extract srsWords if present
            srs_match = re.search(r'srsWords:\s*(.+)', body)
            words = []
            if srs_match:
                words = re.findall(r'"([^"]+)"', srs_match.group(1))
            
            vocab_str = ", ".join(words) if words else "essay, paragraph, narrative, structure, expression"
            
            # Replace sentence line
            new_body = re.sub(
                r'sentence:\s*"[^"]*"',
                f'sentence: "Write about {l_title.lower()} in English. || Key vocabulary hints: {vocab_str}"',
                body
            )
            if new_body != body:
                changed = True
                body = new_body
        
        new_blocks.append(meta)
        new_blocks.append(body)
        
    if changed:
        new_content = "---".join(new_blocks)
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print("Updated writing hints in", path)

print("Writing hints update complete!")
