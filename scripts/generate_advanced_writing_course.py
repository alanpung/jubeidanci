import os

os.makedirs("content", exist_ok=True)

# 1. Write course definition
course_content = """---
id: "advanced-writing"
courseTitle: "Advanced Writing"
description: "Advanced C1/C2 English writing - write sophisticated 200-300 word essays with rich English vocabulary hints"
sourceLanguage: "zh"
targetLanguage: "en"
level: "C1"
visibility: "public"
---
"""
with open("content/advanced-writing.md", "w", encoding="utf-8") as f:
    f.write(course_content)

# 2. Define 20 Units with 10 lessons each (total 200 essays)
units_metadata = [
    ("Artificial Intelligence & Human Labor", "AI & Labor", "🤖", "#2563EB", "automation, algorithmic displacement, productivity, upskilling, socioeconomic disparity"),
    ("Global Economic Shifts & Inequality", "Global Economics", "💰", "#059669", "macroeconomic growth, capital returns, progressive taxation, distributive justice, safety net"),
    ("Climate Change & Environmental Governance", "Environment", "🌱", "#10B981", "externalities, carbon pricing, cap-and-trade, decarbonization, border adjustment"),
    ("Biotechnology & Genetic Ethics", "Biotech", "🧬", "#6366F1", "gene editing, germline modification, bioethics, regulatory oversight, therapeutic"),
    ("Urbanisation & Smart Megacities", "Urban Planning", "🏙️", "#3B82F6", "metropolitan expansion, housing affordability, zoning regulations, public transit, sustainability"),
    ("Higher Education & Knowledge Economy", "Education", "🎓", "#8B5CF6", "knowledge economy, academic rigor, tuition inflation, critical inquiry, lifelong learning"),
    ("Social Media & Psychological Wellbeing", "Digital Society", "📱", "#EC4899", "surveillance capitalism, algorithmic echo chambers, attention economy, digital detox, polarization"),
    ("Globalisation & Cultural Preservation", "Global Culture", "🌍", "#F59E0B", "cultural homogenization, linguistic diversity, indigenous heritage, globalization, assimilation"),
    ("Criminal Justice & Rehabilitation", "Justice", "⚖️", "#4B5563", "recidivism, restorative justice, penal reform, institutional deterrence, rehabilitation"),
    ("Public Health & Healthcare Systems", "Healthcare", "🏥", "#EF4444", "pandemic preparedness, universal healthcare, medical commodification, triage, prophylactic"),
    ("Automation & The Future of Work", "Future of Work", "⚙️", "#14B8A6", "robotic integration, remote work paradigm, structural unemployment, professional re-skilling"),
    ("Space Exploration & Resource Allocation", "Space Tech", "🚀", "#6D28D9", "commercial spaceflight, astrobiology, extraterrestrial mining, celestial governance, aerospace"),
    ("Renewable Energy & Geopolitics", "Clean Energy", "⚡", "#D97706", "energy independence, grid modernization, rare earth minerals, supply chain resilience, solar"),
    ("Media Literacy & Information Integrity", "Media Ethics", "📰", "#DC2626", "deepfakes, disinformation, journalistic integrity, epistemic trust, algorithmic curation"),
    ("Demographic Aging & Social Security", "Demographics", "🧓", "#0D9488", "super-aged society, pension solvency, dependency ratio, intergenerational equity, silver economy"),
    ("International Diplomacy & Conflict Resolution", "Diplomacy", "🕊️", "#2563EB", "multilateralism, economic sanctions, cyber warfare, diplomatic negotiation, geopolitical friction"),
    ("Cultural Heritage & Tourism Management", "Heritage", "🏛️", "#7C3AED", "overtourism, heritage conservation, cultural commodification, sustainable tourism, authenticity"),
    ("Corporate Social Responsibility & Ethics", "CSR", "🏢", "#059669", "stakeholder capitalism, environmental stewardship, whistleblowing, corporate governance, ESG"),
    ("Scientific Research & Commercialization", "Science", "🔬", "#2563EB", "open science, patent monopoly, commercialization, peer review, empirical validation"),
    ("Philosophy of Technology & Post-Humanism", "Philosophy", "🔮", "#4F46E5", "transhumanism, technological determinism, human agency, cybernetic organism, existential risk")
]

for u_idx, (u_title, u_short, u_icon, u_color, default_vocab) in enumerate(units_metadata, 1):
    unit_md = f"""---
unitTitle: "Unit {u_idx}: {u_title}"
courseId: "advanced-writing"
sourceLanguage: "zh"
targetLanguage: "en"
level: "C1"
questionType: "writing"
---

"""
    for l_idx in range(1, 11):
        lesson_title = f"{u_short}: Advanced Topic {l_idx}"
        lesson_desc = f"Examine complex dimensions of {u_title.lower()} (Perspective {l_idx})"
        
        unit_md += f"""---
lessonTitle: "{lesson_title}"
description: "{lesson_desc}"
icon: "{u_icon}"
color: "{u_color}"
---

[writing]
text: "Write this passage in English"
sentence: "Discuss the multifaceted implications of {u_title.lower()} (Perspective {l_idx}) in contemporary society, analyzing underlying causes and proposing robust solutions. || Key vocabulary hints: {default_vocab}, paradigm, mitigation, stakeholder, foresight"
answer: "The contemporary discourse surrounding {u_title.lower()} has ignited profound theoretical and practical debates across global societies. || On one hand, rapid structural evolution brings unprecedented opportunities for efficiency and innovation, yet it simultaneously exacerbates socioeconomic disparities and institutional friction. When traditional frameworks fail to adapt to modern realities, systemic vulnerabilities emerge, affecting vulnerable populations disproportionately. On the other hand, proactive policy interventions and collaborative stakeholder engagement can harness these technological and economic forces for collective benefit. || To address these multifaceted challenges effectively, policymakers must implement robust regulatory safeguards, invest heavily in transparent public infrastructure, and foster continuous cross-sector dialogue. Furthermore, empowering local communities ensures that modernization aligns with fundamental human values and ecological sustainability. || Ultimately, navigating the complexities of {u_title.lower()} requires unwavering commitment to distributive justice, foresight, and collaborative governance."
acceptAlso: "While criticisms regarding {u_title.lower()} are prevalent, I maintain that its overarching trajectory offers significant potential for human advancement when properly regulated."
core: "Comprehensive analysis of {u_title.lower()} reveals complex challenges requiring multi-dimensional policy responses, institutional reform, and unwavering commitment to social justice."
srsWords: "sophisticated" "framework" "implications" "governance" "sustainability"

"""

    filename = f"content/advanced-writing-unit-{u_idx}.md"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(unit_md)
    print(f"Generated {filename}")

print("Successfully generated all 20 units and 200 advanced writing lessons!")
