#!/usr/bin/env python3
"""
Phase 1: Update sentence fields with requirements and vocab hints for all levels.
Phase 2: Add Chinese essays for A1/A2 (handled separately).

This script handles Phase 1 only.
"""

import glob
import re
import os

CONTENT_DIR = "content"

LEVEL_REQ = {
    "a1": "Requirements: 1 paragraph, 30-50 words",
    "a2": "Requirements: 1 paragraph, 50-80 words",
    "b1": "Requirements: 3-4 paragraphs, 100-150 words",
    "b2": "Requirements: 4-6 paragraphs, 150-200 words",
    "advanced": "Requirements: 4-8 paragraphs, 200-400 words",
}

B2_EXTRA_VOCAB = {
    1: ["integral part", "stay connected", "cyberbullying", "mental health", "double-edged sword",
        "strike a balance", "critical thinking", "self-esteem", "addiction", "privacy concerns"],
    2: ["broaden horizons", "immerse oneself in", "local culture", "step out of comfort zone",
        "cultural exchange", "personal growth", "lifelong memories", "break stereotypes",
        "develop independence", "worthwhile investment"],
    3: ["sense of belonging", "equality among students", "reduce peer pressure", "self-expression",
        "individuality", "stifle creativity", "financial burden", "cost-effective",
        "dress code", "weigh the pros and cons"],
    4: ["revolutionize", "digital tools", "access to information", "interactive learning",
        "personalized learning", "distraction", "over-reliance on technology", "digital divide",
        "face-to-face interaction", "enhance learning outcomes"],
    5: ["balanced diet", "regular exercise", "adequate sleep", "sedentary lifestyle",
        "chronic diseases", "mental well-being", "stress management", "work-life balance",
        "consistency", "cultivate good habits"],
    6: ["renewable energy", "carbon footprint", "sustainable development", "greenhouse gas emissions",
        "environmental degradation", "eco-friendly", "biodiversity loss", "climate change mitigation",
        "fossil fuels", "energy efficiency"],
    7: ["social integration", "cultural diversity", "mutual understanding", "prejudice",
        "stereotypes", "inclusive society", "language barrier", "community engagement",
        "tolerance", "social cohesion"],
    8: ["critical thinking", "evaluate sources", "misinformation", "media literacy",
        "fact-checking", "echo chamber", "confirmation bias", "credible sources",
        "digital age", "information overload"],
    9: ["work-life balance", "remote work", "flexibility", "productivity", "burnout",
        "professional development", "digital nomad", "commute", "telecommuting",
        "job satisfaction"],
    10: ["cognitive development", "screen time", "social skills", "attention span",
         "digital natives", "face-to-face interaction", "physical activity", "learning outcomes",
         "technology addiction", "developmental milestones"],
}

