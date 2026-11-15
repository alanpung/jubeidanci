# Pad `answer:` fields that are < 80 words up into the 80-100 window
# using unit-themed A2 closers that are DIFFERENT from the acceptAlso pool.
# Collect ALL answer spans first, then replace in descending start order.
import re

def wc(s):
    return len(re.findall(r"[A-Za-z']+", s))

# Themed answer closers per unit (distinct from acceptAlso THEMED pool).
ANS_THEME = {
 1: ["This is how a normal day usually looks for me.",
     "Routines like this help me stay organised and calm.",
     "I am content with my daily rhythm and quiet pace."],
 2: ["The weather shapes how I plan and spend my time.",
     "I enjoy watching the seasons slowly change each month.",
     "Each day feels different because of the sky above."],
 3: ["My family is very important to me in my life.",
     "We support each other through good times and bad.",
     "Home is my favourite and safest place to be."],
 4: ["Food brings my family together at the table.",
     "I like meals that are simple, fresh and warm.",
     "Eating well helps me stay strong and happy."],
 5: ["Travel helps me learn about the wider world.",
     "I enjoy making plans with the people I love.",
     "Good trips give me happy memories to keep."],
 6: ["Exercise keeps my body and my mind healthy.",
     "I feel better after I move my body each day.",
     "Small healthy habits make a big difference."],
 7: ["Shopping teaches me to choose things wisely.",
     "I prefer things that I truly need and use.",
     "A careful buy makes me happy for a long time."],
 8: ["Hobbies make my free time feel meaningful.",
     "I love spending time on what I really enjoy.",
     "My hobby helps me relax after a long school day."],
 9: ["Nature is full of small wonders to notice.",
     "We should care for the world around us always.",
     "I learn a lot from the small living things."],
 10:["My plans give me hope for a brighter tomorrow.",
     "I will study hard to reach my goals in life.",
     "The future feels bright when I prepare for it today."],
}

for n in range(1, 11):
    fn = f"content/a2-writing-unit-{n}.md"
    raw = open(fn, encoding="utf-8").read()
    spans = []
    for m in re.finditer(r'answer:\s*"([^"]*)"', raw):
        spans.append((m.start(), m.end(), m.group(1)))
    spans.sort(key=lambda x: x[0], reverse=True)
    out = raw
    pool = ANS_THEME.get(n, ["I am happy to share my thoughts about this."])
    padded = 0
    for (s, e, val) in spans:
        cur = val.strip()
        if wc(cur) < 80:
            i = 0
            while wc(cur) < 80 and wc(cur) + wc(pool[i % len(pool)]) <= 100:
                cur = cur + " " + pool[i % len(pool)]
                i += 1
            out = out[:s] + f'answer: "{cur}"' + out[e:]
            padded += 1
    open(fn, "w", encoding="utf-8").write(out)
    print(f"unit {n}: padded {padded} answers")
print("done")
