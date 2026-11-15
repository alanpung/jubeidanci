# Inject a `core:` (faithful, compact translation) line into every [writing]
# lesson block, right after its `answer:` line. Core is keyed by the exact
# Chinese `sentence:` text (loaded from _zh_sentences.json) so matching is robust.
import json, re

ZH = json.load(open("/workspace/_zh_sentences.json", encoding="utf-8"))
# Build ordered list of Chinese sentences per unit.
by_unit = {int(k): v for k, v in ZH.items()}

# ---- Faithful core translations, in the SAME order as _zh_sentences.json ----
CORES = {
 1: [
  "I get up at half past six every morning. First I brush my teeth and wash my face, then I eat breakfast. At half past seven I take the bus to school. The trip takes about twenty minutes. At school I chat with my friends. I like the morning because I can start a new day and feel full of hope.",
  "I usually eat a simple breakfast. I drink a glass of milk, eat two pieces of bread and some fruit. Sometimes I also eat an egg. I do not like coffee because it is too bitter. Breakfast is important, so I eat it every day. After breakfast I feel energetic and can study well.",
  "I walk to school every day because my home is close to it. The walk takes only five minutes. On the way I see many trees and small birds. When the weather is good I enjoy this walk. If it rains I use an umbrella. I like walking to school because it keeps me healthy and awake.",
  "In the afternoon I have some lessons and homework. After school I often go to the library to read. I like quiet places. Sometimes I play table tennis with my classmates. Sport makes me healthier. The afternoon passes quickly. I am busy but happy because I am with my friends.",
  "In the evening I eat dinner at home, then help my mother wash the dishes. After that I do my homework and review the next day's lessons. At nine I take a shower and read for a while. Before ten I go to bed. I like the quiet evening because I can relax and think about the day.",
  "On weekend mornings I get up a bit later. I get up at eight and eat a big breakfast. Then I help my father clean the rooms. Sometimes I go to the park to run. Weekend mornings are relaxing because I do not have to go to school. I like the weekend and can rest well.",
  "Every evening I study for two hours. First I review English words, then I do maths problems. When I meet a problem I cannot solve, I ask my brother. Studying makes me smarter. Although I am sometimes tired, I know studying is important. I hope to get good exam results and go to a good high school.",
  "I often help at home. Every day I take out the rubbish, and at weekends I sweep the floor. When my mother cooks, I wash the vegetables. My father says I am sensible. Helping with housework makes me feel like a real member of the family. Although a bit tired, I am happy to see the clean house and feel more responsible.",
  "Yesterday I was very busy. In the morning I had an exam, and in the afternoon I had football training. After school I went to the supermarket to buy things. At night I did homework until late. Although tired, I finished everything. I felt a sense of achievement and learned to manage my time better.",
  "My ideal day starts with sleeping late. In the morning I eat my favourite food, then go to play football with friends. In the afternoon we watch a film and eat popcorn. In the evening the family eats and chats together. No homework, no stress. I hope every day can be this happy and free.",
 ],
 2: [
  "The weather is nice today. The sky is blue and the sun shines warmly. The wind is light. I wear a thin coat and go for a walk. Little birds sing in the trees. This weather makes me happy. I like going out and reading in the sunshine.",
  "It rained all day yesterday. I could not play outside and had to stay at home. I sat by the window and watched the raindrops fall. My mother made hot soup. Although a bit bored, I felt relaxed listening to the rain. I hope tomorrow is sunny so I can go out.",
  "My favourite season is autumn. The weather is neither cold nor hot and is very comfortable. Leaves turn yellow and red and look beautiful. I can ride a bike in the park. There is also much autumn fruit, such as apples and grapes. I think autumn is the most beautiful season and best for walking.",
  "Last summer holiday I went to the seaside with my family. We stayed in a small hotel. During the day we swam and built sandcastles. In the evening we ate seafood. The weather was hot but I was happy. I hope to go there again this summer.",
  "Winter mornings are cold. I go out only in a thick coat, hat and gloves. Sometimes there is frost on the ground. My breath becomes white mist. Although cold, winter mornings are quiet and clean. I like the white frost on the roofs; it looks like a painting.",
  "In spring the park is full of flowers. The grass turns green and trees grow new leaves. Many people fly kites and take walks. I also like riding a bike in the park. The spring air is fresh and makes me feel hopeful and full of energy.",
  "It is very windy today. While walking, the wind blew my hat away. The trees sway strongly. My mother asked me to wear a coat. Although windy, the sky is blue. After school my friend and I flew a kite; the wind helped a lot and it flew high.",
  "The weather decides what I wear. When it is hot I wear a T-shirt and shorts. When it is cold I wear a sweater and coat. In rain I take an umbrella. I think dressing for the weather is important so I do not get sick. What about you? What do you wear in winter?",
  "There are four seasons in a year. Spring is warm, summer is hot, autumn is cool and winter is cold. I have favourite activities for each season: watching flowers in spring, swimming in summer, cycling in autumn and making snowmen in winter. The seasons make life more interesting and varied.",
  "Last Sunday was very hot. The temperature reached thirty-five degrees. I stayed home with a fan and drank lots of water. In the afternoon I ate watermelon and ice cream. In the evening it was a bit cooler and I went for a walk. On hot days we should drink more water and avoid the sun.",
 ],
 3: [
  "My mother is a teacher. She is gentle and always smiles. She gets up early every day to make breakfast for me. She helps me with my homework. I love her very much. I hope to help others like her when I grow up and be as patient as her.",
  "My father is a driver. He works hard but plays with me every day at home. At weekends he teaches me to ride a bike. He is strong and humorous. I admire him. He is my role model and I want to be as reliable as him.",
  "I have a sister who is eight years old. She likes drawing and draws very well. We often play games together. Sometimes we quarrel but soon make up. I like her because she keeps me from being lonely and teaches me to care for others.",
  "My grandparents live in the countryside. Next to their house is a small garden. Grandfather grows vegetables and grandmother cooks delicious food. I visit them every week. They love me dearly and I love them too, and hope to spend more time with them.",
  "Last night my whole family ate dinner together. Mother made fish and soup. Father told funny things. We laughed while eating. After eating we cleared the table together. Such moments make me feel warm and bring us closer.",
  "At weekends my family often goes climbing or to the cinema. Last week we had a picnic in the countryside. Father grilled meat and mother prepared fruit. I ran on the grass. Weekends with family are always happy and help me relax.",
  "On the table there is a family photo. In it we smile happily. It was taken on my tenth birthday. Behind us is the living room. Every time I see it, I remember that day's joy and my family's love for me.",
  "Last summer my whole family went to the seaside. We went by train and stayed three days. In the daytime we swam, at night we watched stars. My little brother saw the sea for the first time and was excited. That trip was unforgettable and I hope to go again.",
  "I help with housework at home. Every day I take out the rubbish, at weekends I wipe the table. When mother cooks I wash the vegetables. Father says I am good. Helping makes me feel grown up and more responsible, willing to give for the family.",
  "My family has some rules. I must sleep before nine and finish homework first. I cannot look at my phone while eating. Although there are many rules, I know they are good for me. They make me more regular and teach me self-discipline.",
 ],
 4: [
  "My favourite food is dumplings. On every festival, mother makes dumplings. Dumplings have meat and vegetables inside and smell good. I also help to shape them. Eating dumplings makes me feel the warmth of home and think of reunion.",
  "Yesterday I cooked noodles for the first time. I first boiled water, then put in the noodles. I added an egg and green vegetables. It was a bit salty but my family said it was tasty. I think cooking is fun and want to learn more dishes to surprise my family.",
  "Last weekend my friend and I went to an Italian restaurant. We ordered pizza and salad. The service was good and the food delicious. After the meal we ate tiramisu. That meal made me satisfied and I want to go again with my family.",
  "I think healthy eating is important. I eat fruit and vegetables every day and drink less cola. Eat a good breakfast and a light dinner. Drink more water and eat less fried food. Good eating habits give me more energy and fewer illnesses.",
  "My breakfast habit is simple. I usually eat bread, an egg and drink milk. At weekends I eat more, like pancakes. I think breakfast gives me energy to study in the morning, so I never skip it.",
  "I like eating lots of fruit and vegetables. Apples, bananas and oranges are my favourites. Among vegetables I like tomatoes and broccoli. They are good for the body and prevent illness. Mother often asks me to eat more and I am willing.",
  "Last week I had my birthday. Mother made a table of good dishes and a cake. Relatives and friends came. We sang, made wishes and blew out candles. The meal was tasty and lively; I was happy and will not forget it.",
  "Zongzi is a traditional food from my hometown. Everyone eats it at the Dragon Boat Festival. It is made of glutinous rice and meat wrapped in bamboo leaves. It smells good. Every time I eat it I remember grandmother's skill and my childhood.",
  "Between classes I like snacks like biscuits and yogurt. In summer I like juice and iced water. But mother tells me snacks cannot replace meals. Eating moderately is healthy, and I try to choose fruit.",
  "This month I started learning to cook. I first learned to fry eggs and make soup. Although I burnt the egg the first time, the second was much better. I want to cook for my family later. Learning to cook makes me more independent and gives a sense of achievement.",
 ],
 5: [
  "Last month my family and I went to the beach. We set off in the morning and arrived in the afternoon. The sea was blue and the sand soft. I built a sandcastle and collected shells. That day I was relaxed, got a bit tanned and was very happy.",
  "On my last holiday I went to Beijing. I visited the Great Wall and the Forbidden City. There were many people but it was grand. I ate Beijing roast duck and it was delicious. This trip taught me much history and I took many photos.",
  "Before leaving I packed my suitcase. I put in clothes, a toothbrush and a charger. Mother reminded me to bring an umbrella and medicine. I sorted things well so they are easy to find. Being packed made me calm and reassured.",
  "Last year I visited Shanghai. There are many tall buildings and shopping centres. I took the subway, which was convenient. At night the Bund's lights were beautiful. I like this modern, lively city and hope to return.",
  "I like travelling by train. Trains are smoother than cars and let you see the view outside. Last time to grandmother's I took a three-hour train. On board I read and ate snacks. Trains make travel comfortable and not tiring.",
  "Last week we went climbing. The mountain was high and the path a bit steep. We rested several times on the way. At the top the view was especially beautiful and we could see clouds. Although tired, I felt it was worth it and had a sense of achievement.",
  "During summer holiday we stayed at a seaside hotel. The room was clean and had a sea view. Breakfast was rich with bread and fruit. The staff were friendly. Staying at the hotel felt like a holiday and was very relaxing.",
  "I dream of going to Japan to see cherry blossoms. I want to go in spring and wear a kimono for photos. I also want to try sushi and ride the Shinkansen. If it comes true I will be very happy. It is one of my biggest wishes and I will save money for it.",
  "Last week school organised a trip to the museum. We saw dinosaur fossils and ancient coins. The guide told many stories. I found it interesting and learned knowledge. Next time I want to go again with my family.",
  "Last year while travelling I got lost. In the crowd I was separated from my parents. I was scared but remembered their phone number. I asked staff for help and we reunited. This taught me to stay calm and memorise the number.",
 ],
 6: [
  "Every morning I run for twenty minutes. After school I also stretch. At weekends I play basketball with friends. Sport makes my body stronger and my mood better. I plan to keep it up and not give up.",
  "My favourite sport is swimming. In summer I often go to the pool. Swimming trains the whole body and is not easy to injure. After each swim I feel relaxed. I hope to swim faster later and maybe join the school team.",
  "To stay healthy I watch my diet. I eat less sugar and fried food and more vegetables and fish. I drink enough water every day. Good diet plus exercise makes me rarely ill and more energetic.",
  "Last week I caught a cold. In the morning I had a headache and fever. Mother told me to rest in bed and drink lots of warm water. In the afternoon I slept and felt a bit better. Being ill showed me how important health is and to sleep early.",
  "Every day I walk to school, about fifteen minutes. While walking I breathe fresh air and think about the day's plan. Compared with taking a car, walking is greener. I think walking is good exercise and also saves money.",
  "I think staying healthy needs three parts: exercise, diet and sleep. I exercise three times a week, eat balanced meals and sleep before ten. Keeping these habits, my strength improves and I have more energy.",
  "Besides swimming, I also like cycling. At weekends my father and I ride to the river. The wind on my face feels nice. Cycling lets me see scenery and exercise. It is my way to relax and makes me more independent.",
  "The day before yesterday my stomach hurt and mother took me to see a doctor. The doctor was gentle and asked many questions. He gave me medicine and told me to drink water and rest. After the medicine I felt much better. I thanked the doctor and watched my diet.",
  "I sleep about nine hours every day. Enough sleep gives me energy the next day. At weekends I also nap half an hour. I think rest is as important as effort. Sleeping well helps me study better and keeps my mood steady.",
  "I do not like sitting all the time. Between classes I walk on the playground. At weekends I often climb or cycle. Staying active makes me healthier and more confident. Moving is better than lying down, and I encourage friends to join.",
 ],
 7: [
  "Yesterday my mother and I went to buy shoes. I tried several pairs and finally chose blue trainers. They are comfortable and not expensive. I was happy in the new shoes, ready to wear them to school tomorrow and take care of them.",
  "At the weekend my grandmother and I went to the food market. There were many fresh vegetables and fruit, and it was lively. We bought tomatoes, fish and eggs. Grandmother taught me how to choose things. The market feels full of life and I like it.",
  "My favourite is a white T-shirt and a pair of jeans. They are comfortable and easy to match. I wear them almost every week. Mother says I dress simply, but I feel most at ease and worry-free this way.",
  "On Friday evening I helped mother buy food at the supermarket. We made a list: milk, bread, eggs and vegetables. The supermarket was big and tidy. At checkout we used a membership card, saved a little and it was convenient.",
  "Last month I bought a birthday gift for my good friend. I chose a book he likes and a card. After wrapping I gave it to him. He was surprised when opening it and I felt happy too. Giving gifts expresses care and is not about being expensive.",
  "When shopping I compare prices. Some things are expensive but good quality; some are cheap but not durable. I think buying expensive is not necessary; suitability matters most. Mother also teaches me to spend rationally and not waste.",
  "Sometimes I now shop online. There is more choice and it is cheaper than physical shops. But I must wait for delivery and cannot see the real item. Mother reminds me to be careful online, avoid scams and read reviews.",
  "Winter came and mother bought me a new coat. It is dark blue and very warm. The zip is smooth too. Wearing it outside I am not afraid of cold. I like this gift and thank mother.",
  "In winter I wear many clothes to keep warm. I wear a sweater, thick coat, hat and gloves. When it is very cold, mother tells me to wear more. Suitable winter clothes let me not fear the cold and go out to play in snow, happily.",
  "Last week I bought a piece of clothing that did not fit because I did not try it on. At home I found it too big. Mother helped me return it. This lesson taught me to always try on clothes and not act on impulse.",
 ],
 8: [
  "My hobby is stamp collecting. I have collected stamps from many countries, over a hundred. Behind each stamp is a story. Collecting stamps lets me learn about the world, calms me down and keeps me away from screens.",
  "I like reading storybooks, especially adventure novels. Every night before sleep I read for twenty minutes. Reading enriches my imagination and teaches many new words. I hope to read all the library's books and write my own stories.",
  "After school I often play football with classmates. We run, pass and shoot on the playground. Although we sometimes fall, we are happy. Football makes me healthier and teaches teamwork and helping each other.",
  "On weekend evenings I like watching films. I prefer comedies and cartoons. Watching with family on the sofa is relaxing. Films show me different lives, make me laugh and forget worries.",
  "In my free time I like drawing. I draw my family and scenery. Drawing with coloured pens calms me. Last time I even won a prize at the school contest. Drawing is my way to express mood and helps me focus.",
  "Every day I listen to music to relax. I like light music and pop songs. Listening a bit while doing homework makes me more focused. Music can change my mood, cheer me up and calm me down.",
  "Last weekend I cycled in the suburbs. Wild flowers bloomed by the road and the air was fresh. My friend and I stopped for a picnic. Such activity keeps me away from the phone, close to nature and more energetic.",
  "This year I started learning guitar. At first my fingers hurt, but I practise fifteen minutes daily. Now I can play simple songs. Learning an instrument needs patience but also gives achievement and makes me more confident.",
  "Grandfather teaches me to grow flowers. We put several pots on the balcony. I water them daily and watch seeds sprout. Gardening teaches me to wait and brings me close to nature. Seeing flowers bloom makes me content and peaceful.",
  "At weekends I like being with friends. We play ball, chat and go to the park. Time with friends always passes quickly. I think friendship adds colour to life and makes me happier.",
 ],
 9: [
  "My family keeps a cat named Mimi. It is cute and likes sleeping in the sun. Every day when I get home it comes to greet me. Caring for it taught me responsibility and made me more loving.",
  "Last week school organised a trip to the zoo. We saw elephants, monkeys and giraffes. Monkeys were the liveliest and made us laugh. I think protecting animals is important; we should not harm them and should give them space.",
  "Wild animals live in forests and mountains. Tigers, bears and wolves are among them. Because of human activity, some animals are in danger. We should protect their homes and not cut trees randomly.",
  "Spring comes; trees grow new leaves and flowers bloom. Downstairs there is a cherry tree with pretty pink flowers. Plants make the city more beautiful and give us oxygen. I will care for them more and not pick flowers.",
  "Last autumn I walked in a forest. The ground was covered with fallen leaves that rustled underfoot. I heard birds and saw little squirrels. The forest made me calm, away from city noise, and was healing.",
  "In the morning the park has many birds. They sing in the trees and flutter about. I often bring breadcrumbs to feed them. Watching birds fly makes me happy and makes me notice nature and learn to observe.",
  "I think protecting the environment is everyone's duty. We should drive less, plant more trees and not litter. Nature gives us fresh air and water. If we do not protect it, the future will be worse, so act now.",
  "My favourite animal is the dolphin. They are smart, friendly and can save people. I saw a dolphin show at the aquarium and it was wonderful. I hope to protect their ocean home and reduce pollution later.",
  "The ocean covers most of the earth. Many creatures live there, such as fish, turtles and whales. The ocean regulates climate and gives us resources. We must reduce pollution, protect the ocean and leave it for later generations.",
  "In spring my classmates and I visited a farm. We saw cows, sheep and chickens. We also tasted fresh milk and eggs. The farmer took us to pick strawberries. The farm showed me where food comes from and taught me to treasure it.",
 ],
 10: [
  "When I grow up I want to be a doctor. Doctors can save lives and are respected. To realise my dream I must study science and English well now. I hope to help many patients in the future and give back to society.",
  "Next year I plan to study harder, especially maths. I also want to join the school football team. In summer I plan to travel with my family. I look forward to next year and will act step by step.",
  "I am learning English and later want to learn Japanese. Learning languages lets me meet people from different cultures. Although memorising words is hard, improving a little each day makes me happy. I want to communicate fluently and travel later.",
  "I want to go to the Great Wall. It is a world-famous building and very grand. I want to stand on the wall to take photos and see the distant mountains. If I go, I will be very excited and love my country and history more.",
  "In the future I hope to live in a house with a garden. The garden is full of flowers and trees, and I can keep a dog. The house should be bright and quiet. Such a home will make me feel safe and happy and good to live in.",
  "I think helping others is important. At school I help classmates with problems; on the bus I give up my seat. Seeing others happy makes me happy too. I hope to do more volunteer work later and give back to society.",
  "I started saving my pocket money. I have a piggy bank and put a little in each week. Mother teaches me to tell want from need. Saving lets me buy more expensive school supplies and learn restraint, preparing for the future.",
  "My goal is to become healthier. I plan to exercise four times a week and eat fewer snacks. I also sleep earlier and watch less screen. After a month, I felt much stronger and more energetic.",
  "I have a few small goals. This term I want to improve my spoken English and also learn to swim. In the long run I want to enter a good high school. Writing goals down gives me more motivation and makes it easy to check progress.",
  "When I am twenty I hope to be at university already. I will live independently and arrange my own time. I want to make friends from many places. Then I will be more mature, confident and grateful.",
 ],
}

