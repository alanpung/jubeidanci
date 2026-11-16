#!/usr/bin/env python3
"""
Expand the B2 and Advanced vocabulary hint lists.

B2:      16 words per unit  (was 12)
Advanced: 20 words per unit  (was 15)

Each list is topic-matched to the actual unit theme, so every hint is
genuinely useful for that unit's essays.
"""

import glob
import re
import os

CONTENT_DIR = "content"

B2_VOCAB = {
    1: ["urbanisation", "social change", "demographic shift", "gentrification", "social mobility",
        "inequality", "community cohesion", "public infrastructure", "overcrowding", "policy intervention",
        "metropolitan area", "quality of life", "population density", "rural depopulation", "urban sprawl",
        "civic participation"],
    2: ["career path", "professional development", "work-life balance", "job satisfaction", "remote work",
        "automation", "reskilling", "gig economy", "entrepreneurship", "corporate culture",
        "burnout", "flexible working", "interview skills", "networking", "pay negotiation",
        "internship"],
    3: ["digital ethics", "data privacy", "algorithmic bias", "technological disruption", "artificial intelligence",
        "surveillance", "informed consent", "digital divide", "cybersecurity", "tech regulation",
        "human oversight", "responsible innovation", "facial recognition", "password security", "deepfakes",
        "screen addiction"],
    4: ["climate change", "sustainable development", "renewable energy", "carbon footprint", "biodiversity loss",
        "environmental degradation", "fossil fuels", "eco-friendly", "conservation", "green technology",
        "circular economy", "net zero emissions", "recycling", "air pollution", "wildlife habitat",
        "climate policy"],
    5: ["cultural identity", "heritage", "assimilation", "multiculturalism", "tradition vs modernity",
        "cultural preservation", "globalisation", "language barrier", "social integration", "belonging",
        "cultural diversity", "customs and rituals", "folk art", "dialect", "migration",
        "cultural exchange"],
    6: ["lifelong learning", "critical thinking", "academic performance", "online learning", "curriculum reform",
        "student wellbeing", "educational equality", "standardised testing", "collaborative learning", "digital literacy",
        "knowledge economy", "pedagogy", "homework load", "exam pressure", "vocabulary building",
        "note-taking skills"],
    7: ["mental health", "stress management", "work-life balance", "physical fitness", "healthy lifestyle",
        "chronic disease", "preventive care", "mindfulness", "burnout", "healthcare access",
        "wellbeing", "sedentary lifestyle", "sleep quality", "nutrition", "exercise routine",
        "mental wellbeing"],
    8: ["interpersonal skills", "effective communication", "conflict resolution", "empathy", "active listening",
        "social media impact", "boundary setting", "toxic relationships", "emotional intelligence", "nonverbal communication",
        "trust building", "assertiveness", "misunderstanding", "body language", "small talk",
        "netiquette"],
    9: ["consumerism", "financial literacy", "materialism", "impulse buying", "debt management",
        "sustainable consumption", "advertising influence", "economic pressure", "saving habits", "credit culture",
        "conspicuous consumption", "ethical spending", "budgeting", "brand loyalty", "second-hand economy",
        "price comparison"],
    10: ["innovation", "creative thinking", "technological breakthrough", "entrepreneurship", "future prospects",
         "disruptive technology", "research and development", "visionary thinking", "adaptability", "digital transformation",
         "scientific discovery", "imagination", "inventive problem-solving", "trial and error", "artificial creativity",
         "prototype testing"],
}

