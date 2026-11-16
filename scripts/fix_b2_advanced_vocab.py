#!/usr/bin/env python3
"""
Fix B2 and Advanced vocab hints to match actual unit topics.

B2 Unit topics:
  1: Society & Change
  2: Work & Careers
  3: Technology & Ethics
  4: Environment & Future
  5: Culture & Identity
  6: Education & Learning
  7: Health & Wellbeing
  8: Relationships & Communication
  9: Money & Consumerism
  10: Imagination & Innovation

Advanced Unit topics:
  1: Artificial Intelligence & Human Labor
  2: Global Economic Shifts & Inequality
  3: Climate Change & Environmental Governance
  4: Biotechnology & Genetic Ethics
  5: Urbanisation & Smart Megacities
  6: Higher Education & Knowledge Economy
  7: Social Media & Psychological Wellbeing
  8: Globalisation & Cultural Preservation
  9: Criminal Justice & Rehabilitation
  10: Public Health & Healthcare Systems
  11: Automation & The Future of Work
  12: Space Exploration & Resource Allocation
  13: Renewable Energy & Geopolitics
  14: Media Literacy & Information Integrity
  15: Demographic Aging & Social Security
  16: International Diplomacy & Conflict Resolution
  17: Cultural Heritage & Tourism Management
  18: Corporate Social Responsibility & Ethics
  19: Scientific Research & Commercialization
  20: Philosophy of Technology & Post-Humanism
"""

import glob
import re
import os

CONTENT_DIR = "content"

B2_VOCAB = {
    1: ["urbanisation", "social change", "demographic shift", "gentrification", "social mobility",
        "inequality", "community cohesion", "public infrastructure", "overcrowding", "policy intervention",
        "metropolitan area", "quality of life"],
    2: ["career path", "professional development", "work-life balance", "job satisfaction", "remote work",
        "automation", "reskilling", "gig economy", "entrepreneurship", "corporate culture",
        "burnout", "flexible working"],
    3: ["digital ethics", "data privacy", "algorithmic bias", "technological disruption", "artificial intelligence",
        "surveillance", "informed consent", "digital divide", "cybersecurity", "tech regulation",
        "human oversight", "responsible innovation"],
    4: ["climate change", "sustainable development", "renewable energy", "carbon footprint", "biodiversity loss",
        "environmental degradation", "fossil fuels", "eco-friendly", "conservation", "green technology",
        "circular economy", "net zero emissions"],
    5: ["cultural identity", "heritage", "assimilation", "multiculturalism", "tradition vs modernity",
        "cultural preservation", "globalisation", "language barrier", "social integration", "belonging",
        "cultural diversity", "customs and rituals"],
    6: ["lifelong learning", "critical thinking", "academic performance", "online learning", "curriculum reform",
        "student wellbeing", "educational equality", "standardised testing", "collaborative learning", "digital literacy",
        "knowledge economy", "pedagogy"],
    7: ["mental health", "stress management", "work-life balance", "physical fitness", "healthy lifestyle",
        "chronic disease", "preventive care", "mindfulness", "burnout", "healthcare access",
        "wellbeing", "sedentary lifestyle"],
    8: ["interpersonal skills", "effective communication", "conflict resolution", "empathy", "active listening",
        "social media impact", "boundary setting", "toxic relationships", "emotional intelligence", "nonverbal communication",
        "trust building", "assertiveness"],
    9: ["consumerism", "financial literacy", "materialism", "impulse buying", "debt management",
        "sustainable consumption", "advertising influence", "economic pressure", "saving habits", "credit culture",
        " conspicuous consumption", "ethical spending"],
    10: ["innovation", "creative thinking", "technological breakthrough", "entrepreneurship", "future prospects",
         "disruptive technology", "research and development", "visionary thinking", "adaptability", "digital transformation",
         "scientific discovery", "imagination"],
}

