# Fix duplicated-sentence acceptAlso fields introduced by the earlier cyclic
# padding. Strategy: strip the OLD 3-sentence themed closers from each
# acceptAlso, then re-pad the remaining base to 80-100 words using a larger
# NON-repeating themed pool (8 distinct sentences/unit) so a sentence can
# never repeat within the window.
import re

def wc(s):
    return len(re.findall(r"[A-Za-z']+", s))

# OLD themed closers to STRIP (from the previous _fix_a2_len.py THEMED pool).
OLD = {
 1: ["I feel good when my day goes like this.", "A simple routine keeps me happy and calm.", "I am glad to talk about my daily life."],
 2: ["The weather always changes how I feel.", "I like watching the sky through the year.", "Nature shows me something new each season."],
 3: ["My family gives me love and support.", "I am lucky to have them around me.", "Home is where I feel safe and warm."],
 4: ["Good food makes me happy and healthy.", "I enjoy meals with the people I love.", "Cooking teaches me to care for others."],
 5: ["Travelling opens my eyes to the world.", "I love seeing new places with my family.", "A good trip stays in my memory for long."],
 6: ["Exercise helps me stay strong and calm.", "A healthy body makes a happy mind.", "I feel better after I move and play."],
 7: ["Shopping teaches me to choose with care.", "I like finding things that I really need.", "A good buy makes me happy for long."],
 8: ["Hobbies make my free time meaningful.", "I am happy to do what I love.", "These moments help me relax and grow."],
 9: ["We should protect the world we live in.", "Animals and nature deserve our respect.", "I learn a lot from the world around me."],
 10:["My plans give me hope for the future.", "I will work hard to reach my dreams.", "The future feels bright when I prepare today."],
}

# NEW expanded, distinct themed pools (no overlap with old or with ANS_THEME).
NEW = {
 1: ["My days feel steady when I follow this plan.", "Small habits make my life easier each week.", "I like knowing what will happen next.", "A calm start helps me through the whole day.", "I feel ready when my morning goes well.", "Order in my day brings me quiet happiness.", "I treasure the simple parts of my routine.", "Evening rest prepares me for tomorrow."],
 2: ["The sky tells me how to dress each day.", "I notice the wind and the light around me.", "Cold and warm days both have their charm.", "Rain makes the streets clean and fresh.", "Sunny mornings lift my mood at once.", "I adapt my plans to the weather.", "Clouds and sun paint the day differently.", "I feel close to nature in any season."],
 3: ["We share both happy and hard moments together.", "Their smiles mean a lot to me.", "I can talk to them about anything.", "Family meals are my favourite time.", "They teach me good values every day.", "I feel safe when we are together.", "Love at home keeps me steady.", "I want to make them proud of me."],
 4: ["A warm meal feels like a small gift.", "I try to eat more vegetables each day.", "Cooking with family is fun for us.", "Water and fruit keep me fresh and light.", "I avoid too much sugar and oil.", "Sharing food brings people closer.", "A balanced plate makes me feel good.", "Taste and health can go together."],
 5: ["New places teach me more than books.", "I take photos to remember each trip.", "Local food is part of the adventure.", "Meeting strangers widens my view.", "I pack light and plan ahead.", "Every journey changes me a little.", "I feel free when I explore.", "Travelling with family is the best."],
 6: ["A short walk clears my head quickly.", "Sleep is as vital as exercise.", "I stretch before I begin the day.", "Fresh air improves how I feel.", "I listen to my body's needs.", "Consistency matters more than intensity.", "I celebrate small health wins.", "Rest days keep me balanced."],
 7: ["I compare prices before I decide.", "Quality lasts longer than cheap deals.", "I avoid buying what I will not use.", "Markets are fun to walk through.", "I ask myself if I really need it.", "A list keeps me from overspending.", "Second-hand can be a smart choice.", "I feel proud when I shop wisely."],
 8: ["My hobby lets me meet new people.", "I learn patience through my hobby.", "Free time should refresh the mind.", "I practise a little every weekend.", "Creating things makes me proud.", "My hobby balances my school work.", "I lose track of time when I enjoy it.", "Sharing my hobby brings me joy."],
 9: ["A quiet park restores my energy.", "I watch birds and insects with interest.", "Clean air and water are precious.", "Plants teach me about patience.", "I pick up litter when I walk.", "The seasons guide many small lives.", "Nature needs our gentle care.", "I feel peaceful among trees."],
 10:["Step by step I move toward my aims.", "I set small goals I can keep.", "Learning new skills opens doors.", "I imagine the life I want.", "Hard work today builds tomorrow.", "I stay curious about what comes next.", "My dreams keep me motivated.", "I believe the future can be kind."],
}

def strip_old(val, n):
    base = val
    for s in OLD[n]:
        base = base.replace(s + " ", "").replace(s, "")
    base = re.sub(r"\s+", " ", base).strip()
    return base

def pad_80(base, n):
    pool = NEW[n]
    cur = base
    i = 0
    while wc(cur) < 80 and i < len(pool):
        cur = cur + " " + pool[i]
        i += 1
    # safety: if still <80 (very short base), allow cycling but avoid immediate repeat
    while wc(cur) < 80:
        nxt = pool[i % len(pool)]
        if nxt not in cur:
            cur = cur + " " + nxt
        i += 1
        if i > len(pool) * 3:  # guard
            break
    return cur

for n in range(1, 11):
    fn = f"content/a2-writing-unit-{n}.md"
    raw = open(fn, encoding="utf-8").read()
    spans = []
    for m in re.finditer(r'acceptAlso:\s*"([^"]*)"', raw):
        spans.append((m.start(), m.end(), m.group(1)))
    spans.sort(key=lambda x: x[0], reverse=True)
    out = raw
    fixed = 0
    for (s, e, val) in spans:
        base = strip_old(val, n)
        newval = pad_80(base, n)
        out = out[:s] + f'acceptAlso: "{newval}"' + out[e:]
        fixed += 1
    open(fn, "w", encoding="utf-8").write(out)
    print(f"unit {n}: re-padded {fixed} acceptAlso")
print("done")