ADV_EXTRA_VOCAB = {
    1: ["unprecedented opportunities", "ethical implications", "algorithmic bias", "transparency and accountability",
        "data privacy", "autonomous decision-making", "job displacement", "socioeconomic inequality",
        "regulatory framework", "human oversight", "responsible innovation", "ethical dilemma",
        "mitigate the risks", "collaborative governance", "strike a balance"],
    2: ["interconnected world", "economic integration", "cultural homogenization", "cultural diversity",
        "exploitation of labor", "wealth disparity", "multinational corporations", "cross-cultural exchange",
        "erosion of local traditions", "outsourcing", "sustainable development", "protectionism",
        "brain drain", "equitable distribution of wealth", "striking a middle ground"],
    3: ["paradigm shift", "remote work paradigm", "structural unemployment", "digital transformation",
        "gig economy", "reskilling", "automation", "flexible work arrangements", "economic restructuring",
        "labor market dynamics", "professional adaptability", "future-proofing", "hybrid workplace",
        "workforce displacement", "lifelong learning"],
    4: ["commercial spaceflight", "extraterrestrial mining", "celestial governance", "space exploration",
        "astrobiology", "aerospace engineering", "resource allocation", "scientific breakthrough",
        "international cooperation", "space debris", "planetary protection", "technological frontier",
        "cost-benefit analysis", "space colonization", "interplanetary travel"],
    5: ["energy independence", "grid modernization", "rare earth minerals", "supply chain resilience",
        "decarbonization", "renewable energy transition", "carbon neutrality", "geopolitical implications",
        "energy security", "sustainable infrastructure", "clean energy investment", "fossil fuel dependence",
        "green technology", "energy storage", "smart grid"],
    6: ["demographic transition", "super-aged society", "pension solvency", "dependency ratio",
        "intergenerational equity", "silver economy", "healthcare sustainability", "retirement age",
        "workforce participation", "social safety net", "aging population", "elderly care",
        "demographic dividend", "fertility rate", "longevity"],
    7: ["digital detox", "surveillance capitalism", "algorithmic echo chambers", "attention economy",
        "social polarization", "mental health crisis", "digital well-being", "online anonymity",
        "social comparison", "fear of missing out", "digital literacy", "screen addiction",
        "virtual relationships", "platform accountability", "information integrity"],
    8: ["cultural homogenization", "linguistic diversity", "indigenous heritage", "globalization",
        "assimilation", "cultural preservation", "authenticity", "cultural commodification",
        "heritage conservation", "intangible cultural heritage", "cultural revitalization",
        "traditional knowledge", "cultural identity", "multiculturalism", "cultural exchange"],
    9: ["restorative justice", "recidivism", "penal reform", "institutional deterrence",
        "rehabilitation", "criminal justice system", "mass incarceration", "reintegration",
        "sentencing reform", "correctional facilities", "social reintegration", "preventive measures",
        "community service", "probation", "retributive justice"],
    10: ["pandemic preparedness", "universal healthcare", "medical commodification", "triage",
         "prophylactic measures", "public health infrastructure", "healthcare accessibility",
         "preventive care", "epidemiological surveillance", "vaccine equity", "health literacy",
         "chronic disease management", "mental health services", "healthcare rationing", "telemedicine"],
    11: ["robotic integration", "structural unemployment", "professional re-skilling", "automation",
         "human-machine collaboration", "cognitive automation", "workforce transformation",
         "technological displacement", "adaptive expertise", "continuous learning",
         "future of work", "digital fluency", "algorithmic management", "gig economy",
         "labor market polarization"],
    12: ["commercial spaceflight", "astrobiology", "extraterrestrial mining", "celestial governance",
         "aerospace innovation", "space tourism", "orbital mechanics", "space law",
         "planetary defense", "space sustainability", "international space treaties",
         "resource extraction", "space colonization", "scientific discovery", "technological spin-off"],
    13: ["energy independence", "grid modernization", "rare earth minerals", "supply chain resilience",
         "renewable energy transition", "carbon pricing", "cap-and-trade", "border adjustment",
         "energy storage", "smart grid", "decentralized energy", "clean technology",
         "energy democracy", "fossil fuel divestment", "just transition"],
    14: ["deepfakes", "disinformation", "journalistic integrity", "epistemic trust",
         "algorithmic curation", "media literacy", "fact-checking", "information warfare",
         "digital manipulation", "source verification", "propaganda", "echo chambers",
         "filter bubbles", "press freedom", "information integrity"],
    15: ["super-aged society", "pension solvency", "dependency ratio", "intergenerational equity",
         "silver economy", "healthcare sustainability", "retirement age reform", "elderly care",
         "social safety net", "demographic headwinds", "aging workforce", "pension reform",
         "old-age poverty", "care economy", "successful aging"],
    16: ["multilateralism", "economic sanctions", "cyber warfare", "diplomatic negotiation",
         "geopolitical friction", "conflict resolution", "peace-building", "international law",
         "soft power", "humanitarian intervention", "collective security", "diplomatic immunity",
         "track-two diplomacy", "sanctions regime", "geopolitical realignment"],
    17: ["overtourism", "heritage conservation", "cultural commodification", "sustainable tourism",
         "authenticity", "carrying capacity", "tourism management", "local community empowerment",
         "cultural landscape", "tourism revenue", "destination marketing", "visitor management",
         "cultural authenticity", "heritage tourism", "tourism carrying capacity"],
    18: ["stakeholder capitalism", "environmental stewardship", "whistleblowing", "corporate governance",
         "ESG", "corporate social responsibility", "triple bottom line", "ethical business practices",
         "sustainable supply chain", "shareholder value", "corporate accountability",
         "social license to operate", "responsible investment", "carbon disclosure",
         "fair trade practices"],
    19: ["open science", "patent monopoly", "commercialization", "peer review",
         "empirical validation", "research integrity", "scientific reproducibility",
         "knowledge transfer", "research funding", "academic-industry collaboration",
         "scientific literacy", "research ethics", "open access publishing",
         "innovation ecosystem", "technology transfer"],
    20: ["transhumanism", "technological determinism", "human agency", "cybernetic organism",
         "existential risk", "bioethics", "post-human future", "technological singularity",
         "moral status", "human enhancement", "cognitive liberty", "morphological freedom",
         "artificial moral agents", "techno-optimism", "digital immortality"],
}


def get_field(body, field):
    pattern = rf'^{field}:\s*"((?:[^"\\]|\\.)*)"'
    match = re.search(pattern, body, re.MULTILINE)
    if match:
        return match.group(1)
    pattern = rf'^{field}:\s*(.+)'
    match = re.search(pattern, body, re.MULTILINE)
    if match:
        return match.group(1).strip()
    return None