ADV_VOCAB = {
    1: ["unprecedented opportunities", "ethical implications", "algorithmic bias", "transparency and accountability",
        "data privacy", "autonomous decision-making", "job displacement", "socioeconomic inequality",
        "regulatory framework", "human oversight", "responsible innovation", "ethical dilemma",
        "mitigate the risks", "collaborative governance", "strike a balance"],
    2: ["macroeconomic growth", "capital returns", "progressive taxation", "distributive justice", "safety net",
        "wealth disparity", "economic mobility", "global supply chain", "fiscal policy", "income polarization",
        "structural inequality", "redistribution of wealth", "economic liberalization", "social welfare", "equitable access"],
    3: ["externalities", "carbon pricing", "cap-and-trade", "decarbonization", "border adjustment",
        "climate change mitigation", "environmental governance", "biodiversity conservation", "fossil fuel dependence",
        "renewable energy transition", "ecological sustainability", "intergovernmental cooperation", "carbon neutrality",
        "greenhouse gas emissions", "climate justice"],
    4: ["gene editing", "germline modification", "bioethics", "regulatory oversight", "therapeutic application",
        "genetic engineering", "informed consent", "moral status", "slippery slope argument", "biotechnology regulation",
        "ethical boundaries", "scientific breakthrough", "human dignity", "genetic enhancement", "medical innovation"],
    5: ["metropolitan expansion", "housing affordability", "zoning regulations", "public transit", "sustainability",
        "smart city infrastructure", "urban sprawl", "gentrification", "population density", "environmental impact",
        "municipal governance", "urban planning", "transportation network", "social equity", "resilient infrastructure"],
    6: ["knowledge economy", "academic rigor", "tuition inflation", "critical inquiry", "lifelong learning",
        "higher education reform", "research commercialization", "academic-industry collaboration", "student debt",
        "digital literacy", "meritocracy", "pedagogical innovation", "accessible education", "intellectual property", "academic freedom"],
    7: ["surveillance capitalism", "algorithmic echo chambers", "attention economy", "digital detox", "polarization",
        "social comparison", "mental health crisis", "digital well-being", "fear of missing out", "online anonymity",
        "social media addiction", "platform accountability", "information integrity", "virtual relationships", "digital literacy"],
    8: ["cultural homogenization", "linguistic diversity", "indigenous heritage", "assimilation", "cultural preservation",
        "cultural commodification", "authenticity", "intangible cultural heritage", "cultural revitalization",
        "traditional knowledge", "cultural identity", "multiculturalism", "cross-cultural exchange", "cultural imperialism", "globalisation"],
    9: ["recidivism", "restorative justice", "penal reform", "institutional deterrence", "rehabilitation",
        "criminal justice system", "mass incarceration", "social reintegration", "sentencing reform", "correctional facilities",
        "preventive measures", "community service", "retributive justice", "procedural fairness", "recidivism reduction"],
    10: ["pandemic preparedness", "universal healthcare", "medical commodification", "triage", "prophylactic measures",
         "public health infrastructure", "healthcare accessibility", "preventive care", "epidemiological surveillance",
         "vaccine equity", "health literacy", "chronic disease management", "mental health services", "healthcare rationing", "telemedicine"],
    11: ["robotic integration", "structural unemployment", "professional re-skilling", "cognitive automation", "human-machine collaboration",
         "workforce transformation", "technological displacement", "adaptive expertise", "continuous learning",
         "future of work", "digital fluency", "algorithmic management", "gig economy", "labor market polarization", "flexible work arrangements"],
    12: ["commercial spaceflight", "extraterrestrial mining", "celestial governance", "astrobiology", "aerospace innovation",
         "space tourism", "orbital mechanics", "space law", "planetary defense", "space sustainability",
         "international space treaties", "resource extraction", "space colonization", "scientific discovery", "technological spin-off"],
    13: ["energy independence", "grid modernization", "rare earth minerals", "supply chain resilience",
         "renewable energy transition", "carbon pricing", "cap-and-trade", "border adjustment mechanism",
         "energy storage", "smart grid", "decentralized energy", "clean technology", "fossil fuel divestment", "just transition", "geopolitical leverage"],
    14: ["deepfakes", "disinformation", "journalistic integrity", "epistemic trust", "algorithmic curation",
         "media literacy", "fact-checking", "information warfare", "digital manipulation", "source verification",
         "propaganda", "echo chambers", "filter bubbles", "press freedom", "information integrity"],
    15: ["super-aged society", "pension solvency", "dependency ratio", "intergenerational equity", "silver economy",
         "healthcare sustainability", "retirement age reform", "elderly care", "social safety net", "demographic headwinds",
         "aging workforce", "pension reform", "old-age poverty", "care economy", "successful aging"],
    16: ["multilateralism", "economic sanctions", "cyber warfare", "diplomatic negotiation", "geopolitical friction",
         "conflict resolution", "peace-building", "international law", "soft power", "humanitarian intervention",
         "collective security", "diplomatic immunity", "track-two diplomacy", "sanctions regime", "geopolitical realignment"],
    17: ["overtourism", "heritage conservation", "cultural commodification", "sustainable tourism", "authenticity",
         "carrying capacity", "tourism management", "local community empowerment", "cultural landscape", "tourism revenue",
         "destination marketing", "visitor management", "cultural authenticity", "heritage tourism", "tourism carrying capacity"],
    18: ["stakeholder capitalism", "environmental stewardship", "whistleblowing", "corporate governance", "ESG",
         "corporate social responsibility", "triple bottom line", "ethical business practices", "sustainable supply chain",
         "shareholder value", "corporate accountability", "social license to operate", "responsible investment", "carbon disclosure", "fair trade practices"],
    19: ["open science", "patent monopoly", "commercialization", "peer review", "empirical validation",
         "research integrity", "scientific reproducibility", "knowledge transfer", "research funding", "academic-industry collaboration",
         "scientific literacy", "research ethics", "open access publishing", "innovation ecosystem", "technology transfer"],
    20: ["transhumanism", "technological determinism", "human agency", "cybernetic organism", "existential risk",
         "bioethics", "post-human future", "technological singularity", "moral status", "human enhancement",
         "cognitive liberty", "morphological freedom", "artificial moral agents", "techno-optimism", "digital immortality"],
}


