#!/usr/bin/env python3
"""Top up the A1 Fill in the Blank course from 10 to 20 lessons per unit.

Each of the five units originally shipped 10 lessons x 5 words = 50 words.
This appends Lessons 11-20 to every unit, adding 50 fresh words per unit
(250 new words overall, 100 words per unit / 500 words across the course).

Every new srsWord is the dictionary's own base form and CEFR-tagged A1/A2 in
words/english_merged.json; none of them appeared in the original 229 words.
Chinese matching-pair labels are derived from the same dictionary so the
glosses stay consistent with the rest of the app.

Idempotent: a unit that already contains "Lesson 11" is left untouched.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT_PATH = ROOT / "words" / "english_merged.json"

# Colours follow the existing unit palette (10 lessons -> 10 distinct accents).
COLORS = [
    "#FF6B6B", "#FF8C42", "#F7B731", "#5F27CD", "#54A0FF",
    "#00D2D3", "#1DD1A1", "#EE5A6F", "#786FA6", "#FECA57",
]

# The dictionary's first gloss is usually perfect, but a few are literary or
# ambiguous for a beginner. Keep these short and concrete.
ZH_OVERRIDE = {
    "hi": "嗨", "bye": "再见", "thanks": "谢谢", "sorry": "抱歉",
    "okay": "可以", "sure": "确定", "welcome": "欢迎", "excuse": "原谅",
    "circle": "圆形", "square": "正方形", "line": "线", "point": "点",
    "side": "边", "brown": "棕色", "pink": "粉红色", "orange": "橙色",
    "uncle": "叔叔", "aunt": "阿姨", "cousin": "表亲", "kid": "小孩",
    "people": "人们", "everyone": "每个人", "everybody": "大家",
    "someone": "某人", "anyone": "任何人", "world": "世界",
    "life": "生活", "thing": "东西", "way": "路", "part": "部分",
    "bowl": "碗", "cup": "杯子", "plate": "盘子", "knife": "刀",
    "spoon": "勺子", "soap": "肥皂", "towel": "毛巾", "brush": "刷",
    "mirror": "镜子", "comb": "梳子", "cheese": "奶酪",
    "butter": "黄油", "meat": "肉", "soup": "汤", "salad": "沙拉",
    "potato": "土豆", "tomato": "西红柿", "carrot": "胡萝卜",
    "onion": "洋葱", "bean": "豆子", "cow": "奶牛", "pig": "猪",
    "duck": "鸭子", "sheep": "羊", "chicken": "鸡", "bike": "自行车",
    "boat": "船", "taxi": "出租车", "road": "路", "ticket": "票",
    "price": "价格", "cheap": "便宜", "expensive": "贵", "pay": "付款",
    "dollar": "美元", "screen": "屏幕", "mouse": "鼠标",
    "email": "电子邮件", "message": "消息", "video": "视频",
    "desk": "书桌", "board": "黑板", "exam": "考试",
    "homework": "作业", "lesson": "课", "music": "音乐", "song": "歌",
    "picture": "画", "camera": "相机", "film": "电影",
    "cross": "穿过", "hold": "握住", "drop": "掉落", "pick": "挑选",
    "throw": "扔", "break": "打碎", "draw": "画", "paint": "涂刷",
    "fix": "修理", "ask": "问", "talk": "交谈", "call": "打电话",
    "shout": "喊叫", "reply": "回复", "remember": "记得",
    "forget": "忘记", "believe": "相信", "guess": "猜", "hope": "希望",
    "worry": "担心", "care": "关心", "miss": "想念", "wish": "希望",
    "enjoy": "享受", "meet": "见面", "invite": "邀请", "wait": "等待",
    "share": "分享", "visit": "拜访", "change": "改变",
    "happen": "发生", "become": "成为", "grow": "生长", "stay": "停留",
    "bring": "带来", "catch": "接住", "choose": "选择",
    "spend": "花费", "lose": "丢失", "bridge": "桥", "corner": "拐角",
    "station": "车站", "building": "建筑物", "zoo": "动物园",
    "left": "左边", "right": "右边", "front": "前面",
    "behind": "后面", "between": "在中间", "warm": "暖和",
    "cool": "凉爽", "dry": "干的", "wet": "湿的", "sunny": "晴朗的",
    "hair": "头发", "face": "脸", "heart": "心", "neck": "脖子",
    "knee": "膝盖", "sock": "袜子", "cap": "帽子", "jacket": "夹克",
    "sweater": "毛衣", "pocket": "口袋", "hour": "小时",
    "minute": "分钟", "second": "秒", "month": "月份", "year": "年",
    "soon": "很快", "later": "稍后", "ago": "以前",
    "already": "已经", "yet": "还", "pretty": "漂亮的",
    "funny": "好笑的", "quiet": "安静的", "careful": "小心的",
    "lucky": "幸运的", "easy": "容易的", "difficult": "困难的",
    "different": "不同的", "important": "重要的", "special": "特别的",
    "inside": "在里面", "outside": "在外面", "above": "在上方",
    "below": "在下方", "beside": "在旁边", "forest": "森林",
    "lake": "湖", "hill": "小山", "grass": "草", "leaf": "叶子",
    "cake": "蛋糕", "candy": "糖果", "party": "聚会", "bell": "铃",
    "drum": "鼓", "football": "足球", "basketball": "篮球",
    "baseball": "棒球", "tennis": "网球", "volleyball": "排球",
    "player": "运动员", "coach": "教练", "match": "比赛",
    "fan": "球迷", "card": "卡片", "spring": "春天",
    "summer": "夏天", "autumn": "秋天", "winter": "冬天", "ice": "冰",
    "notebook": "笔记本", "ruler": "尺子", "classroom": "教室",
    "exercise": "练习", "page": "页", "roof": "屋顶", "gate": "大门",
    "step": "台阶", "garage": "车库", "yard": "院子", "wood": "木头",
    "glass": "玻璃", "metal": "金属", "plastic": "塑料", "box": "盒子",
    "sweet": "甜的", "delicious": "美味的", "fresh": "新鲜的",
    "hungry": "饿的", "thirsty": "渴的", "true": "真的",
    "free": "免费的", "full": "满的", "ready": "准备好的", "safe": "安全的",
    "sad": "难过的", "angry": "生气的", "tired": "累的",
    "afraid": "害怕的", "excited": "兴奋的", "thank": "感谢",
    "black": "黑色", "white": "白色", "child": "孩子",
    "move": "移动", "climb": "爬", "fly": "飞", "swim": "游泳",
    "drive": "驾驶", "arrive": "到达", "leave": "离开",
    "return": "返回", "follow": "跟随", "carry": "搬运",
    "build": "建造", "ask": "问", "turn": "转", "thank": "感谢",
    "eleven": "十一", "twelve": "十二", "thirteen": "十三",
    "fourteen": "十四", "fifteen": "十五", "sixteen": "十六",
    "seventeen": "十七", "eighteen": "十八", "nineteen": "十九",
    "twenty": "二十",
}

# (lesson title, description, icon, [(word, sentence with ___, Chinese translation) x5])
UNITS = {
    1: [
        ("Lesson 11: Polite Greetings", "Greetings and polite words", "👋", [
            ("hi", "___, my name is Anna.", "嗨，我叫安娜。"),
            ("bye", "I say ___ to my friends.", "我跟朋友们说再见。"),
            ("please", "___ pass me the water.", "请把水递给我。"),
            ("thanks", "___ for your help.", "谢谢你的帮助。"),
            ("sorry", "I am ___ for being late.", "我很抱歉迟到了。"),
        ]),
        ("Lesson 12: Numbers 11-15", "Counting from eleven to fifteen", "🔢", [
            ("eleven", "There are ___ students in the class.", "班里有十一个学生。"),
            ("twelve", "A year has ___ months.", "一年有十二个月。"),
            ("thirteen", "My brother is ___ years old.", "我弟弟十三岁。"),
            ("fourteen", "We need ___ chairs.", "我们需要十四把椅子。"),
            ("fifteen", "I have ___ apples.", "我有十五个苹果。"),
        ]),
        ("Lesson 13: Numbers 16-20", "Counting from sixteen to twenty", "🔢", [
            ("sixteen", "She is ___ years old.", "她十六岁。"),
            ("seventeen", "There are ___ books on the desk.", "桌上有十七本书。"),
            ("eighteen", "My cousin is ___.", "我表哥十八岁。"),
            ("nineteen", "We count to ___.", "我们数到十九。"),
            ("twenty", "I have ___ pens.", "我有二十支笔。"),
        ]),
        ("Lesson 14: More Colors", "Everyday colour words", "🎨", [
            ("black", "The cat is ___.", "这只猫是黑色的。"),
            ("white", "Snow is ___.", "雪是白色的。"),
            ("brown", "I have a ___ bag.", "我有一个棕色的包。"),
            ("pink", "She likes ___ flowers.", "她喜欢粉色的花。"),
            ("orange", "My pen is ___.", "我的笔是橙色的。"),
        ]),
        ("Lesson 15: Shapes & Lines", "Simple shapes and positions", "⬛", [
            ("circle", "Draw a ___ on the paper.", "在纸上画一个圆。"),
            ("square", "The table is a ___.", "这张桌子是正方形的。"),
            ("line", "Please draw a straight ___.", "请画一条直线。"),
            ("point", "___ to the door.", "指向门。"),
            ("side", "Write on one ___ of the paper.", "写在纸的一面。"),
        ]),
        ("Lesson 16: Feelings", "How we feel", "😊", [
            ("sad", "I feel ___ today.", "我今天觉得难过。"),
            ("angry", "Don't be ___ with me.", "别生我的气。"),
            ("tired", "I am ___ after work.", "下班后我很累。"),
            ("afraid", "The child is ___ of the dark.", "这个孩子怕黑。"),
            ("excited", "We are ___ about the trip.", "我们对这次旅行很兴奋。"),
        ]),
        ("Lesson 17: Polite Replies", "Useful reply words", "🙌", [
            ("thank", "I ___ you very much.", "非常感谢你。"),
            ("welcome", "You are ___ here.", "这里欢迎你。"),
            ("excuse", "___ me, where is the station?", "打扰一下，车站在哪里？"),
            ("sure", "I am ___ he will come.", "我确定他会来。"),
            ("okay", "Is it ___ to sit here?", "坐这里可以吗？"),
        ]),
        ("Lesson 18: Extended Family", "More family words", "👨‍👩‍👧", [
            ("uncle", "My ___ lives in Beijing.", "我叔叔住在北京。"),
            ("aunt", "My ___ makes great cakes.", "我阿姨做的蛋糕很好吃。"),
            ("cousin", "My ___ is my age.", "我表弟和我同岁。"),
            ("child", "The ___ is playing outside.", "那个孩子在外面玩。"),
            ("kid", "That ___ is very funny.", "那个小孩很有趣。"),
        ]),
        ("Lesson 19: Everyone", "Words for groups of people", "👥", [
            ("people", "Many ___ are in the park.", "公园里有很多人。"),
            ("everyone", "___ likes this song.", "每个人都喜欢这首歌。"),
            ("everybody", "___ is here today.", "今天大家都到了。"),
            ("someone", "___ is waiting for you.", "有人在等你。"),
            ("anyone", "Is ___ at home?", "有人在家吗？"),
        ]),
        ("Lesson 20: Everyday Words", "Common abstract words", "🌍", [
            ("world", "The ___ is very big.", "世界很大。"),
            ("life", "I enjoy my ___ here.", "我享受这里的生活。"),
            ("thing", "This ___ is mine.", "这个东西是我的。"),
            ("way", "Can you show me the ___?", "你能告诉我怎么走吗？"),
            ("part", "I read one ___ of the book.", "我读了书的一部分。"),
        ]),
    ],
    2: [
        ("Lesson 11: Kitchen Things", "Things we use in the kitchen", "🍽️", [
            ("bowl", "I eat rice from a ___.", "我用碗吃米饭。"),
            ("cup", "She drinks a ___ of tea.", "她喝一杯茶。"),
            ("plate", "Put the bread on the ___.", "把面包放在盘子上。"),
            ("knife", "Cut the apple with a ___.", "用刀切苹果。"),
            ("spoon", "I eat soup with a ___.", "我用勺子喝汤。"),
        ]),
        ("Lesson 12: Bathroom", "Things in the bathroom", "🛁", [
            ("soap", "Wash your hands with ___.", "用肥皂洗手。"),
            ("towel", "Dry your hands with a ___.", "用毛巾擦干手。"),
            ("brush", "I ___ my teeth every morning.", "我每天早上刷牙。"),
            ("mirror", "Look in the ___.", "照照镜子。"),
            ("comb", "I ___ my hair.", "我梳头。"),
        ]),
        ("Lesson 13: More Food", "Everyday food words", "🧀", [
            ("cheese", "I like ___ on bread.", "我喜欢面包上加奶酪。"),
            ("butter", "Put ___ on the toast.", "在吐司上抹黄油。"),
            ("meat", "We eat ___ for dinner.", "我们晚餐吃肉。"),
            ("soup", "The ___ is hot.", "汤很烫。"),
            ("salad", "She makes a ___.", "她做了一份沙拉。"),
        ]),
        ("Lesson 14: Vegetables", "Common vegetables", "🥕", [
            ("potato", "I cook a ___ for lunch.", "我午餐煮一个土豆。"),
            ("tomato", "The ___ is red.", "西红柿是红色的。"),
            ("carrot", "Rabbits like ___.", "兔子喜欢胡萝卜。"),
            ("onion", "Cut the ___ carefully.", "小心切洋葱。"),
            ("bean", "I eat a green ___.", "我吃一颗青豆。"),
        ]),
        ("Lesson 15: Farm Animals", "Animals on the farm", "🐄", [
            ("cow", "The ___ gives us milk.", "奶牛给我们牛奶。"),
            ("pig", "The ___ is pink.", "这头猪是粉色的。"),
            ("duck", "The ___ swims on the lake.", "鸭子在湖上游。"),
            ("sheep", "The ___ has white wool.", "这只羊有白色的毛。"),
            ("chicken", "The ___ lays eggs.", "母鸡下蛋。"),
        ]),
        ("Lesson 16: Getting Around", "Transport and travel words", "🚲", [
            ("bike", "I ride my ___ to school.", "我骑自行车上学。"),
            ("boat", "We cross the river by ___.", "我们坐船过河。"),
            ("taxi", "Let's take a ___.", "我们打车吧。"),
            ("road", "The ___ is very long.", "这条路很长。"),
            ("ticket", "I buy a bus ___.", "我买一张公交车票。"),
        ]),
        ("Lesson 17: Shopping", "Paying for things", "🛒", [
            ("price", "What is the ___?", "价格是多少？"),
            ("cheap", "This shirt is ___.", "这件衬衫很便宜。"),
            ("expensive", "The bag is too ___.", "这个包太贵了。"),
            ("pay", "I ___ by card.", "我用卡付款。"),
            ("dollar", "It costs one ___.", "这个一美元。"),
        ]),
        ("Lesson 18: Technology", "Computers and messages", "💻", [
            ("screen", "Look at the ___.", "看屏幕。"),
            ("mouse", "Click with the ___.", "用鼠标点击。"),
            ("email", "I send an ___.", "我发一封电子邮件。"),
            ("message", "She writes a short ___.", "她写了一条短消息。"),
            ("video", "We watch a ___.", "我们看一个视频。"),
        ]),
        ("Lesson 19: At School", "School and study words", "🏫", [
            ("desk", "My books are on the ___.", "我的书在书桌上。"),
            ("board", "The teacher writes on the ___.", "老师在黑板上写字。"),
            ("exam", "I have an ___ tomorrow.", "我明天有考试。"),
            ("homework", "I do my ___ at night.", "我晚上做作业。"),
            ("lesson", "The ___ starts at nine.", "课九点开始。"),
        ]),
        ("Lesson 20: Music & Fun", "Music, pictures and films", "🎵", [
            ("music", "I listen to ___.", "我听音乐。"),
            ("song", "She sings a ___.", "她唱一首歌。"),
            ("picture", "I draw a ___.", "我画一幅画。"),
            ("camera", "He takes photos with a ___.", "他用相机拍照。"),
            ("film", "We watch a ___ tonight.", "我们今晚看电影。"),
        ]),
    ],
    3: [
        ("Lesson 11: Move Around", "Verbs of movement", "🏃", [
            ("move", "Please ___ your chair.", "请挪一下你的椅子。"),
            ("climb", "We ___ the hill.", "我们爬山。"),
            ("fly", "Birds ___ in the sky.", "鸟在天上飞。"),
            ("swim", "I ___ in the pool.", "我在游泳池游泳。"),
            ("drive", "My father can ___ a car.", "我爸爸会开车。"),
        ]),
        ("Lesson 12: Come & Go", "Arriving, leaving and following", "🚶", [
            ("arrive", "We ___ at six.", "我们六点到。"),
            ("leave", "The train will ___ soon.", "火车很快要开了。"),
            ("return", "I ___ home at five.", "我五点回家。"),
            ("follow", "Please ___ me.", "请跟着我。"),
            ("cross", "___ the street carefully.", "小心过马路。"),
        ]),
        ("Lesson 13: Hands & Objects", "Verbs for using your hands", "✋", [
            ("carry", "I ___ the bag.", "我提着包。"),
            ("hold", "___ my hand, please.", "请握住我的手。"),
            ("drop", "Don't ___ the glass.", "别把杯子掉了。"),
            ("pick", "___ a book from the shelf.", "从书架上挑一本书。"),
            ("throw", "___ the ball to me.", "把球扔给我。"),
        ]),
        ("Lesson 14: Make & Break", "Making, drawing and fixing", "🔨", [
            ("build", "They ___ a new house.", "他们盖一栋新房子。"),
            ("break", "Don't ___ the cup.", "别打碎杯子。"),
            ("draw", "I ___ a cat.", "我画一只猫。"),
            ("paint", "She ___ the wall white.", "她把墙刷成白色。"),
            ("fix", "Can you ___ my bike?", "你能修我的自行车吗？"),
        ]),
        ("Lesson 15: Talking", "Ways of speaking", "💬", [
            ("ask", "I ___ a question.", "我问一个问题。"),
            ("talk", "We ___ about the film.", "我们聊那部电影。"),
            ("call", "___ me tonight.", "今晚给我打电话。"),
            ("shout", "Don't ___ in class.", "别在课堂上喊。"),
            ("reply", "Please ___ soon.", "请尽快回复。"),
        ]),
        ("Lesson 16: Thinking", "Verbs about the mind", "💭", [
            ("remember", "I ___ your name.", "我记得你的名字。"),
            ("forget", "Don't ___ your keys.", "别忘了钥匙。"),
            ("believe", "I ___ you.", "我相信你。"),
            ("guess", "Can you ___ the answer?", "你能猜出答案吗？"),
            ("hope", "I ___ it is sunny.", "我希望是晴天。"),
        ]),
        ("Lesson 17: Feelings as Verbs", "Caring, missing and enjoying", "❤️", [
            ("worry", "Don't ___ about me.", "别为我担心。"),
            ("care", "I ___ about my friends.", "我关心我的朋友。"),
            ("miss", "I ___ my family.", "我想念我的家人。"),
            ("wish", "I ___ for a new bike.", "我想要一辆新自行车。"),
            ("enjoy", "We ___ the party.", "我们玩得很开心。"),
        ]),
        ("Lesson 18: Meeting People", "Seeing friends and family", "🤝", [
            ("meet", "Let's ___ at six.", "我们六点见。"),
            ("invite", "I ___ my friends to dinner.", "我邀请朋友来吃饭。"),
            ("wait", "Please ___ here.", "请在这里等。"),
            ("share", "I ___ my food with him.", "我和他分享食物。"),
            ("visit", "We ___ our grandparents.", "我们去看望祖父母。"),
        ]),
        ("Lesson 19: Change", "Things changing over time", "🔄", [
            ("change", "I ___ my clothes.", "我换衣服。"),
            ("happen", "What did ___?", "发生了什么事？"),
            ("become", "He wants to ___ a doctor.", "他想成为医生。"),
            ("grow", "Plants ___ in spring.", "植物在春天生长。"),
            ("stay", "___ at home today.", "今天待在家里。"),
        ]),
        ("Lesson 20: More Actions", "Everyday action verbs", "🎯", [
            ("bring", "___ your book to class.", "把书带到课堂上来。"),
            ("catch", "Can you ___ the ball?", "你能接住球吗？"),
            ("choose", "___ one of these.", "从这些里选一个。"),
            ("spend", "I ___ ten yuan.", "我花了十元。"),
            ("lose", "Don't ___ your ticket.", "别把票弄丢了。"),
        ]),
    ],
    4: [
        ("Lesson 11: City Places", "Places around town", "🏙️", [
            ("bridge", "We walk over the ___.", "我们走过桥。"),
            ("corner", "The shop is on the ___.", "商店在拐角处。"),
            ("station", "I wait at the ___.", "我在车站等。"),
            ("building", "That ___ is very tall.", "那栋楼很高。"),
            ("zoo", "We see animals at the ___.", "我们在动物园看动物。"),
        ]),
        ("Lesson 12: Directions", "Left, right and position", "🧭", [
            ("left", "Turn ___ at the shop.", "在商店那里左转。"),
            ("right", "The bank is on your ___.", "银行在你右边。"),
            ("front", "The car is in ___ of the house.", "车在房子前面。"),
            ("behind", "The garden is ___ the house.", "花园在房子后面。"),
            ("between", "I sit ___ Tom and Anna.", "我坐在汤姆和安娜中间。"),
        ]),
        ("Lesson 13: Weather Words", "Describing the weather", "🌤️", [
            ("warm", "It is ___ in spring.", "春天很暖和。"),
            ("cool", "The evening is ___.", "傍晚很凉爽。"),
            ("dry", "The clothes are ___.", "衣服干了。"),
            ("wet", "My shoes are ___.", "我的鞋湿了。"),
            ("sunny", "It is a ___ day.", "今天是晴天。"),
        ]),
        ("Lesson 14: More Body", "Parts of the body", "🖐️", [
            ("hair", "She has long ___.", "她有长头发。"),
            ("face", "Wash your ___.", "洗脸。"),
            ("heart", "My ___ beats fast.", "我的心跳得很快。"),
            ("neck", "I wear a scarf around my ___.", "我脖子上围了围巾。"),
            ("knee", "My ___ hurts.", "我膝盖疼。"),
        ]),
        ("Lesson 15: More Clothes", "Clothes and accessories", "🧢", [
            ("sock", "I put on my ___.", "我穿上袜子。"),
            ("cap", "He wears a blue ___.", "他戴一顶蓝色帽子。"),
            ("jacket", "Take your ___.", "带上你的夹克。"),
            ("sweater", "This ___ is warm.", "这件毛衣很暖和。"),
            ("pocket", "My keys are in my ___.", "我的钥匙在口袋里。"),
        ]),
        ("Lesson 16: Time Units", "Hours, minutes and years", "⏰", [
            ("hour", "I wait for one ___.", "我等了一个小时。"),
            ("minute", "Please wait a ___.", "请等一分钟。"),
            ("second", "Just one ___, please.", "请稍等一秒。"),
            ("month", "We go there every ___.", "我们每个月去那里。"),
            ("year", "This ___ is almost over.", "这一年快结束了。"),
        ]),
        ("Lesson 17: Time Expressions", "Soon, later and already", "⌛", [
            ("soon", "See you ___.", "回头见。"),
            ("later", "I will call you ___.", "我晚点给你打电话。"),
            ("ago", "I saw him two days ___.", "我两天前见过他。"),
            ("already", "She is ___ here.", "她已经到了。"),
            ("yet", "Is dinner ready ___?", "晚饭好了吗？"),
        ]),
        ("Lesson 18: Describing", "Useful adjectives", "✨", [
            ("pretty", "The flower is ___.", "这朵花很漂亮。"),
            ("funny", "That story is ___.", "那个故事很好笑。"),
            ("quiet", "Please be ___.", "请安静。"),
            ("careful", "Be ___ with the knife.", "用刀要小心。"),
            ("lucky", "I am very ___.", "我很幸运。"),
        ]),
        ("Lesson 19: More Describing", "Easy, difficult and special", "🔎", [
            ("easy", "This question is ___.", "这道题很简单。"),
            ("difficult", "The work is ___.", "这份工作很难。"),
            ("different", "These two bags are ___.", "这两个包不一样。"),
            ("important", "This is an ___ day.", "这是重要的一天。"),
            ("special", "Today is a ___ day.", "今天是特别的一天。"),
        ]),
        ("Lesson 20: Position", "Inside, outside and beside", "📍", [
            ("inside", "Come ___ the house.", "进屋里来。"),
            ("outside", "The children play ___.", "孩子们在外面玩。"),
            ("above", "The picture is ___ the bed.", "画在床的上方。"),
            ("below", "The cat is ___ the table.", "猫在桌子下面。"),
            ("beside", "Sit ___ me.", "坐在我旁边。"),
        ]),
    ],
    5: [
        ("Lesson 11: In Nature", "Forests, lakes and hills", "🌳", [
            ("forest", "We walk in the ___.", "我们在森林里散步。"),
            ("lake", "The ___ is very blue.", "湖水很蓝。"),
            ("hill", "We climb the small ___.", "我们爬小山。"),
            ("grass", "The ___ is green.", "草是绿色的。"),
            ("leaf", "A ___ falls from the tree.", "一片叶子从树上落下。"),
        ]),
        ("Lesson 12: Party & Celebration", "Cakes, bells and drums", "🎉", [
            ("cake", "We eat ___ at the party.", "我们在聚会上吃蛋糕。"),
            ("candy", "The child likes ___.", "这个孩子喜欢糖果。"),
            ("party", "Come to my ___.", "来参加我的聚会。"),
            ("bell", "The ___ rings at nine.", "铃九点响。"),
            ("drum", "He plays the ___.", "他打鼓。"),
        ]),
        ("Lesson 13: Sports", "Ball sports and games", "⚽", [
            ("football", "They play ___ after school.", "他们放学后踢足球。"),
            ("basketball", "We play ___ in the park.", "我们在公园打篮球。"),
            ("baseball", "He likes ___.", "他喜欢棒球。"),
            ("tennis", "She plays ___ well.", "她网球打得好。"),
            ("volleyball", "We watch a ___ game.", "我们看一场排球比赛。"),
        ]),
        ("Lesson 14: At the Match", "Players, coaches and fans", "🏆", [
            ("player", "The ___ runs fast.", "这名运动员跑得很快。"),
            ("coach", "Our ___ gives us advice.", "教练给我们建议。"),
            ("match", "The ___ starts at three.", "比赛三点开始。"),
            ("fan", "I am a big ___ of this team.", "我是这个队的球迷。"),
            ("card", "The referee shows a red ___.", "裁判出示红牌。"),
        ]),
        ("Lesson 15: Seasons", "Spring, summer, autumn and winter", "🍂", [
            ("spring", "Flowers open in ___.", "花在春天开放。"),
            ("summer", "It is hot in ___.", "夏天很热。"),
            ("autumn", "Leaves fall in ___.", "秋天树叶落下。"),
            ("winter", "It snows in ___.", "冬天下雪。"),
            ("ice", "There is ___ on the lake.", "湖上有冰。"),
        ]),
        ("Lesson 16: Classroom", "Notebooks, rulers and pages", "📓", [
            ("notebook", "I write in my ___.", "我在笔记本上写。"),
            ("ruler", "Draw a line with a ___.", "用尺子画一条线。"),
            ("classroom", "Our ___ is bright.", "我们的教室很明亮。"),
            ("exercise", "Do this ___ at home.", "在家做这个练习。"),
            ("page", "Open your book at ___ ten.", "把书翻到第十页。"),
        ]),
        ("Lesson 17: House Parts", "Roofs, gates and yards", "🏠", [
            ("roof", "The cat is on the ___.", "猫在屋顶上。"),
            ("gate", "Please close the ___.", "请关上大门。"),
            ("step", "Be careful on the ___.", "台阶上小心。"),
            ("garage", "The car is in the ___.", "车在车库里。"),
            ("yard", "The children play in the ___.", "孩子们在院子里玩。"),
        ]),
        ("Lesson 18: Materials", "Wood, glass and plastic", "🪵", [
            ("wood", "The table is made of ___.", "这张桌子是木头做的。"),
            ("glass", "The cup is made of ___.", "这个杯子是玻璃做的。"),
            ("metal", "The key is ___.", "钥匙是金属的。"),
            ("plastic", "This bottle is ___.", "这个瓶子是塑料的。"),
            ("box", "Put it in the ___.", "把它放进盒子里。"),
        ]),
        ("Lesson 19: Food & Taste", "Sweet, fresh and hungry", "🍎", [
            ("sweet", "The apple is ___.", "这个苹果很甜。"),
            ("delicious", "The soup is ___.", "汤很好喝。"),
            ("fresh", "The bread is ___.", "面包很新鲜。"),
            ("hungry", "I am ___.", "我饿了。"),
            ("thirsty", "She is ___.", "她渴了。"),
        ]),
        ("Lesson 20: Final Mix", "Useful everyday adjectives", "✅", [
            ("true", "The story is ___.", "这个故事是真的。"),
            ("free", "The ticket is ___.", "这张票是免费的。"),
            ("full", "The glass is ___.", "杯子是满的。"),
            ("ready", "Are you ___?", "你准备好了吗？"),
            ("safe", "The children are ___ here.", "孩子们在这里很安全。"),
        ]),
    ],
}


def build_glosses():
    raw = json.loads(DICT_PATH.read_text(encoding="utf-8"))
    glosses = {}
    for item in raw:
        word = str(item.get("word", "")).lower().strip()
        if not word or word in glosses:
            continue
        text = str(item.get("definition_zh", "") or "")
        text = re.sub(r"^[a-z]+\.\s*", "", text)
        text = re.split(r"[,，;；]", text)[0].strip()
        text = re.sub(r"\s+", "", text)
        if text:
            glosses[word] = text
    glosses.update(ZH_OVERRIDE)
    return glosses


def render_lesson(title, desc, icon, color, rows, glosses):
    out = [
        "---\n",
        f'lessonTitle: "{title}"\n',
        f'description: "{desc}"\n',
        f'icon: "{icon}"\n',
        f'color: "{color}"\n',
        "---\n\n",
        "[matching-pairs]\npairs:\n",
    ]
    for word, _, _ in rows:
        out.append(f'  - "{word}" = "{glosses.get(word, word)}"\n')
    out.append("srsWords: " + " ".join(f'"{w}"' for w, _, _ in rows) + "\n")
    for word, sentence, translation in rows:
        blank = word.capitalize() if sentence.startswith("___") else word
        out.append(
            f'\n[fill-in-the-blank]\n'
            f'sentence: "{sentence}"\n'
            f'blank: "{blank}"\n'
            f'translation: "{translation}"\n'
            f'srsWords: "{word}"\n'
        )
    out.append("\n")
    return "".join(out)


def main():
    glosses = build_glosses()
    for unit_no, lessons in UNITS.items():
        path = ROOT / "content" / f"a1-fill-in-the-blank-unit-{unit_no}.md"
        text = path.read_text(encoding="utf-8")
        if 'lessonTitle: "Lesson 11:' in text:
            print(f"unit {unit_no}: already extended, skipped")
            continue
        chunks = [
            render_lesson(title, desc, icon, COLORS[i % len(COLORS)], rows, glosses)
            for i, (title, desc, icon, rows) in enumerate(lessons)
        ]
        with path.open("a", encoding="utf-8") as f:
            f.write("\n" + "".join(chunks).rstrip() + "\n")
        print(f"unit {unit_no}: appended {len(lessons)} lessons")


if __name__ == "__main__":
    main()