ADV_VOCAB = {
    1: ["unprecedented opportunities", "ethical implications", "algorithmic bias", "transparency and accountability",
        "data privacy", "autonomous decision-making", "job displacement", "socioeconomic inequality",
        "regulatory framework", "human oversight", "responsible innovation", "ethical dilemma",
        "mitigate the risks", "collaborative governance", "strike a balance", "machine learning",
        "automation bias", "labour market disruption", "digital divide", "accountability mechanisms",
        "technological determinism"],
    2: ["macroeconomic growth", "capital returns", "progressive taxation", "distributive justice", "safety net",
        "wealth disparity", "economic mobility", "global supply chain", "fiscal policy", "income polarization",
        "structural inequality", "redistribution of wealth", "economic liberalization", "social welfare",
        "equitable access", "labour arbitrage", "automation-driven inequality", "asset inequality",
        "fiscal austerity", "progressive policy"],
    3: ["externalities", "carbon pricing", "cap-and-trade", "decarbonization", "border adjustment",
        "climate change mitigation", "environmental governance", "biodiversity conservation", "fossil fuel dependence",
        "renewable energy transition", "ecological sustainability", "intergovernmental cooperation", "carbon neutrality",
        "greenhouse gas emissions", "climate justice", "carbon sink", "adaptation finance",
        "desertification", "climate litigation", "per capita emissions"],
    4: ["gene editing", "germline modification", "bioethics", "regulatory oversight", "therapeutic application",
        "genetic engineering", "informed consent", "moral status", "slippery slope argument", "biotechnology regulation",
        "ethical boundaries", "scientific breakthrough", "human dignity", "genetic enhancement", "medical innovation",
        "CRISPR", "designer babies", "gene therapy", "eugenics debate", "biopiracy"],
    5: ["metropolitan expansion", "housing affordability", "zoning regulations", "public transit", "sustainability",
        "smart city infrastructure", "urban sprawl", "gentrification", "population density", "environmental impact",
        "municipal governance", "urban planning", "transportation network", "social equity", "resilient infrastructure",
        "vertical urbanism", "informal settlements", "city resilience", "mobility-as-a-service", "smart city governance"],
    6: ["knowledge economy", "academic rigor", "tuition inflation", "critical inquiry", "lifelong learning",
        "higher education reform", "research commercialization", "academic-industry collaboration", "student debt",
        "digital literacy", "meritocracy", "pedagogical innovation", "accessible education", "intellectual property",
        "academic freedom", "mooc", "microcredential", "university-industry partnership", "student mobility",
        "curriculum design"],
    7: ["surveillance capitalism", "algorithmic echo chambers", "attention economy", "digital detox", "polarization",
        "social comparison", "mental health crisis", "digital well-being", "fear of missing out", "online anonymity",
        "social media addiction", "platform accountability", "information integrity", "virtual relationships",
        "digital literacy", "algorithmic visibility", "influencer culture", "notification fatigue",
        "curation algorithms", "identity performance"],
    8: ["cultural homogenization", "linguistic diversity", "indigenous heritage", "assimilation", "cultural preservation",
        "cultural commodification", "authenticity", "intangible cultural heritage", "cultural revitalization",
        "traditional knowledge", "cultural identity", "multiculturalism", "cross-cultural exchange", "cultural imperialism",
        "globalisation", "cultural appropriation", "intangible heritage", "diaspora", "syncretism",
        "cultural hybridity"],
    9: ["recidivism", "restorative justice", "penal reform", "institutional deterrence", "rehabilitation",
        "criminal justice system", "mass incarceration", "social reintegration", "sentencing reform", "correctional facilities",
        "preventive measures", "community service", "retributive justice", "procedural fairness", "recidivism reduction",
        "custodial sentencing", "forensic evidence", "wrongful conviction", "prison population", "re-entry support"],
    10: ["pandemic preparedness", "universal healthcare", "medical commodification", "triage", "prophylactic measures",
         "public health infrastructure", "healthcare accessibility", "preventive care", "epidemiological surveillance",
         "vaccine equity", "health literacy", "chronic disease management", "mental health services", "healthcare rationing",
         "telemedicine", "antimicrobial resistance", "health system resilience", "risk communication",
         "population health", "clinical guidelines"],
    11: ["robotic integration", "structural unemployment", "professional re-skilling", "cognitive automation", "human-machine collaboration",
         "workforce transformation", "technological displacement", "adaptive expertise", "continuous learning",
         "future of work", "digital fluency", "algorithmic management", "gig economy", "labor market polarization",
         "flexible work arrangements", "task automation", "human oversight", "reskilling programmes",
         "platform work", "output-based pay"],
    12: ["commercial spaceflight", "extraterrestrial mining", "celestial governance", "astrobiology", "aerospace innovation",
         "space tourism", "orbital mechanics", "space law", "planetary defense", "space sustainability",
         "international space treaties", "resource extraction", "space colonization", "scientific discovery", "technological spin-off",
         "orbital debris", "launch economics", "asteroid mining", "space ethics", "deep space communication"],
    13: ["energy independence", "grid modernization", "rare earth minerals", "supply chain resilience",
         "renewable energy transition", "carbon pricing", "cap-and-trade", "border adjustment mechanism",
         "energy storage", "smart grid", "decentralized energy", "clean technology", "fossil fuel divestment",
         "just transition", "geopolitical leverage", "critical minerals", "interconnector", "energy mix",
         "load balancing", "power geopolitics"],
    14: ["deepfakes", "disinformation", "journalistic integrity", "epistemic trust", "algorithmic curation",
         "media literacy", "fact-checking", "information warfare", "digital manipulation", "source verification",
         "propaganda", "echo chambers", "filter bubbles", "press freedom", "information integrity",
         "citizen journalism", "source triangulation", "media literacy education", "narrative manipulation",
         "trust in institutions"],
    15: ["super-aged society", "pension solvency", "dependency ratio", "intergenerational equity", "silver economy",
         "healthcare sustainability", "retirement age reform", "elderly care", "social safety net", "demographic headwinds",
         "aging workforce", "pension reform", "old-age poverty", "care economy", "successful aging",
         "longevity risk", "aged care workforce", "residential care", "age discrimination", "active ageing"],
    16: ["multilateralism", "economic sanctions", "cyber warfare", "diplomatic negotiation", "geopolitical friction",
         "conflict resolution", "peace-building", "international law", "soft power", "humanitarian intervention",
         "collective security", "diplomatic immunity", "track-two diplomacy", "sanctions regime", "geopolitical realignment",
         "arms control", "security dilemma", "mediation", "norm emergence", "burden sharing"],
    17: ["overtourism", "heritage conservation", "cultural commodification", "sustainable tourism", "authenticity",
         "carrying capacity", "tourism management", "local community empowerment", "cultural landscape", "tourism revenue",
         "destination marketing", "visitor management", "cultural authenticity", "heritage tourism", "tourism carrying capacity",
         "resident displacement", "short-term rentals", "destination sustainability", "vernacular architecture",
         "site conservation"],
    18: ["stakeholder capitalism", "environmental stewardship", "whistleblowing", "corporate governance", "ESG",
         "corporate social responsibility", "triple bottom line", "ethical business practices", "sustainable supply chain",
         "shareholder value", "corporate accountability", "social license to operate", "responsible investment", "carbon disclosure",
         "fair trade practices", "greenwashing", "board diversity", "supplier standards", "ethical supply chains",
         "impact investing"],
    19: ["open science", "patent monopoly", "commercialization", "peer review", "empirical validation",
         "research integrity", "scientific reproducibility", "knowledge transfer", "research funding", "academic-industry collaboration",
         "scientific literacy", "research ethics", "open access publishing", "innovation ecosystem", "technology transfer",
         "publication bias", "preprint culture", "replication crisis", "research infrastructure", "grant peer review"],
    20: ["transhumanism", "technological determinism", "human agency", "cybernetic organism", "existential risk",
         "bioethics", "post-human future", "technological singularity", "moral status", "human enhancement",
         "cognitive liberty", "morphological freedom", "artificial moral agents", "techno-optimism", "digital immortality",
         "machine consciousness", "personhood", "responsible innovation", "existential safety", "cyborg ethics"],
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


def get_unit_number(filepath):
    match = re.search(r'unit-(\d+)', filepath)
    return int(match.group(1)) if match else 1


def process_file(filepath, level, vocab_map, label, count):
    unit_num = get_unit_number(filepath)
    key = min(unit_num, len(vocab_map))

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
                sentence = get_field(body, "sentence") or ""
                # Rebuild: topic + requirements + full vocab list
                topic = ""
                for seg in sentence.split("||"):
                    seg = seg.strip()
                    if seg.startswith("Write about"):
                        topic = seg
                        break
                req = ""
                for seg in sentence.split("||"):
                    seg = seg.strip()
                    if seg.startswith("Requirements:"):
                        req = seg
                        break

                words = vocab_map[key][:count]
                new_sentence = " || ".join([topic, req, f"{label}: {', '.join(words)}"])

                if new_sentence != sentence:
                    body = set_field(body, "sentence", new_sentence)
                    changed = True

            new_blocks.append(meta)
            new_blocks.append(body)
            i += 2
        else:
            new_blocks.append(blocks[i])
            i += 1

    if changed:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("---".join(new_blocks))
        return True
    return False


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)) + "/..")

    for level, vocab_map, label, count in [
        ("b2", B2_VOCAB, "Key vocabulary hints", 16),
        ("advanced", ADV_VOCAB, "Key vocabulary & phrases", 20),
    ]:
        files = sorted(glob.glob(f"{CONTENT_DIR}/{level}-writing-unit-*.md"))
        changed = 0
        for f in files:
            if process_file(f, level, vocab_map, label, count):
                changed += 1
        print(f"{level}: {changed}/{len(files)} files updated")

    print("\nDone!")


if __name__ == "__main__":
    main()