def get_field(body, field):
    pattern = rf'^{field}:\s*"((?:[^"\\]|\\.)*)"'
    match = re.search(pattern, body, re.MULTILINE)
    if match:
        return match.group(1)
    return None


def set_field(body, field, value):
    pattern = rf'(^{field}:\s*")((?:[^"\\]|\\.)*)(")'
    if re.search(pattern, body, re.MULTILINE):
        return re.sub(pattern, lambda m: f'{m.group(1)}{value}{m.group(3)}', body, count=1, flags=re.MULTILINE)
    return body


def get_lesson_title(meta):
    match = re.search(r'lessonTitle:\s*"([^"]+)"', meta)
    if match:
        return match.group(1)
    return ""


def extract_vocabs_from_sentence(sentence):
    """Extract existing srsWords vocab from sentence."""
    vocabs = []
    seen = set()
    # From sentence vocab hints
    match = re.search(r'Key vocabulary (?:hints|& phrases):\s*([^|"]+)', sentence)
    if match:
        for w in match.group(1).split(','):
            w = w.strip()
            if w and w.lower() not in seen:
                vocabs.append(w)
                seen.add(w.lower())
    return vocabs


def get_unit_number(filepath):
    match = re.search(r'unit-(\d+)', filepath)
    if match:
        return int(match.group(1))
    return 1


def process_file(filepath, level, vocab_map):
    unit_num = get_unit_number(filepath)
    max_units = 20 if level == "advanced" else 10
    extra_key = min(unit_num, max_units)
    
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
                old_sentence = get_field(body, "sentence") or ""
                
                # Extract the topic (Write about X in English)
                topic_match = re.search(r'Write about (.+?) in English', old_sentence)
                topic = topic_match.group(1) if topic_match else get_lesson_title(meta).lower()
                
                # Extract original srsWords vocabs
                srs = get_field(body, 'srsWords')
                srs_vocabs = []
                if srs:
                    srs_vocabs = re.findall(r'"([^"]+)"', srs)
                
                # Get extra vocabs for this unit
                extra = vocab_map.get(extra_key, [])
                
                # Merge: srs vocabs first, then extra vocabs (deduplicated)
                all_vocabs = []
                seen = set()
                for w in srs_vocabs + extra:
                    if w.lower() not in seen:
                        all_vocabs.append(w)
                        seen.add(w.lower())
                
                # Build requirements
                if level == "b2":
                    req = "Requirements: 4-6 paragraphs, 150-200 words"
                    vocab_label = "Key vocabulary hints"
                    vocab_count = 12
                    extra_parts = ["Suggested structure: Introduction → Arguments for → Arguments against → Your opinion → Conclusion"]
                else:
                    req = "Requirements: 4-8 paragraphs, 200-400 words"
                    vocab_label = "Key vocabulary & phrases"
                    vocab_count = 15
                    extra_parts = ["Write a well-structured essay with clear arguments and sophisticated language"]
                
                parts = [f"Write about {topic} in English.", req]
                parts.append(f"{vocab_label}: {', '.join(all_vocabs[:vocab_count])}")
                parts.extend(extra_parts)
                
                new_sentence = " || ".join(parts)
                
                if new_sentence != old_sentence:
                    body = set_field(body, "sentence", new_sentence)
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
    
    for level, vocab_map in [("b2", B2_VOCAB), ("advanced", ADV_VOCAB)]:
        files = sorted(glob.glob(f"{CONTENT_DIR}/{level}-writing-unit-*.md"))
        changed_count = 0
        for f in files:
            if process_file(f, level, vocab_map):
                changed_count += 1
        print(f"{level}: {changed_count}/{len(files)} files updated")
    
    print("\nVocab fix complete!")


if __name__ == "__main__":
    main()