# sanity: counts
for u in range(1,11):
    assert len(by_unit[u]) == 10, (u, len(by_unit[u]))
    assert len(CORES[u]) == 10, (u, len(CORES[u]))

# ---- inject ----
def inject_unit(n):
    fn = f"content/a2-writing-unit-{n}.md"
    raw = open(fn, encoding="utf-8").read()
    # collect answer spans in order
    ans_spans = [(m.start(), m.end(), m.group(1)) for m in re.finditer(r'answer:\s*"([^"]*)"', raw)]
    # collect sentence spans in order
    sent_spans = [(m.start(), m.group(1)) for m in re.finditer(r'sentence:\s*"([^"]*)"', raw)]
    assert len(ans_spans) == 10, (fn, len(ans_spans))
    assert len(sent_spans) == 10, (fn, len(sent_spans))
    # match each answer to the nearest preceding sentence
    out = raw
    # process from the end so indices stay valid
    order = list(range(10))[::-1]
    for i in order:
        a_s, a_e, _ = ans_spans[i]
        # find sentence whose start is the largest start < a_s
        sval = None
        for (s_s, s_text) in sent_spans:
            if s_s < a_s:
                sval = s_text
        assert sval is not None
        core = CORES[n][by_unit[n].index(sval)]
        # insert core line right after the answer line (before next newline block)
        out = out[:a_e] + '\ncore: "' + core + '"' + out[a_e:]
    open(fn, "w", encoding="utf-8").write(out)
    return len(ans_spans)

total = 0
for n in range(1,11):
    total += inject_unit(n)
print("injected core into", total, "lessons")
