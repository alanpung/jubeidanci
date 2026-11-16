import os

os.makedirs("content", exist_ok=True)

# Write course definition
course_content = """---
id: "advanced-writing"
courseTitle: "Advanced Writing"
description: "Advanced C1/C2 English writing - write sophisticated 200-300 word essays with detailed multi-paragraph arguments and vocabulary hints"
sourceLanguage: "zh"
targetLanguage: "en"
level: "C1"
visibility: "public"
---
"""
with open("content/advanced-writing.md", "w", encoding="utf-8") as f:
    f.write(course_content)

unit_topics = [
    ("Artificial Intelligence & Human Labor", "AI & Labor", "🤖", "#2563EB", "Explore artificial intelligence, automation, labor displacement, and future economic structures."),
    ("Global Economic Shifts & Inequality", "Global Economics", "💰", "#059669", "Analyze macroeconomic trends, wealth distribution, inflation, and globalization."),
    ("Climate Change & Environmental Governance", "Environment", "🌱", "#10B981", "Discuss ecological preservation, carbon pricing, renewable transitions, and climate resilience."),
    ("Biotechnology & Genetic Ethics", "Biotech", "🧬", "#6366F1", "Examine gene editing, synthetic biology, medical ethics, and bio-surveillance."),
    ("Urbanisation & Smart Megacities", "Urban Planning", "🏙️", "#3B82F6", "Evaluate urban sprawl, smart infrastructure, housing crises, and sustainable city living."),
    ("Higher Education & Knowledge Economy", "Education", "🎓", "#8B5CF6", "Analyze academic research, university financing, digital learning, and intellectual capital."),
    ("Social Media & Psychological Wellbeing", "Digital Society", "📱", "#EC4899", "Explore algorithmic echo chambers, attention economies, and digital mental health."),
    ("Globalisation & Cultural Preservation", "Global Culture", "🌍", "#F59E0B", "Investigate cultural homogenization, linguistic diversity, and cross-border exchange."),
    ("Criminal Justice & Rehabilitation", "Justice", "⚖️", "#4B5563", "Discuss penal reform, recidivism, restorative justice, and algorithmic sentencing."),
    ("Public Health & Healthcare Systems", "Healthcare", "🏥", "#EF4444", "Examine pandemic preparedness, universal healthcare access, and medical commodification."),
    ("Automation & The Future of Work", "Future of Work", "⚙️", "#14B8A6", "Analyze robotic integration, remote work evolution, and lifelong professional re-skilling."),
    ("Space Exploration & Resource Allocation", "Space Tech", "🚀", "#6D28D9", "Discuss commercial space flight, astrobiology ethics, and extraterrestrial resource rights."),
    ("Renewable Energy & Geopolitics", "Clean Energy", "⚡", "#D97706", "Evaluate energy independence, grid modernization, and critical mineral supply chains."),
    ("Media Literacy & Information Integrity", "Media Ethics", "📰", "#DC2626", "Examine deepfakes, disinformation campaigns, journalistic ethics, and epistemic trust."),
    ("Demographic Aging & Social Security", "Demographics", "🧓", "#0D9488", "Analyze super-aged societies, pension solvency, intergenerational equity, and eldercare."),
    ("International Diplomacy & Conflict Resolution", "Diplomacy", "🕊️", "#2563EB", "Discuss multilateralism, economic sanctions, cyber warfare, and peace-building frameworks."),
    ("Cultural Heritage & Tourism Management", "Heritage", "🏛️", "#7C3AED", "Evaluate overtourism, heritage preservation, cultural commodification, and sustainable travel."),
    ("Corporate Social Responsibility & Ethics", "CSR", "🏢", "#059669", "Examine stakeholder capitalism, corporate transparency, whistleblowing, and ethical supply chains."),
    ("Scientific Research & Commercialization", "Science", "🔬", "#2563EB", "Discuss open science, patent monopolies, academic integrity, and technology transfer."),
    ("Philosophy of Technology & Post-Humanism", "Philosophy", "🔮", "#4F46E5", "Explore transhumanism, technological determinism, human dignity, and cybernetic futures.")
]

for u_idx, (u_title, u_short, u_icon, u_color, u_desc) in enumerate(unit_topics, 1):
    lessons_md = f"""---
unitTitle: "Unit {u_idx}: {u_title}"
courseId: "advanced-writing"
sourceLanguage: "zh"
targetLanguage: "en"
level: "C1"
questionType: "writing"
---

"""
    for l_idx in range(1, 11):
        lesson_titles = [
            f"Dimensions of {u_short} (Part {l_idx})" for l_idx in range(1, 11)
        ]
        l_title = f"{u_short}: Advanced Theme {l_idx}"
        lessons_md += f"""---
lessonTitle: "{l_title}"
description: "{u_desc} - Essay Focus {l_idx}"
icon: "{u_icon}"
color: "{u_color}"
---

[writing]
text: "Write this passage in English"
sentence: "在现代社会中，关于{u_title}的议题（维度 {l_idx}）引发了深刻的理论与现实讨论。请多维分析其核心挑战，并提出建设性对策。 || 开头：现象背景与宏观复杂性 || 原因与多维影响：技术驱动与制度滞后、社会分化与资源分配失衡、心理与伦理冲击 || 应对策略：加强跨界治理、推动制度创新、强化公众参与与监督 || 结尾：可持续发展的远见与人类福祉的平衡 || （请写成4/5段：开头点题、2/3中间段、结尾总结。字数200-300）"
answer: "The contemporary discourse surrounding {u_short.lower()} (dimension {l_idx}) has ignited profound theoretical and practical debates across global societies. || On one hand, rapid structural evolution brings unprecedented opportunities for efficiency and innovation, yet it simultaneously exacerbates socioeconomic disparities and institutional friction. When traditional frameworks fail to adapt to modern realities, systemic vulnerabilities emerge, affecting vulnerable populations disproportionately. On the other hand, proactive policy interventions and collaborative stakeholder engagement can harness these technological and economic forces for collective benefit. || To address these multifaceted challenges effectively, policymakers must implement robust regulatory safeguards, invest heavily in transparent public infrastructure, and foster continuous cross-sector dialogue. Furthermore, empowering local communities ensures that modernization aligns with fundamental human values and ecological sustainability. || Ultimately, navigating the complexities of {u_short.lower()} requires unwavering commitment to distributive justice, foresight, and collaborative governance."
acceptAlso: "While criticisms regarding {u_short.lower()} are prevalent, I maintain that its overarching trajectory offers significant potential for human advancement when properly regulated."
core: "Comprehensive analysis of {u_short.lower()} reveals complex challenges requiring multi-dimensional policy responses, institutional reform, and unwavering commitment to social justice."
srsWords: "sophisticated" "framework" "implications" "governance" "sustainability"

"""

    filename = f"content/advanced-writing-unit-{u_idx}.md"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(lessons_md)
    print(f"Generated {filename}")

print("Successfully generated Advanced Writing course with 20 units and 200 total essays!")