def set_field(body, field, value):
    pattern = rf'(^{field}:\s*")((?:[^"\\]|\\.)*)(")'
    if re.search(pattern, body, re.MULTILINE):
        return re.sub(pattern, lambda m: f'{m.group(1)}{value}{m.group(3)}', body, count=1, flags=re.MULTILINE)
    else:
        lines = body.split('\n')
        new_lines = []
        inserted = False
        for line in lines:
            new_lines.append(line)
            if not inserted and line.strip().startswith('text:'):
                new_lines.append(f'{field}: "{value}"')
                inserted = True
        if not inserted:
            new_lines.append(f'{field}: "{value}"')
        return '\n'.join(new_lines)


def get_lesson_title(meta):
    match = re.search(r'lessonTitle:\s*"([^"]+)"', meta)
    if match:
        return match.group(1)
    return "Writing Practice"


def extract_topic(sentence):
    match = re.search(r'Write about (.+?) in English', sentence)
    if match:
        return match.group(1)
    return None


def extract_vocabs(sentence, body):
    vocabs = []
    seen = set()
    match = re.search(r'Key vocabulary hints:\s*([^|"]+)', sentence)
    if match:
        for w in match.group(1).split(','):
            w = w.strip()
            if w and w.lower() not in seen:
                vocabs.append(w)
                seen.add(w.lower())
    srs = get_field(body, 'srsWords')
    if srs:
        for w in re.findall(r'"([^"]+)"', srs):
            if w.lower() not in seen:
                vocabs.append(w)
                seen.add(w.lower())
    return vocabs


def get_unit_number(filepath):
    match = re.search(r'unit-(\d+)', filepath)
    if match:
        return int(match.group(1))
    return 1


def process_file(filepath, level):
    req = LEVEL_REQ[level]
    unit_num = get_unit_number(filepath)
    
    if level == "advanced":
        extra_key = min(unit_num, 20)
    else:
        extra_key = min(unit_num, 10)
    
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    blocks = content.split("---")
    changed = False
    new_blocks = [blocks[0]]
    
    i = 1
    while i < len(blocks):
        if i + 1 < len(blocks):
            meta = blocks[i]
            body = blocks[i + 1] if i + 1 < len(blocks) else ""
            
            if "lessonTitle" in meta and "[writing]" in body:
                lesson_title = get_lesson_title(meta)
                old_sentence = get_field(body, "sentence") or ""
                topic = extract_topic(old_sentence) or lesson_title.lower()
                vocabs = extract_vocabs(old_sentence, body)
                
                parts = [f"Write about {topic} in English.", req]
                
                if level in ("a1", "a2"):
                    parts.append("A Chinese essay (中文范文) is provided below — translate it into English")
                    if vocabs:
                        parts.append(f"Key vocabulary hints: {', '.join(vocabs[:6])}")
                
                elif level == "b1":
                    parts.append("A Chinese structure guide (中文结构提示) is provided below — use it to structure your essay")
                    if vocabs:
                        parts.append(f"Key vocabulary hints: {', '.join(vocabs[:6])}")
                
                elif level == "b2":
                    extra = B2_EXTRA_VOCAB.get(extra_key, [])
                    all_vocabs = vocabs + [v for v in extra if v.lower() not in {x.lower() for x in vocabs}]
                    parts.append(f"Key vocabulary hints: {', '.join(all_vocabs[:12])}")
                    parts.append("Suggested structure: Introduction → Arguments for → Arguments against → Your opinion → Conclusion")
                
                elif level == "advanced":
                    extra = ADV_EXTRA_VOCAB.get(extra_key, [])
                    all_vocabs = vocabs + [v for v in extra if v.lower() not in {x.lower() for x in vocabs}]
                    parts.append(f"Key vocabulary & phrases: {', '.join(all_vocabs[:15])}")
                    parts.append("Write a well-structured essay with clear arguments and sophisticated language")
                
                new_sentence = " || ".join(parts)
                
                if new_sentence != old_sentence:
                    new_body = set_field(body, "sentence", new_sentence)
                    if new_body != body:
                        body = new_body
                        changed = True
            
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
        return True
    return False


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")
    
    for level in ["a1", "a2", "b1", "b2", "advanced"]:
        files = sorted(glob.glob(f"{CONTENT_DIR}/{level}-writing-unit-*.md"))
        changed_count = 0
        for f in files:
            if process_file(f, level):
                changed_count += 1
        print(f"{level}: {changed_count}/{len(files)} files updated")
    
    print("\nPhase 1 complete!")


if __name__ == "__main__":
    main()
